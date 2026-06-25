# Local hub (Tauri) — tests.
# Frontend-only is fast and runs in `test-all`. Backend (Tauri/Rust) is opt-in:
# it requires GTK/webkit system libs + cargo-nextest + a long Rust compile, so
# CI gates it on apps/local-hub/src-tauri/** changes. Run `just test-local-hub`
# locally to do both.

test-local-hub-frontend:
    pnpm --filter hh-local-hub run test:frontend

test-local-hub-backend:
    pnpm --filter hh-local-hub run test:backend

test-local-hub: test-local-hub-frontend test-local-hub-backend

# Builds a host-OS bundle (not Linux), but the Tauri JS↔Rust version-parity
# preflight it runs is platform-independent, so it catches that class of failure
# (e.g. a drifted plugin version) before CI does. Assumes Tauri system deps are
# already installed — CI installs them itself.
#
# Reproduce the local-hub CI gates before pushing: lockfile check + full test suite + unsigned bundle smoke-build.
ci-local:
    pnpm install --frozen-lockfile --filter "hh-local-hub..."
    just test-local-hub
    pnpm --filter hh-local-hub exec tauri build -c '{"bundle":{"createUpdaterArtifacts":false}}'
