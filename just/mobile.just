# Mobile (Expo / React Native) — typecheck / test / dev runs / EAS builds.
# build-utils-js + build-hh-forms precede every recipe that resolves JS, so the
# gitignored .gen.ts / ReScript outputs exist before Metro / tsc run.

typecheck-mobile: build-utils-js build-hh-forms
    pnpm --filter hikma-health-mobile run check-types

test-mobile: build-utils-js build-hh-forms
    pnpm --filter hikma-health-mobile run test


# Dev runs — build the native app, install it on the connected device/emulator,
# and start Metro. Assumes `pnpm install` has already been run. `mode` picks the
# variant: 'dev' (default) is the dev client with fast refresh; 'prod' is a
# release build for on-device perf testing.

# Build and run the Android app. mode: dev | prod.
start-mobile-android mode='dev': build-utils-js build-hh-forms
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{ mode }}" in
      prod|production|release)
        dotenv -f .env run pnpm --filter hikma-health-mobile run android -- --variant release ;;
      dev|debug)
        dotenv -f .env run pnpm --filter hikma-health-mobile run android ;;
      *)
        echo "start-mobile-android: unknown mode '{{ mode }}' (use 'dev' or 'prod')" >&2
        exit 2 ;;
    esac

# Build and run the iOS app. mode: dev | prod.
start-mobile-ios mode='dev': build-utils-js build-hh-forms
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{ mode }}" in
      prod|production|release)
        dotenv -f .env run pnpm --filter hikma-health-mobile run ios -- --configuration Release ;;
      dev|debug)
        dotenv -f .env run pnpm --filter hikma-health-mobile run ios ;;
      *)
        echo "start-mobile-ios: unknown mode '{{ mode }}' (use 'dev' or 'prod')" >&2
        exit 2 ;;
    esac


# EAS builds / store submissions. `eas` must be on PATH (`npm i -g eas-cli`).
# Recipes go through `pnpm --filter hikma-health-mobile exec` because EAS needs
# apps/mobile as its CWD (eas.json / app.json live there). Those that bundle JS
# load the root .env via dotenvx for EXPO_PUBLIC_* / SENTRY_AUTH_TOKEN — bare
# eas would only see apps/mobile/.env. `profile` maps to an eas.json profile:
#   sim → development   dev → development:device   preview → preview   prod → production

# Build the iOS app with EAS. profile: sim | dev | preview | prod.
build-mobile-ios profile='prod': build-utils-js build-hh-forms (_eas-build 'ios' profile)

# Build the Android app with EAS. profile: sim | dev | preview | prod.
build-mobile-android profile='prod': build-utils-js build-hh-forms (_eas-build 'android' profile)

_eas-build platform profile:
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{ profile }}" in
      sim)     EAS_PROFILE="development" ;;
      dev)     EAS_PROFILE="development:device" ;;
      preview) EAS_PROFILE="preview" ;;
      prod)    EAS_PROFILE="production" ;;
      *)
        echo "build-mobile-{{ platform }}: unknown profile '{{ profile }}' (sim|dev|preview|prod)" >&2
        exit 2 ;;
    esac
    ENV_ARGS="-f .env"
    [ -f apps/mobile/.env ] && ENV_ARGS="$ENV_ARGS -f apps/mobile/.env"
    pnpm exec dotenvx run $ENV_ARGS -- pnpm --filter hikma-health-mobile exec eas build --profile "$EAS_PROFILE" --platform "{{ platform }}" --local

submit-mobile-ios:
    pnpm --filter hikma-health-mobile exec eas submit --platform ios

submit-mobile-android:
    pnpm --filter hikma-health-mobile exec eas submit --platform android

# Build the production binary, then submit it to the store.
build-submit-mobile-ios: (build-mobile-ios 'prod') submit-mobile-ios

build-submit-mobile-android: (build-mobile-android 'prod') submit-mobile-android

# Publish an OTA JS update to the production channel.
update-mobile-prod: build-utils-js build-hh-forms
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_ARGS="-f .env"
    [ -f apps/mobile/.env ] && ENV_ARGS="$ENV_ARGS -f apps/mobile/.env"
    pnpm exec dotenvx run $ENV_ARGS -- pnpm --filter hikma-health-mobile exec eas update --channel production

# Reverse Metro / dev-service ports over adb for a connected Android device.
mobile-adb:
    adb reverse tcp:9090 tcp:9090
    adb reverse tcp:3000 tcp:3000
    adb reverse tcp:9001 tcp:9001
    adb reverse tcp:8081 tcp:8081
