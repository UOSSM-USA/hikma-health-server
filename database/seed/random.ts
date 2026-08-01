// Seeded pseudo-randomness for the test-data seeder. Every value the seeder
// writes derives from one `Rng`, so a run is fully reproducible from its seed.
// Nothing here is cryptographically strong and nothing here may be used for
// tokens, salts, or keys.

export type Rng = () => number;

// mulberry32 — small, fast, and good enough for fixture data.
export const createRng = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Inclusive on both ends.
export const intBetween = (rng: Rng, min: number, max: number): number => {
  if (max < min) throw new Error(`intBetween: max ${max} below min ${min}`);
  return min + Math.floor(rng() * (max - min + 1));
};

export const floatBetween = (
  rng: Rng,
  min: number,
  max: number,
  decimals: number,
): number => {
  const value = min + rng() * (max - min);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export const chance = (rng: Rng, probability: number): boolean =>
  rng() < probability;

export const pick = <T>(rng: Rng, items: readonly T[]): T => {
  if (items.length === 0) throw new Error("pick: empty pool");
  return items[Math.floor(rng() * items.length)] as T;
};

// Sample without replacement. Returns fewer items than asked only when the
// pool itself is smaller.
export const pickSome = <T>(
  rng: Rng,
  items: readonly T[],
  count: number,
): T[] => {
  const wanted = Math.min(count, items.length);
  const pool = [...items];
  const chosen: T[] = [];
  for (let taken = 0; taken < wanted; taken += 1) {
    const index = Math.floor(rng() * pool.length);
    chosen.push(pool[index] as T);
    pool.splice(index, 1);
  }
  return chosen;
};

export const dateBetween = (rng: Rng, start: Date, end: Date): Date =>
  new Date(
    start.getTime() + Math.floor(rng() * (end.getTime() - start.getTime())),
  );

export const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * 86_400_000);

export const addMinutes = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60_000);

// Clamps to `ceiling` so generated audit trails never claim a future edit.
export const laterThan = (
  rng: Rng,
  start: Date,
  maxDays: number,
  ceiling: Date,
): Date => {
  const shifted = addDays(start, floatBetween(rng, 0, maxDays, 4));
  return shifted > ceiling ? ceiling : shifted;
};

// RFC 4122 v4 layout drawn from `rng` rather than a CSPRNG — reproducibility is
// the point, and these only ever identify fixture rows.
export const uuid = (rng: Rng): string => {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    bytes[index] = Math.floor(rng() * 256);
  }
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
};

export const hexString = (rng: Rng, length: number): string => {
  let out = "";
  while (out.length < length) {
    out += Math.floor(rng() * 0xffffffff)
      .toString(16)
      .padStart(8, "0");
  }
  return out.slice(0, length);
};

// Form-builder field ids in this codebase are nanoid-shaped, not uuids.
const NANO_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

export const nanoId = (rng: Rng, length = 21): string => {
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += NANO_ALPHABET[Math.floor(rng() * NANO_ALPHABET.length)];
  }
  return out;
};
