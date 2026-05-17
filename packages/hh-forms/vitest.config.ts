import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// ReScript-generated `.res.mjs` files import the JSONLogic engine via
// deep paths like `@nd/jsonlogic/src/JsonLogic.res.mjs`. The vendored
// package's exports map only exposes the package root, so Vite's
// strict-exports resolution rejects the import. The vendor package is
// off-limits to edit (a fix exists upstream), so map the deep path to
// the vendored file directly for the test runner.
const vendoredJsonLogic = fileURLToPath(
  new URL("../../vendor/@nd/jsonlogic", import.meta.url),
);

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: [
      {
        find: /^@nd\/jsonlogic\/(.*)$/,
        replacement: `${vendoredJsonLogic}/$1`,
      },
    ],
  },
});
