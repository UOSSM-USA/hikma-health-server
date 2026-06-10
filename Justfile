set export := true

# ============================================================================
# HikmaHealth monorepo task runner.
#
# Recipes are split by domain into ./just/*.just and imported below into one
# flat namespace — `just --list` shows everything, and a recipe in one file may
# depend on a recipe in another. This file holds shared settings, the
# cross-cutting conventions, and the aggregators that fan out across domains.
#
# Conventions shared across the imported files:
#   • pnpm workspaces + Just replace moon for JS workloads. The moon recipes
#     that remain live in just/moon-legacy.just.
#   • Env loading: recipes that need env vars use dotenvx (root devDep) to layer
#     root .env + the relevant app .env. Shell env wins over .env (dotenvx
#     default). Leaf builds (tsc/rescript only) skip env loading.
#   • Install targeting: `pnpm install --filter "<pkg>..."` pulls a deploy app's
#     dependency closure only, skipping unrelated apps. Wired as a dep of the
#     app's build recipe so platforms only call `just build-server` / etc.
#   • Leaf builds first: build-hh-forms / build-utils-js emit gitignored
#     .gen.ts / .res.mjs that server + mobile resolve, so they precede those
#     apps' build / test / typecheck recipes.
# ============================================================================

import 'just/packages.just'
import 'just/server.just'
import 'just/aiproxy.just'
import 'just/mobile.just'
import 'just/local-hub.just'
import 'just/vendor.just'
import 'just/moon-legacy.just'


# ---- Aggregators : fan out across domains. Buy one get N free !! ----

build-packages: build-utils-js build-database build-ui build-hh-forms

build-apps: build-server build-aiproxy typecheck-mobile

build-all: build-packages build-apps

# Excludes `test-local-hub-backend` — see just/local-hub.just.
test-all: test-server test-aiproxy test-local-hub-frontend test-mobile

clean-all: clean-utils-js clean-database clean-ui clean-server clean-aiproxy
