/** @type {import('@jest/types').Config.ProjectConfig} */
module.exports = {
  preset: "jest-expo",
  setupFiles: ["<rootDir>/test/setup.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/.maestro/"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@noble/curves|@noble/hashes|@noble/ciphers|@scure/base|immer|use-immer|uuid|@nd/jsonlogic|@rescript/runtime)",
  ],
  // jest-expo's default transform regex only matches .ts/.tsx/.js/.jsx, so
  // ReScript-emitted `.res.mjs` files (e.g. @hikmahealth/js-utils) fall
  // through and Jest tries to load them raw — failing on the ESM `import`.
  // babel-jest + babel-preset-expo handles the ESM → CJS conversion.
  transform: {
    "^.+\\.mjs$": "babel-jest",
  },
  // App code imports `@noble/<pkg>/<name>` without the `.js` suffix that v2's
  // `exports` field requires. Rewriting to the `.js` form lets Jest's default
  // Node resolution find the package wherever pnpm hoisted it (mobile-local
  // node_modules or repo root) instead of pinning to <rootDir>.
  moduleNameMapper: {
    "^@noble/curves/([^.]+)$": "@noble/curves/$1.js",
    "^@noble/hashes/([^.]+)$": "@noble/hashes/$1.js",
    "^@noble/ciphers/([^.]+)$": "@noble/ciphers/$1.js",
    // @nd/jsonlogic only declares an `"import"` conditional export and no
    // `"default"` fallback. Jest's CJS-mode resolver doesn't match the
    // `"import"` condition, so we map to the actual entry file. The
    // package is vendored as a git subtree — fixing the exports field
    // upstream is the long-term move; this mapping keeps the subtree
    // pristine in the meantime.
    "^@nd/jsonlogic$": "<rootDir>/node_modules/@nd/jsonlogic/src/JsonLogic.res.mjs",
    // Same problem for deep paths emitted by ReScript-generated `.res.mjs`
    // inside @hikmahealth/forms (e.g. `@nd/jsonlogic/src/JsonLogic.res.mjs`).
    // The vendor package's exports map doesn't expose `./src/*`; route deep
    // paths through the workspace symlink instead.
    "^@nd/jsonlogic/(.*)$": "<rootDir>/node_modules/@nd/jsonlogic/$1",
    // @hikmahealth/forms uses subpath exports (`/Rules`, `/RuleValidation`,
    // `/RuleTemplates`, etc.) via the `"import"` conditional. Same
    // resolver-condition gap as @nd/jsonlogic — map subpaths to the
    // generated `.res.mjs` files inside the workspace package.
    "^@hikmahealth/forms$": "<rootDir>/node_modules/@hikmahealth/forms/src/HhForms.res.mjs",
    "^@hikmahealth/forms/(.+)$": "<rootDir>/node_modules/@hikmahealth/forms/src/$1.res.mjs",
  },
  coveragePathIgnorePatterns: ["/node_modules/", "app/db/sync.ts"],
  collectCoverage: false,
  coverageDirectory: "coverage",
  coverageReporters: ["text", "text-summary", "lcov", "json-summary"],
  coverageThreshold: {
    "global": {
      branches: 20,
      functions: 20,
      lines: 20,
      statements: 20,
    },
    // Ratchet thresholds: set just below current coverage to prevent regression.
    // Pure-function tests cover the extractable logic; remaining uncovered code
    // is network I/O, WatermelonDB sync hooks, and DB subscriptions.
"./app/models/UserClinicPermissions.ts": {
      branches: 75,
      functions: 50,
      lines: 68,
      statements: 68,
    },
    "./app/models/Sync.ts": {
      branches: 54,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
}
