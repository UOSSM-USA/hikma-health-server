import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  ColumnType,
  Generated,
  Selectable,
  Insertable,
  Updateable,
} from "kysely";
import { createServerOnlyFn } from "@tanstack/react-start";
import db from "@/db";

/**
 * Time-boxed, revocable capability tokens for credentials that travel outside a
 * session — a link in an exported spreadsheet, a shared URL.
 *
 * A grant never widens authorization: it only says which user is acting, and
 * the route it is presented to still runs that user's own permission checks.
 * Scope is enforced by `resolve` rather than by the call site, so a token that
 * leaks from one feature cannot be replayed against another.
 */
namespace AccessGrant {
  /** Adding a capability means adding an entry here and to SCOPE_EXPIRY_DAYS_MAX. */
  export const SCOPES = {
    /** Read event-form attachments. Never accepted by an upload or delete route. */
    EVENT_FORM_ATTACHMENTS_READ: "event_form_attachments:read",
  } as const;

  export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

  const SCOPE_EXPIRY_DAYS_MAX: Record<Scope, number> = {
    [SCOPES.EVENT_FORM_ATTACHMENTS_READ]: 30,
  };

  export const EXPIRY_DAYS_MIN = 1;

  const TOKEN_BYTES = 32;

  export namespace Table {
    export const name = "access_grants" as const;

    export const columns = {
      id: "id",
      token_hash: "token_hash",
      scope: "scope",
      subject_id: "subject_id",
      created_by_user_id: "created_by_user_id",
      description: "description",
      expires_at: "expires_at",
      revoked_at: "revoked_at",
      created_at: "created_at",
    };

    export type T = {
      id: Generated<string>;
      token_hash: string;
      scope: string;
      subject_id: string | null;
      created_by_user_id: string;
      description: string | null;
      expires_at: ColumnType<Date, Date | string, Date | string>;
      revoked_at: ColumnType<
        Date | null,
        Date | string | null | undefined,
        Date | string
      >;
      created_at: Generated<ColumnType<Date, string | undefined, never>>;
    };

    export type AccessGrants = Selectable<T>;
    export type NewAccessGrant = Insertable<T>;
    export type AccessGrantUpdate = Updateable<T>;
  }

  export type Resolved = {
    id: string;
    scope: Scope;
    subjectId: string | null;
    userId: string;
    expiresAt: Date;
  };

  export type Minted = {
    id: string;
    token: string;
    expiresAt: Date;
  };

  export const expiryDaysMax = (scope: Scope): number =>
    SCOPE_EXPIRY_DAYS_MAX[scope];

  /** Malformed input shortens a grant's life rather than throwing or extending it. */
  export const clampExpiryDays = (scope: Scope, days: number): number => {
    if (!Number.isFinite(days)) return EXPIRY_DAYS_MIN;
    const whole = Math.floor(days);
    if (whole < EXPIRY_DAYS_MIN) return EXPIRY_DAYS_MIN;
    const max = expiryDaysMax(scope);
    return whole > max ? max : whole;
  };

  const hashToken = (token: string): string =>
    createHash("sha256").update(token, "utf8").digest("hex");

  const digestsMatch = (left: string, right: string): boolean => {
    if (left.length !== right.length) return false;
    return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
  };

  /**
   * Issue a grant. Only the digest is stored, so the returned plaintext token
   * is the one and only copy. `expiryDays` is clamped here, not by the caller.
   */
  export const mint = createServerOnlyFn(
    async (params: {
      scope: Scope;
      userId: string;
      expiryDays: number;
      subjectId?: string | null;
      description?: string | null;
    }): Promise<Minted> => {
      const token = randomBytes(TOKEN_BYTES).toString("base64url");
      const days = clampExpiryDays(params.scope, params.expiryDays);
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      const row = await db
        .insertInto(Table.name)
        .values({
          token_hash: hashToken(token),
          scope: params.scope,
          subject_id: params.subjectId ?? null,
          created_by_user_id: params.userId,
          description: params.description ?? null,
          expires_at: expiresAt.toISOString(),
        })
        .returning(["id"])
        .executeTakeFirstOrThrow();

      return { id: row.id, token, expiresAt };
    },
  );

