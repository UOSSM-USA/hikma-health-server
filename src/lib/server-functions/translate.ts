import { createServerFn } from "@tanstack/react-start";
import * as Sentry from "@sentry/tanstackstart-react";

type TranslatePayload = {
  text: string;
  from?: string;
  to?: string;
};

export const translateText = createServerFn({ method: "POST" })
  .validator((data: TranslatePayload) => data)
  .handler(async ({ data }) =>
    Sentry.startSpan({ name: "azure-translate-text" }, async () => {
      const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT;
      const key = process.env.AZURE_TRANSLATOR_KEY;
      const region = process.env.AZURE_TRANSLATOR_REGION;

      // If Azure credentials are not configured, return original text without error
      if (!endpoint || !key || !region) {
        console.warn("Azure Translator env vars are not configured, returning original text");
        return { translated: data.text, error: "not_configured" as const };
      }

      const from = data.from || "ar";
      const to = data.to || "en";

      try {
        const res = await fetch(
          `${endpoint}/translate?api-version=3.0&from=${from}&to=${to}`,
          {
            method: "POST",
            headers: {
              "Ocp-Apim-Subscription-Key": key,
              "Ocp-Apim-Subscription-Region": region,
              "Content-Type": "application/json",
            },
            body: JSON.stringify([{ Text: data.text }]),
          },
        );

        if (!res.ok) {
          const body = await res.text();

          // If we are rate limited (429), fall back gracefully without throwing,
          // so the UI can continue to work and just show the original text.
          if (res.status === 429) {
            Sentry.captureMessage("Azure translate rate-limited (429)", {
              level: "warning",
              extra: { body },
            });
            return { translated: data.text, error: "rate_limited" as const };
          }

          // If unauthorized (401), return original text without throwing
          // This allows the app to continue working even if Azure credentials are invalid
          if (res.status === 401) {
            console.warn("Azure Translator unauthorized (401), returning original text");
            Sentry.captureMessage("Azure translate unauthorized (401)", {
              level: "warning",
              extra: { body },
            });
            return { translated: data.text, error: "unauthorized" as const };
          }

          // For other errors, log but still return original text to prevent breaking the UI
          console.error(`Azure translate failed: ${res.status} ${body}`);
          Sentry.captureMessage(`Azure translate failed: ${res.status}`, {
            level: "error",
            extra: { body },
          });
          return { translated: data.text, error: "translation_failed" as const };
        }

        const json: any = await res.json();
        const translated = json?.[0]?.translations?.[0]?.text ?? "";
        return { translated };
      } catch (error) {
        // Catch any network or other errors and return original text
        console.error("Azure translate error:", error);
        Sentry.captureException(error);
        return { translated: data.text, error: "translation_error" as const };
      }
    }),
  );

