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
