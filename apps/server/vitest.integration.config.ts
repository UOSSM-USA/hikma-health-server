import { defineConfig } from "vitest/config";
import { resolve } from "path";

// Mirrors the unit config's deep-import alias for `@nd/jsonlogic`: the
// vendored package's exports map only exposes the root, but the generated
// `.res.mjs` files in `@hikmahealth/forms` deep-import
// `@nd/jsonlogic/src/JsonLogic.res.mjs`. See vitest.config.ts for the
// full rationale.
const vendoredJsonLogic = resolve(__dirname, "../../vendor/@nd/jsonlogic");

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globals: true,
    setupFiles: ["./tests/integration/setup.ts"],
    testTimeout: 30_000,
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
  resolve: {
    alias: [
      { find: "@", replacement: resolve(__dirname, "./src") },
      {
        find: /^@nd\/jsonlogic\/(.*)$/,
        replacement: `${vendoredJsonLogic}/$1`,
      },
    ],
  },
});
