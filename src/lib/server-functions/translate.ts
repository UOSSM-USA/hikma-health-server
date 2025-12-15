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

      if (!endpoint || !key || !region) {
        throw new Error("Azure Translator env vars are not configured");
      }

      const from = data.from || "ar";
      const to = data.to || "en";

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

        throw new Error(`Azure translate failed: ${res.status} ${body}`);
      }

      const json: any = await res.json();
      const translated = json?.[0]?.translations?.[0]?.text ?? "";
      return { translated };
    }),
  );

