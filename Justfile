set export := true

# HikmaHealth monorepo task runner. Recipes are split by domain into
# ./just/*.just and imported into one flat namespace, so a recipe in one file
# may depend on a recipe in another.
#
# Conventions across the imported files:
#   - Env loading uses dotenvx to layer root .env + the app's .env. Shell env
#     wins. Leaf builds (tsc/rescript only) skip it.
#   - `pnpm install --filter "<pkg>..."` pulls a deploy app's dependency
#     closure only, so platforms need call just the app's build recipe.
#   - build-hh-forms / build-utils-js emit gitignored .gen.ts / .res.mjs that
#     server + mobile resolve, so they precede those apps' recipes.

import 'just/packages.just'
import 'just/server.just'
import 'just/aiproxy.just'
import 'just/mobile.just'
import 'just/local-hub.just'
import 'just/vendor.just'
import 'just/moon-legacy.just'


# Aggregators — fan out across domains.

build-packages: build-utils-js build-database build-ui build-hh-forms

build-apps: build-server build-aiproxy typecheck-mobile

build-all: build-packages build-apps

# Excludes `test-local-hub-backend` — see just/local-hub.just.
test-all: test-server test-aiproxy test-local-hub-frontend test-mobile

clean-all: clean-utils-js clean-database clean-ui clean-server clean-aiproxy