  export type StoredGrant = {
    id: string;
    token_hash: string;
    scope: string;
    subject_id: string | null;
    created_by_user_id: string;
    expires_at: Date | string;
    revoked_at: Date | string | null;
  };

  /**
   * Whether a stored grant may be honoured. Pure, so every rejection branch is
   * testable without a database or a real clock. Every negative case returns
   * null alike, so a caller cannot probe for which grants exist.
   */
  export const evaluateStoredGrant = (
    row: StoredGrant | undefined | null,
    required: { scope: Scope; subjectId?: string | null; digest: string },
    now: number,
  ): Resolved | null => {
    if (!row) return null;
    if (!digestsMatch(row.token_hash, required.digest)) return null;
    if (row.scope !== required.scope) return null;
    if (row.revoked_at !== null) return null;
    if (new Date(row.expires_at).getTime() <= now) return null;

    // A null subject_id is unnarrowed, not "matches nothing".
    if (row.subject_id !== null && row.subject_id !== required.subjectId) {
      return null;
    }

    return {
      id: row.id,
      scope: row.scope as Scope,
      subjectId: row.subject_id,
      userId: row.created_by_user_id,
      expiresAt: new Date(row.expires_at),
    };
  };

  /** Resolve a plaintext token to a live grant of the required scope, or null. */
  export const resolve = createServerOnlyFn(
    async (
      token: string,
      required: { scope: Scope; subjectId?: string | null },
    ): Promise<Resolved | null> => {
      if (!token) return null;

      const digest = hashToken(token);
      const row = await db
        .selectFrom(Table.name)
        .select([
          "id",
          "token_hash",
          "scope",
          "subject_id",
          "created_by_user_id",
          "expires_at",
          "revoked_at",
        ])
        .where("token_hash", "=", digest)
        .where("scope", "=", required.scope)
        .executeTakeFirst();

      return evaluateStoredGrant(row, { ...required, digest }, Date.now());
    },
  );

  /** SHA-256 of a plaintext token, as stored in `token_hash`. */
  export const digestOf = (token: string): string => hashToken(token);

  /** Idempotent: an already-revoked grant keeps its first timestamp. */
  export const revoke = createServerOnlyFn(
    async (id: string): Promise<void> => {
      await db
        .updateTable(Table.name)
        .set({ revoked_at: new Date().toISOString() })
        .where("id", "=", id)
        .where("revoked_at", "is", null)
        .execute();
    },
  );

  export const revokeAllForUser = createServerOnlyFn(
    async (userId: string, scope?: Scope): Promise<void> => {
      let query = db
        .updateTable(Table.name)
        .set({ revoked_at: new Date().toISOString() })
        .where("created_by_user_id", "=", userId)
        .where("revoked_at", "is", null);

      if (scope) {
        query = query.where("scope", "=", scope);
      }

      await query.execute();
    },
  );

  /** Newest first. Never selects `token_hash`; no read path exposes the credential. */
  export const listLiveForUser = createServerOnlyFn(
    async (
      userId: string,
    ): Promise<
      Array<{
        id: string;
        scope: string;
        subject_id: string | null;
        description: string | null;
        expires_at: Date;
        created_at: Date;
      }>
    > => {
      return db
        .selectFrom(Table.name)
        .select([
          "id",
          "scope",
          "subject_id",
          "description",
          "expires_at",
          "created_at",
        ])
        .where("created_by_user_id", "=", userId)
        .where("revoked_at", "is", null)
        .where("expires_at", ">", new Date())
        .orderBy("created_at", "desc")
        .execute();
    },
  );
}

export default AccessGrant;
