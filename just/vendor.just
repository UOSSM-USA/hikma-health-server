# Vendor catalog — manage third-party packages under vendor/. See vendor/README.md
# for the policy (no local modifications on mode = "sync"; freeze if you must
# edit). All recipes are thin wrappers over scripts/vendor/vendor.mjs, which is
# the single source of truth for vendor.toml mutations.

vendor-add NAME URL REF:
    node scripts/vendor/vendor.mjs add {{quote(NAME)}} {{quote(URL)}} {{quote(REF)}}

# vendor-update <name>          — re-pull the recorded ref (drift fix)
# vendor-update <name> <new-ref> — sync to a new upstream ref
vendor-update NAME REF='':
    node scripts/vendor/vendor.mjs update {{quote(NAME)}} {{quote(REF)}}

vendor-freeze NAME REASON:
    node scripts/vendor/vendor.mjs freeze {{quote(NAME)}} {{quote(REASON)}}

vendor-check:
    node scripts/vendor/vendor.mjs check

vendor-status:
    node scripts/vendor/vendor.mjs status
