import { describe, expect, it, vi, afterEach } from "vitest";
import { format } from "date-fns";

import {
  calculateAge,
  civilDateFromInstant,
  civilDateFromLocalDate,
  parseCivilDate,
} from "@/lib/utils";

/**
 * A `Date` carrying a civil date is in one of two frames, and reading it in the
 * wrong one shifts the day off UTC — see the frame note in `@/lib/utils`. These
 * pin each reader against the frame it exists for.
 */
describe("civilDateFromLocalDate", () => {
  it("recovers the calendar date from a pg-style local-midnight Date", () => {
    expect(civilDateFromLocalDate(new Date(2000, 0, 15))).toBe("2000-01-15");
    expect(civilDateFromLocalDate(new Date(2000, 1, 1))).toBe("2000-02-01");
    expect(civilDateFromLocalDate(new Date(1999, 11, 31))).toBe("1999-12-31");
    expect(civilDateFromLocalDate(new Date(2024, 1, 29))).toBe("2024-02-29");
  });

  it("does not shift the day the way toISOString would", () => {
    const localMidnight = new Date(2000, 0, 15);
    expect(civilDateFromLocalDate(localMidnight)).toBe("2000-01-15");

    // A negative offset is east of UTC, where local midnight is the previous
    // day in UTC and toISOString loses it. TZ=Africa/Nairobi exercises this.
    if (localMidnight.getTimezoneOffset() < 0) {
      expect(localMidnight.toISOString().slice(0, 10)).not.toBe("2000-01-15");
    }
  });

  it("survives a Date carrying a wall-clock time", () => {
    expect(civilDateFromLocalDate(new Date(2000, 0, 15, 20, 30))).toBe(
      "2000-01-15",
    );
    expect(civilDateFromLocalDate(new Date(2000, 0, 15, 0, 1))).toBe(
      "2000-01-15",
    );
  });
});

describe("civilDateFromInstant", () => {
  it("reads a JSON-origin Date in UTC, matching the toISOString that made it", () => {
    // What a client-supplied `new Date("1990-01-01")` looks like after JSON
    // transport. Local getters would lose a day west of UTC.
    expect(civilDateFromInstant(new Date("1990-01-01"))).toBe("1990-01-01");
    expect(civilDateFromInstant(new Date("2000-01-15T00:00:00.000Z"))).toBe(
      "2000-01-15",
    );
  });

  it("reads an ISO instant string in UTC", () => {
    expect(civilDateFromInstant("2000-01-15T00:00:00.000Z")).toBe(
      "2000-01-15",
    );
  });
});

describe("both readers", () => {
  const readers = [
    ["pg", civilDateFromLocalDate] as const,
    ["client", civilDateFromInstant] as const,
  ];

  it.each(readers)(
    "%s: passes an existing YYYY-MM-DD string through untouched",
    (_name, read) => {
      expect(read("2000-01-15")).toBe("2000-01-15");
      expect(read("  2000-01-15  ")).toBe("2000-01-15");
      expect(read("1990-01-01")).toBe("1990-01-01");
    },
  );

  it.each(readers)("%s: maps absent and unusable values to null", (_n, read) => {
    expect(read(null)).toBeNull();
    expect(read(undefined)).toBeNull();
    expect(read("")).toBeNull();
    expect(read("   ")).toBeNull();
    expect(read("not-a-date")).toBeNull();
    expect(read(new Date(NaN))).toBeNull();
  });
});

describe("parseCivilDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses YYYY-MM-DD to local midnight on the stated day", () => {
    const d = parseCivilDate("2002-02-02")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2002, 1, 2]);
    expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
  });

  it("formats back to the day that was stored", () => {
    for (const stored of ["2002-02-02", "2000-01-15", "1999-12-31"]) {
      expect(format(parseCivilDate(stored)!, "yyyy-MM-dd")).toBe(stored);
    }
  });

  it("round-trips with civilDateFromLocalDate", () => {
    for (const stored of ["2002-02-02", "2024-02-29", "1999-12-31"]) {
      expect(civilDateFromLocalDate(parseCivilDate(stored))).toBe(stored);
    }
  });

  it("passes a Date through and rejects unusable input", () => {
    const now = new Date(2002, 1, 2, 13, 45);
    expect(parseCivilDate(now)).toBe(now);
    expect(parseCivilDate(null)).toBeNull();
    expect(parseCivilDate(undefined)).toBeNull();
    expect(parseCivilDate("")).toBeNull();
    expect(parseCivilDate("not-a-date")).toBeNull();
    // Overflow must not silently roll into another month.
    expect(parseCivilDate("2024-13-45")).toBeNull();
  });

  it("keeps calculateAge off the UTC boundary", () => {
    vi.useFakeTimers();
    // 23:00 local the day before the 24th birthday. A UTC parse lands the DOB
    // a day early west of UTC and reports 24.
    vi.setSystemTime(new Date(2024, 0, 14, 23, 0));
    expect(calculateAge("2000-01-15")).toMatch(/^23 years/);
    expect(calculateAge("2000-01-15")).toBe(calculateAge(new Date(2000, 0, 15)));
  });
});
