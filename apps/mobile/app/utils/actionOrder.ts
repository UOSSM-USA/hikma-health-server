/**
 * Resolve an admin-configured order + visibility list against a registry of
 * known actions.
 *
 * Resolution rules, in order:
 *   1. Known ids in the config render in configured order, honouring `visible`
 *      (a missing `visible` counts as visible).
 *   2. Known ids the config omits are appended in registry order, visible — so
 *      a newly shipped action is not invisible on devices with a saved config.
 *   3. Unknown ids are dropped, so a newer server config cannot break an older
 *      build.
 *   4. A missing, non-array or empty config falls back to the full registry,
 *      all visible. The admin UI cannot author an empty array — hiding
 *      everything writes N `visible: false` entries — so empty only ever means
 *      corruption. A valid all-hidden config is honoured and renders nothing.
 *   5. Permission always wins: an action whose `permission` the user lacks is
 *      dropped whatever the config says. Config can hide, never reveal.
 */
export type ActionOrderEntry = {
  id: string
  visible?: boolean
}

const isEntry = (value: unknown): value is ActionOrderEntry =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { id?: unknown }).id === "string"

export function resolveActionOrder<T extends { id: string; permission?: string }>(
  registry: readonly T[],
  raw: unknown,
  can: (permission: string) => boolean,
): T[] {
  const permitted = registry.filter((def) => def.permission === undefined || can(def.permission))

  const entries = Array.isArray(raw) ? raw.filter(isEntry) : []
  if (entries.length === 0) return [...permitted]

  const byId = new Map(permitted.map((def) => [def.id, def]))
  const result: T[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    // Unknown id, or one the user has no permission for.
    const def = byId.get(entry.id)
    if (def === undefined) continue
    if (entry.visible === false) continue
    result.push(def)
  }

  for (const def of permitted) {
    if (!seen.has(def.id)) result.push(def)
  }

  return result
}
