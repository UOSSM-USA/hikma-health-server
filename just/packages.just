# Leaf builds — small atoms that the app builds and tests depend on, plus their
# cleans. ReScript outputs (`.res.mjs` + `.gen.ts`) are gitignored and consumed
# by server + mobile at runtime / type-check time, so every recipe that builds
# or tests those apps runs build-hh-forms (and build-utils-js) first.

build-utils-js:
    pnpm --filter @hikmahealth/js-utils run build

build-database:
    pnpm --filter @hikmahealth/database run build

build-ui:
    pnpm --filter @hikmahealth/ui run build

build-hh-forms:
    pnpm --filter @hikmahealth/forms run build


clean-utils-js:
    pnpm --filter @hikmahealth/js-utils run clean

clean-database:
    rm -rf database/dist

clean-ui:
    rm -rf packages/ui/dist
