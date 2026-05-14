# vendor/

Third-party packages vendored into the monorepo. `vendor/*` is part of the
pnpm workspace, so packages here are imported the same way as anything in
`packages/` — `"<pkg>": "workspace:*"` in a consumer's `package.json`.

## Why vendor at all?

Two reasons, both intentional:

1. **Deterministic control over what every consumer pulls.** A vendored
   package can't shift under us mid-sprint because of a transitive resolution
   change.
2. **Friction on upgrades.** Bumping a vendored package is a PR with a visible
   diff, not a lockfile line-change. That's the point.

## Policy

1. **No local modifications to `mode = "sync"` packages.** Their tree must
   match the recorded upstream ref byte-for-byte. CI enforces this via
   `just vendor-check`.

2. **If you must modify a package, freeze it.** Set `mode = "frozen"` in
   `vendor.toml` with a `frozen_reason` and `frozen_at` date. Frozen packages
   are skipped by `just vendor-update` and exempt from `vendor-check`'s
   byte-match assertion.

3. **Frozen is temporary.** If a package needs long-lived modifications, it
   is no longer vendored — promote it to `packages/<name>/` with an
   `UPSTREAM_FORKED_FROM` file recording the source, and remove the entry
   from `vendor.toml` (and the folder from `vendor/`). The `vendor/` tree
   should only contain code that currently tracks upstream.

## Lifecycle

| Command | What it does |
|---|---|
| `just vendor-add <name> <url> <ref>` | Vendor a new package via `git subtree add --squash` and add a `mode = "sync"` entry. |
| `just vendor-update [name]` | Pull the recorded ref's upstream for one (or all `mode = "sync"`) packages. Skips frozen. |
| `just vendor-freeze <name> "<reason>"` | Flip a package to `mode = "frozen"`. Records reason + date. |
| `just vendor-check` | Verify every `mode = "sync"` package matches its recorded ref. CI runs this. |
| `just vendor-status` | Print a table of all vendored packages with mode, ref, and last-synced date. |

## Enforcement

`just vendor-check` is the assertion. CI (`.github/workflows/ci.yaml::vendor-check`)
runs it on every PR and gates the v3 fast-forward on success.

Local pre-commit enforcement is opt-in via lefthook. Run once per clone:

```sh
pnpm exec lefthook install
```

After install, commits that stage anything under `vendor/**` or
`scripts/vendor/**` trigger `vendor-check` automatically. Without it, CI is
still authoritative — local hooks are a courtesy.

## What goes here vs `packages/`

- `vendor/` — code we **did not author**. Bytes came from elsewhere and are
  tracked there.
- `packages/` — code we **own**. Includes ports (e.g., a ReScript translation
  of an upstream JS library) — those are authored work, not vendored bytes.

A frozen vendor that never thaws is a fork in disguise. Promote it.
