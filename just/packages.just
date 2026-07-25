# Leaf builds — the atoms app builds and tests depend on. ReScript outputs
# (`.res.mjs` + `.gen.ts`) are gitignored but resolved by server + mobile, so
# every recipe building or testing those apps runs these first.

# A build killed mid-compile leaves lib/rescript.lock holding its PID; once the
# OS recycles that PID, every later rescript run aborts with "A ReScript build
# is already running". `rescript clean` can't fix it — it takes the same lock —
# so the file is removed directly. Locks whose PID is still a live rescript
# process (e.g. a `res:dev` watch elsewhere) are left alone. The rescript leaf
# builds depend on this, so every build + test path self-heals.

# `just` does not echo the body of a shebang recipe, so this one is invisible
# in CI logs unless it says so itself — the start/end markers are what make a
# stall here distinguishable from a stall in the step before or after.
#
# The find prunes node_modules rather than filtering it out of the results:
# `-not -path` still walks every hoisted dependency tree, which is free on a
# warm local FS and very much not on a cold container overlayfs.

# Remove stale ReScript build locks left by an interrupted compile.
unlock-rescript:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "unlock-rescript: scanning for stale locks"
    while IFS= read -r lock; do
        pid="$(tr -dc '0-9' < "$lock")"
        if [ -z "$pid" ] || ! ps -p "$pid" -o command= 2>/dev/null | grep -q '[r]escript'; then
            rm -f "$lock"
            echo "unlock-rescript: removed stale lock $lock"
        fi
    done < <(find packages apps vendor -name node_modules -prune -o -path '*/lib/rescript.lock' -print 2>/dev/null)
    echo "unlock-rescript: done"

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
