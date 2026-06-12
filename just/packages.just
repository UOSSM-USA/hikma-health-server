# Leaf builds — small atoms that the app builds and tests depend on, plus their
# cleans. ReScript outputs (`.res.mjs` + `.gen.ts`) are gitignored and consumed
# by server + mobile at runtime / type-check time, so every recipe that builds
# or tests those apps runs build-hh-forms (and build-utils-js) first.

# Clear stale ReScript build locks before any rescript build. A build (or `just
# dev-server`) killed mid-compile leaves lib/rescript.lock holding its PID; once
# the OS recycles that PID to an unrelated process, every later rescript run
# aborts with "A ReScript build is already running". `rescript clean` can't fix
# it — it takes the same lock and fails — so the file is removed directly. Locks
# whose PID is still a live rescript process (e.g. a `res:dev` watch in another
# terminal) are left untouched. Depended on by the rescript leaf builds below,
# so every server / mobile build + test path self-heals; Just runs it once per
# invocation regardless of how many depend on it.
unlock-rescript:
    #!/usr/bin/env bash
    set -euo pipefail
    while IFS= read -r lock; do
        pid="$(tr -dc '0-9' < "$lock")"
        if [ -z "$pid" ] || ! ps -p "$pid" -o command= 2>/dev/null | grep -q '[r]escript'; then
            rm -f "$lock"
            echo "unlock-rescript: removed stale lock $lock"
        fi
    done < <(find packages apps vendor -path '*/lib/rescript.lock' -not -path '*/node_modules/*' 2>/dev/null)

build-utils-js: unlock-rescript
    pnpm --filter @hikmahealth/js-utils run build

build-database:
    pnpm --filter @hikmahealth/database run build

build-ui:
    pnpm --filter @hikmahealth/ui run build

build-hh-forms: unlock-rescript
    pnpm --filter @hikmahealth/forms run build


clean-utils-js:
    pnpm --filter @hikmahealth/js-utils run clean

clean-database:
    rm -rf database/dist

clean-ui:
    rm -rf packages/ui/dist
