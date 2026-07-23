/** @type {import('@babel/core').TransformOptions} */
module.exports = function (api) {
  api.cache(true)
  return {
    // WatermelonDB models need legacy decorators applied before class properties.
    // The preset's own decorator plugin can't do that under `hermes-stable`, which
    // preserves native class fields, so it emits `_initializerWarningHelper` and
    // throws "Decorating class property failed" at model construction. Disable it
    // and re-add the pair in order for the models only.
    //
    // The override is path-scoped: a decorator outside `app/db/model/` is silently
    // left untransformed rather than erroring — widen `test` if that happens.
    presets: [["babel-preset-expo", { decorators: false }]],
    overrides: [
      {
        // A function predicate, not a RegExp: Expo's Metro babel-transformer computes
        // its cache key by calling `loadPartialConfigSync` with no filename, and Babel
        // throws on a string/RegExp pattern in that case.
        test: (filename) => typeof filename === "string" && filename.includes("/app/db/model/"),
        plugins: [
          ["@babel/plugin-proposal-decorators", { legacy: true }],
          ["@babel/plugin-transform-class-properties", { loose: true }],
        ],
      },
    ],
    env: {
      production: {
        plugins: ["transform-remove-console"],
      },
    },
  }
}
