# Server — install / build / run / dev / test / clean.

install-server:
    pnpm install --filter "hikma-health-server..."

build-server: install-server build-utils-js build-database build-hh-forms
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_ARGS="-f .env"
    [ -f apps/server/.env ] && ENV_ARGS="$ENV_ARGS -f apps/server/.env"
    pnpm exec dotenvx run $ENV_ARGS -- pnpm --filter hikma-health-server run build

# Runs migrate → recovery-permissions → start-only on every start, on every
# platform. Migrate is idempotent; failure at any step aborts boot loudly.
# Requires a prior `just build-server` — this boots the built .output/.

# Boot the built server. Pass a port to override PORT from .env (default: Nitro's 3000).
start-server port='':
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_ARGS="-f .env"
    [ -f apps/server/.env ] && ENV_ARGS="$ENV_ARGS -f apps/server/.env"
    # An exported PORT wins over .env, so setting it only when an arg was
    # passed leaves the default path untouched.
    [ -n "{{ port }}" ] && export PORT="{{ port }}"
    pnpm exec dotenvx run $ENV_ARGS -- pnpm --filter @hikmahealth/database run migrate-latest
    pnpm exec dotenvx run $ENV_ARGS -- pnpm --filter hikma-health-server run recovery-permissions
    pnpm exec dotenvx run $ENV_ARGS -- pnpm --filter hikma-health-server run start-only

# Differs from start-server: skips recovery-permissions (prod hardening), and
# runs a one-shot res:build so ReScript sources are importable — for ReScript
# HMR run `pnpm --filter hikma-health-server run res:dev` alongside this.
# Migrations still run; the schema must be current to start.

# Server in dev mode — vite dev server with HMR instead of the built .output/.
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
