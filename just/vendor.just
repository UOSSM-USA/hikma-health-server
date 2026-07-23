# Vendor catalog — third-party packages under vendor/. See vendor/README.md for
# the policy (no local edits while mode = "sync"; freeze first). Every recipe is
# a thin wrapper over scripts/vendor/vendor.mjs, the sole owner of vendor.toml.

vendor-add NAME URL REF:
    node scripts/vendor/vendor.mjs add {{quote(NAME)}} {{quote(URL)}} {{quote(REF)}}

# Re-pull the recorded ref to fix drift, or pass REF to move to a new one.
vendor-update NAME REF='':
    node scripts/vendor/vendor.mjs update {{quote(NAME)}} {{quote(REF)}}

vendor-freeze NAME REASON:
    node scripts/vendor/vendor.mjs freeze {{quote(NAME)}} {{quote(REASON)}}

vendor-check:
    node scripts/vendor/vendor.mjs check

vendor-status:
    node scripts/vendor/vendor.mjs status
