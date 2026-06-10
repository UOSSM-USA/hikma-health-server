# AI proxy — install / build / run / test / clean.

install-aiproxy:
    pnpm install --filter "hh-ai-proxy..."

build-aiproxy: install-aiproxy build-utils-js
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_ARGS="-f .env"
    [ -f apps/aiproxy/.env ] && ENV_ARGS="$ENV_ARGS -f apps/aiproxy/.env"
    pnpm exec dotenvx run $ENV_ARGS -- pnpm --filter hh-ai-proxy run build

start-aiproxy:
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_ARGS="-f .env"
    [ -f apps/aiproxy/.env ] && ENV_ARGS="$ENV_ARGS -f apps/aiproxy/.env"
    pnpm exec dotenvx run $ENV_ARGS -- pnpm --filter hh-ai-proxy run start

test-aiproxy: build-utils-js
    pnpm --filter hh-ai-proxy run test

clean-aiproxy:
    rm -rf apps/aiproxy/dist
    pnpm --filter hh-ai-proxy run res:clean
