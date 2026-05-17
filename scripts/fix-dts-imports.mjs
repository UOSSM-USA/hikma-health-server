// Post-process the `.gen.d.ts` files emitted by tsc.
//
// genType emits relative imports without extensions (`from './X.gen'`),
// which is fine under `moduleResolution: bundler` but fails under
// `moduleResolution: nodenext` because extensions are mandatory there.
// Rewriting to `'./X.gen.js'` makes nodenext resolve to `./X.gen.d.ts`
// (TS's `.js` ↔ `.d.ts` pairing) while staying valid under bundler.
//
// Type-only imports have no runtime effect, so the `.js` suffix is
// purely a TS resolution hint — no runtime file at that path is needed.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = "src";
const rewrite = /from '(\.\/[A-Za-z_]+\.gen)'/g;

const targets = readdirSync(dir).filter((f) => f.endsWith(".gen.d.ts"));

for (const name of targets) {
  const path = join(dir, name);
  const before = readFileSync(path, "utf8");
  const after = before.replace(rewrite, "from '$1.js'");
  if (after !== before) writeFileSync(path, after);
}
