# Server — install / build / run / dev / test / clean.

install-server:
    pnpm install --filter "hikma-health-server..."

build-server: install-server build-utils-js build-database build-hh-forms
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_ARGS="-f .env"
    [ -f apps/server/.env ] && ENV_ARGS="$ENV_ARGS -f apps/server/.env"
    pnpm exec dotenvx run $ENV_ARGS -- pnpm --filter hikma-health-server run build

# start-server runs three steps in order, every start, regardless of platform:
#   1. migrate    — idempotent; brings schema to current
#   2. recovery   — user_permissions_recovery script; antifragility for permissions/access
#   3. start-only — boots the built server from .output/
# Failure at any step aborts boot loudly (set -euo pipefail).
# Build before starting (just build-server).
# Optional port arg: `just start-server 8080` overrides the listen port.
# Omitted, the server keeps its default (PORT from .env, else Nitro's 3000).
start-server port='':
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_ARGS="-f .env"
    [ -f apps/server/.env ] && ENV_ARGS="$ENV_ARGS -f apps/server/.env"
    # An exported PORT wins over .env (dotenvx keeps existing shell env), so
    # setting it only when an arg was passed leaves the default path untouched.
    [ -n "{{ port }}" ] && export PORT="{{ port }}"
    pnpm exec dotenvx run $ENV_ARGS -- pnpm --filter @hikmahealth/database run migrate-latest
    pnpm exec dotenvx run $ENV_ARGS -- pnpm --filter hikma-health-server run recovery-permissions
    pnpm exec dotenvx run $ENV_ARGS -- pnpm --filter hikma-health-server run start-only

# Server in dev mode — vite's dev server (HMR, source maps) instead of the
# built .output/. Differences from start-server:
#   - Skips recovery-permissions (prod hardening; nothing to gain in dev).
#   - One-shot res:build inline so ReScript sources are importable. For
#     ReScript HMR, run `pnpm --filter hikma-health-server run res:dev` in
#     a second terminal alongside this.
# Migrations still run (idempotent; schema must be current to start).
# build-utils-js / build-database deps mirror test-server — vite needs the
# workspace builds present to resolve imports.
dev-server: build-utils-js build-database build-hh-forms
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_ARGS="-f .env"
    [ -f apps/server/.env ] && ENV_ARGS="$ENV_ARGS -f apps/server/.env"
    pnpm --filter hikma-health-server run res:build
    pnpm exec dotenvx run $ENV_ARGS -- pnpm --filter @hikmahealth/database run migrate-latest
    pnpm exec dotenvx run $ENV_ARGS -- pnpm --filter hikma-health-server run dev

test-server: build-utils-js build-database build-hh-forms
    pnpm --filter hikma-health-server run test

clean-server:
    rm -rf apps/server/.output
    pnpm --filter hikma-health-server run res:clean
