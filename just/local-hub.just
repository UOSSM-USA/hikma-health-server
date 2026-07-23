# Local hub (Tauri). Frontend-only tests are fast and run in `test-all`. The
# backend (Tauri/Rust) is opt-in — it needs GTK/webkit system libs, cargo-nextest
# and a long Rust compile, so CI gates it on apps/local-hub/src-tauri/** changes.

test-local-hub-frontend:
    pnpm --filter hh-local-hub run test:frontend

test-local-hub-backend:
    pnpm --filter hh-local-hub run test:backend

test-local-hub: test-local-hub-frontend test-local-hub-backend

# Bundles for the host OS rather than Linux, but Tauri's JS↔Rust version-parity
# preflight is platform-independent, so a drifted plugin version still surfaces
# here before CI. Assumes Tauri system deps are installed; CI installs its own.

# Reproduce the local-hub CI gates: lockfile check, tests, unsigned smoke-build.
ci-local:
    pnpm install --frozen-lockfile --filter "hh-local-hub..."
    just test-local-hub
    pnpm --filter hh-local-hub exec tauri build -c '{"bundle":{"createUpdaterArtifacts":false}}'
