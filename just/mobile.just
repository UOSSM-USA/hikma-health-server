# Mobile (Expo / React Native) — typecheck / test / dev runs / EAS builds.
# build-utils-js + build-hh-forms precede every recipe that resolves JS so the
# gitignored .gen.ts / ReScript outputs exist before Metro / tsc run.

typecheck-mobile: build-utils-js build-hh-forms
    pnpm --filter hikma-health-mobile run check-types

test-mobile: build-utils-js build-hh-forms
    pnpm --filter hikma-health-mobile run test


# ---- Dev runs ----
# Expo's run:android / run:ios builds the native app, installs on the connected
# device/emulator, and starts Metro. Assumes `pnpm install` has been run.
#
# start-mobile-android / -ios accept an optional mode argument:
#   `just start-mobile-android`        → debug variant (default, dev client + Metro)
#   `just start-mobile-android prod`   → release variant (bundled JS, minified,
#                                         no fast refresh) — for on-device perf
#                                         testing in real-world conditions.

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


# ---- EAS builds / store submissions ----
# EAS commands must run from apps/mobile (eas.json / app.json live there), so we
# use `pnpm --filter hikma-health-mobile exec` to set that CWD without a manual
# cd. `eas` is expected on PATH (install once with `npm i -g eas-cli`).
#
# Build-time vars (EXPO_PUBLIC_*, SENTRY_AUTH_TOKEN) live in the repo-root .env,
# so recipes that bundle JS (build, update) load it via dotenvx — bare eas would
# only see apps/mobile/.env (absent today). submit / adb need no build-time env.
#
# build/update depend on build-utils-js + build-hh-forms (same as typecheck- and
# start-mobile-*) so the .gen.ts / ReScript outputs Metro resolves exist first.
#
# The `profile` arg maps to an eas.json build profile:
#   sim → development   dev → development:device   preview → preview   prod → production

build-mobile-ios profile='prod': build-utils-js build-hh-forms (_eas-build 'ios' profile)

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
