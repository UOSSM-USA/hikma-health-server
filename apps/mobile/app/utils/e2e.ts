import { LaunchArguments } from "react-native-launch-arguments"

type E2EFlag = boolean | string | undefined

type E2ELaunchArgs = {
  isE2E?: E2EFlag
  seedE2E?: E2EFlag
}

const args = LaunchArguments.value<E2ELaunchArgs>()

// react-native-launch-arguments coerces intent extras differently per platform:
// Android delivers `true` as a boolean, Maestro/iOS may deliver the string "true".
// Accept both so the flag is robust regardless of how the value arrives.
const isFlagSet = (value: E2EFlag): boolean => value === true || value === "true"

/** True when launched by the Maestro e2e harness (used to silence logs). */
export const isE2E: boolean = isFlagSet(args.isE2E)

/**
 * True when the harness requested a seeded, hermetic launch: the app
 * populates a fixed offline dataset and injects a provider session so UI
 * flows run without a network login or a live backend. Distinct from
 * `isE2E` so backend-connected flows (real login, sync) can run under
 * `isE2E` alone without the seed taking over.
 *
 * Gated on `__DEV__` as a build-time guard: release builds (preview and
 * production) can never seed, even if the launch argument is supplied at
 * runtime — so an injected fake session can't reach a real install.
 */
export const shouldSeedE2E: boolean = __DEV__ && isFlagSet(args.seedE2E)
