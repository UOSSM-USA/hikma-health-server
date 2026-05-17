const path = require("path")
const { getSentryExpoConfig } = require("@sentry/react-native/metro")

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname)

config.transformer.getTransformOptions = async () => ({
  transform: {
    // Inline requires are very useful for deferring loading of large dependencies/components.
    // For example, we use it in app.tsx to conditionally load Reactotron.
    // However, this comes with some gotchas.
    // Read more here: https://reactnative.dev/docs/optimizing-javascript-loading
    // And here: https://github.com/expo/expo/issues/27279#issuecomment-1971610698
    inlineRequires: true,
  },
})

// This is a temporary fix that helps fixing an issue with axios/apisauce.
// See the following issues in Github for more details:
// https://github.com/infinitered/apisauce/issues/331
// https://github.com/axios/axios/issues/6899
// The solution was taken from the following issue:
// https://github.com/facebook/metro/issues/1272
config.resolver.unstable_conditionNames = ["require", "default", "browser"]

// This helps support certain popular third-party libraries
// such as Firebase that use the extension cjs.
config.resolver.sourceExts.push("cjs")

// Enable package exports resolution so Metro respects the "exports" field
// in package.json files (e.g. @noble/curves, @noble/hashes, @noble/ciphers).
// These packages define exports with .js extensions (e.g. "./ed25519.js")
// but our code imports without extensions (e.g. "@noble/curves/ed25519").
// unstable_enablePackageExports makes Metro resolve them correctly.
config.resolver.unstable_enablePackageExports = true

// `@hikmahealth/forms` ReScript output uses deep imports
// (`@nd/jsonlogic/src/JsonLogic.res.mjs`). The vendored package's exports
// map only exposes the package root, so Metro's strict exports
// resolution (above) rejects the deep import. The vendor package is
// off-limits to edit (a fix exists upstream); intercept the request
// and route it to the vendored file directly.
const vendoredJsonLogic = path.resolve(__dirname, "../../vendor/@nd/jsonlogic")
const upstreamResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith("@nd/jsonlogic/")) {
    const subpath = moduleName.slice("@nd/jsonlogic/".length)
    return {
      type: "sourceFile",
      filePath: path.join(vendoredJsonLogic, subpath),
    }
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
