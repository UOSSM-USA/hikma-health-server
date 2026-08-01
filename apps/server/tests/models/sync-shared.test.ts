import { describe, it, expect } from "vitest";
import {
  resolveEntitiesForPeer,
  applyClinicScope,
  CLINIC_COLUMN_BY_TABLE,
  EXEMPT_FROM_HISTORY_LIMIT,
} from "@/models/sync-shared";

describe("resolveEntitiesForPeer", () => {
  it("gives hub peers a superset of what mobile peers receive", () => {
    const mobile = resolveEntitiesForPeer("android", "push").map(
      (e) => e.Table.name,
    );
    const hub = resolveEntitiesForPeer("sync_hub", "push").map(
      (e) => e.Table.name,
    );
    for (const name of mobile) expect(hub).toContain(name);
    expect(hub.length).toBeGreaterThan(mobile.length);
  });

  it("treats an unknown peer type as mobile", () => {
    const unknown = resolveEntitiesForPeer("unknown", "push").map(
      (e) => e.Table.name,
    );
    const mobile = resolveEntitiesForPeer("android", "push").map(
      (e) => e.Table.name,
    );
    expect(unknown).toEqual(mobile);
  });

  it("accepts a narrower entity set from mobile than it sends", () => {
    const sends = resolveEntitiesForPeer("android", "push").length;
    const accepts = resolveEntitiesForPeer("android", "pull").length;
    expect(accepts).toBeLessThan(sends);
  });
});

describe("applyClinicScope", () => {
  const spy = () => {
    const calls: unknown[][] = [];
    const q = {
      where: (...args: unknown[]) => {
        calls.push(args);
        return q;
      },
      calls,
    };
    return q;
  };

  it("returns the query untouched when clinicIds is null", () => {
    const q = spy();
    applyClinicScope(q, "visits", null);
    expect(q.calls).toHaveLength(0);
  });

  it("returns the query untouched for an empty clinic list", () => {
    const q = spy();
    applyClinicScope(q, "visits", []);
    expect(q.calls).toHaveLength(0);
  });

  it("filters clinics by id directly", () => {
    const q = spy();
    applyClinicScope(q, "clinics", ["c1"]);
    expect(q.calls[0]).toEqual(["id", "in", ["c1"]]);
  });

  it("filters a table with a simple clinic column", () => {
    const q = spy();
    applyClinicScope(q, "visits", ["c1"]);
    expect(q.calls[0]).toEqual([CLINIC_COLUMN_BY_TABLE.visits, "in", ["c1"]]);
  });

  it("leaves tables with no clinic association unfiltered", () => {
    const q = spy();
    applyClinicScope(q, "events", ["c1"]);
    expect(q.calls).toHaveLength(0);
  });
});

describe("EXEMPT_FROM_HISTORY_LIMIT", () => {
  it("covers both the server and mobile names for registration forms", () => {
    expect(EXEMPT_FROM_HISTORY_LIMIT).toContain("patient_registration_forms");
    expect(EXEMPT_FROM_HISTORY_LIMIT).toContain("registration_forms");
  });
});
