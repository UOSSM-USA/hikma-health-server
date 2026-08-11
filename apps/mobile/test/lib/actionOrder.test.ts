import { resolveActionOrder } from "@/utils/actionOrder"

type Def = { id: string; permission?: string }

const REGISTRY: Def[] = [
  { id: "visit_history" },
  { id: "prescriptions" },
  { id: "vitals" },
  { id: "diagnoses" },
]

const allow = () => true
const ids = (defs: Def[]) => defs.map((d) => d.id)

describe("resolveActionOrder", () => {
  it("falls back to the registry order when there is no config", () => {
    expect(ids(resolveActionOrder(REGISTRY, null, allow))).toEqual([
      "visit_history",
      "prescriptions",
      "vitals",
      "diagnoses",
    ])
  })

  it("falls back to the registry order when the config is not an array", () => {
    expect(ids(resolveActionOrder(REGISTRY, "garbage", allow))).toEqual(ids(REGISTRY))
    expect(ids(resolveActionOrder(REGISTRY, { id: "vitals" }, allow))).toEqual(ids(REGISTRY))
  })

  it("falls back to the registry order when the config is an empty array", () => {
    // The admin UI cannot author an empty array — hiding everything writes four
    // `visible: false` entries — so empty only ever means corruption.
    expect(ids(resolveActionOrder(REGISTRY, [], allow))).toEqual(ids(REGISTRY))
  })

  it("applies the configured order", () => {
    const config = [
      { id: "vitals", visible: true },
      { id: "diagnoses", visible: true },
      { id: "visit_history", visible: true },
      { id: "prescriptions", visible: true },
    ]
    expect(ids(resolveActionOrder(REGISTRY, config, allow))).toEqual([
      "vitals",
      "diagnoses",
      "visit_history",
      "prescriptions",
    ])
  })

  it("drops entries marked not visible", () => {
    const config = [
      { id: "vitals", visible: false },
      { id: "diagnoses", visible: true },
      { id: "visit_history", visible: false },
      { id: "prescriptions", visible: true },
    ]
    expect(ids(resolveActionOrder(REGISTRY, config, allow))).toEqual([
      "diagnoses",
      "prescriptions",
    ])
  })

  it("honours a config that hides every action", () => {
    const config = REGISTRY.map((d) => ({ id: d.id, visible: false }))
    expect(resolveActionOrder(REGISTRY, config, allow)).toEqual([])
  })

  it("appends known ids the config omits, in registry order, visible", () => {
    // A fifth action shipping to devices that already have a saved four-entry
    // config.
    const config = [{ id: "diagnoses", visible: true }]
    expect(ids(resolveActionOrder(REGISTRY, config, allow))).toEqual([
      "diagnoses",
      "visit_history",
      "prescriptions",
      "vitals",
    ])
  })

  it("ignores unknown ids so a newer server config cannot break an older build", () => {
    const config = [
      { id: "teleconsult", visible: true },
      { id: "vitals", visible: true },
    ]
    expect(ids(resolveActionOrder(REGISTRY, config, allow))).toEqual([
      "vitals",
      "visit_history",
      "prescriptions",
      "diagnoses",
    ])
  })

  it("ignores malformed entries", () => {
    const config = [null, { visible: true }, "vitals", { id: "vitals", visible: true }]
    expect(ids(resolveActionOrder(REGISTRY, config, allow))).toEqual([
      "vitals",
      "visit_history",
      "prescriptions",
      "diagnoses",
    ])
  })

  it("treats a missing `visible` as visible", () => {
    const config = [{ id: "vitals" }]
    expect(ids(resolveActionOrder(REGISTRY, config, allow))).toContain("vitals")
  })

  it("lets a denied permission override visible: true", () => {
    const gated: Def[] = [{ id: "vitals", permission: "vitals:view" }, { id: "diagnoses" }]
    const config = [
      { id: "vitals", visible: true },
      { id: "diagnoses", visible: true },
    ]
    const can = (p: string) => p !== "vitals:view"
    expect(ids(resolveActionOrder(gated, config, can))).toEqual(["diagnoses"])
  })

  it("applies permission denial to the defaults path too", () => {
    const gated: Def[] = [{ id: "vitals", permission: "vitals:view" }, { id: "diagnoses" }]
    const can = (p: string) => p !== "vitals:view"
    expect(ids(resolveActionOrder(gated, null, can))).toEqual(["diagnoses"])
  })
})
