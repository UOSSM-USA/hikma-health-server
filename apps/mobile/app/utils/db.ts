const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

/**
 * Sanitizer for `@json` metadata columns: the value as an object, or `{}` for
 * anything that is not one.
 *
 * `@json` stringifies whatever this returns and hands the same value back on
 * read, so returning a string would double-encode the column. The second parse
 * recovers columns already stored that way.
 */
export function sanitizeMetadata(raw: unknown): Record<string, unknown> {
  const parsed = typeof raw === "string" ? parseJson(raw) : raw

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {}
  }

  return parsed as Record<string, unknown>
}
