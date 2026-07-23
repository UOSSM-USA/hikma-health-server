# Legacy moon pipeline — scaffolds a per-app workspace under .build/, installs,
# then builds/starts via moon. Being phased out in favour of the pnpm-workspace
# recipes (server.just / aiproxy.just); kept for deploy platforms still on it.

prepare-project project:
    #!/usr/bin/env bash
    set -euxo pipefail
    APP_FOLDER=".build/{{ project }}"
    mkdir -p APP_FOLDER 2>/dev/null

    export MOON_TOOLCHAIN_FORCE_GLOBALS=true
    export MOON_DEBUG_PROCESS_ENV=true

    echo "==> [build] scaffolding service workspace into ./$APP_FOLDER"
    moon docker scaffold {{ project }}

    # Collect everything needed to build the app into a single folder.
    rm -rf $APP_FOLDER;
    mkdir -p "./$APP_FOLDER"/;
    find ./.moon/docker/configs -maxdepth 1 -mindepth 1 \
        -not -path "*/database" \
        -not -path "*/apps" \
        -not -path "*/packages" \
        -exec mv {} "./$APP_FOLDER/" \;

    mv ./.moon/docker/sources/* "./$APP_FOLDER"

install-build-server: (prepare-project 'server')
    #!/usr/bin/env bash
    set -euxo pipefail
    cd .build/server
    pnpm install --no-frozen-lockfile
    moon run server:build

install-build-aiproxy: (prepare-project 'aiproxy')
    #!/usr/bin/env bash
    set -euxo pipefail
    cd .build/aiproxy
    pnpm install --no-frozen-lockfile
    moon run aiproxy:build

# Migrates unconditionally before starting. `migrate latest` is idempotent, so a
# current schema costs one no-op round trip and starting stays the single
# entrypoint that guarantees the schema, whatever the deploy platform.
moon_start-server:
    cd .build/server/database && pnpm run migrate-latest
    cd .build/server/apps/server && pnpm run start-only

moon_start-aiproxy:
    cd .build/aiproxy/apps/aiproxy && pnpm run start
