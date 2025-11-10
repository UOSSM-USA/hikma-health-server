/**
 * Server functions for managing user settings and preferences
 */

import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { permissionsMiddleware } from "@/middleware/auth";
import db from "@/db";
import User from "@/models/user";
import Token from "@/models/token";
import { Option } from "effect";
import { sql } from "kysely";
import type { Language } from "@/lib/i18n/translations";

/**
 * Get user's language preference from metadata
 */
export const getUserLanguagePreference = createServerFn({ method: "GET" })
  .validator(() => ({}))
  .handler(async (): Promise<Language | null> => {
    const tokenCookie = getCookie("token");
    if (!tokenCookie) return null;

    const userOption = await Token.getUser(tokenCookie);
    const userId = Option.match(userOption, {
      onNone: () => null,
      onSome: (user) => user.id,
    });

    if (!userId) return null;

    const user = await db
      .selectFrom(User.Table.name)
      .select(["metadata"])
      .where("id", "=", userId)
      .executeTakeFirst();

    if (!user || !user.metadata) return null;

    const metadata = typeof user.metadata === "string"
      ? JSON.parse(user.metadata)
      : user.metadata;

    return metadata?.preferredLanguage || null;
  });

/**
 * Update user's language preference in metadata
 */
export const updateUserLanguagePreference = createServerFn({ method: "POST" })
  .middleware([permissionsMiddleware])
  .validator((input: { data: { language: Language } } | { language: Language }) => {
    // Handle both calling patterns: { data: { language } } or { language }
    const data = "data" in input ? input.data : input;
    
    // Validate the data structure
    if (!data || typeof data !== "object") {
      throw new Error("Language data is required");
    }
    if (!("language" in data)) {
      throw new Error("Invalid data format. Expected: { language: 'en' | 'ar' }");
    }
    if (data.language !== "en" && data.language !== "ar") {
      throw new Error(`Invalid language. Expected 'en' or 'ar', received: ${data.language}`);
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<boolean> => {
    const { language } = data;
    const userId = context.userId;

    if (!userId) {
      throw new Error("User not authenticated");
    }

    try {
      // Get current metadata
      const user = await db
        .selectFrom(User.Table.name)
        .select(["metadata"])
        .where("id", "=", userId)
        .executeTakeFirst();

      if (!user) {
        throw new Error("User not found");
      }

      // Parse existing metadata or use empty object
      const currentMetadata =
        typeof user.metadata === "string"
          ? JSON.parse(user.metadata || "{}")
          : user.metadata || {};

      // Update language preference
      const updatedMetadata = {
        ...currentMetadata,
        preferredLanguage: language,
      };

      // Update user metadata
      await db
        .updateTable(User.Table.name)
        .set({
          metadata: sql`${JSON.stringify(updatedMetadata)}::jsonb`,
          updated_at: sql`now()`,
          last_modified: sql`now()`,
        })
        .where("id", "=", userId)
        .execute();

      return true;
    } catch (error: any) {
      // Check if error is due to missing column
      if (error?.message?.includes("column") && error?.message?.includes("metadata")) {
        throw new Error(
          "Database migration required: Please run 'pnpm run db:migrate' to add the metadata column to the users table"
        );
      }
      throw error;
    }
  });

