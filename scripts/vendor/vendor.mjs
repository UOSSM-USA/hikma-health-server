#!/usr/bin/env node
// Vendor catalog tool. Single source of truth: vendor/vendor.toml.
// Subcommands: add, update, freeze, check, status.
// Invoked via Justfile recipes (vendor-add, vendor-update, ...).
// Schema is documented in vendor/vendor.toml's header.

import { parse as parseToml } from 'smol-toml'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const TOML_PATH = resolve(REPO_ROOT, 'vendor', 'vendor.toml')
const TOML_REL = 'vendor/vendor.toml'

// Field emit order. Anything outside this set is dropped on serialize —
// keeps the file shape predictable and unknown fields from accumulating.
const FIELD_ORDER = ['name', 'url', 'ref', 'mode', 'last_synced', 'tree_sha', 'frozen_reason', 'frozen_at']
const REQUIRED = ['name', 'url', 'ref', 'mode', 'last_synced', 'tree_sha']
// Accepts plain slugs ("jsonlogic", "foo-bar") and npm-scoped names
// ("@nd/jsonlogic"). The name doubles as the directory path under vendor/.
const VALID_NAME = /^(@[a-z0-9][a-z0-9_-]*\/)?[a-z0-9][a-z0-9_-]*$/
const VALID_DATE = /^\d{4}-\d{2}-\d{2}$/

// ---- helpers ---------------------------------------------------------------

function fail(msg) {
  process.stderr.write(`vendor: ${msg}\n`)
  process.exit(1)
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim()
}

function gitInherit(args) {
  execFileSync('git', args, { cwd: REPO_ROOT, stdio: 'inherit' })
}

function treeShaOf(prefix) {
  try {
    return git(['rev-parse', `HEAD:${prefix}`])
  } catch {
    fail(`could not read tree SHA for ${prefix} (not yet committed?)`)
  }
}

// Allow vendor.toml itself to be dirty — the script writes it, and chaining
// vendor-add/update calls shouldn't require a commit between each.
function requireCleanWorktree() {
  let status
  try {
    status = git(['status', '--porcelain'])
  } catch (e) {
    fail(`git status failed: ${e.message}`)
  }
  const dirty = status
    .split('\n')
    .filter(l => l.length > 0)
    .map(l => l.slice(3))
    .filter(p => p !== TOML_REL)
  if (dirty.length > 0) {
    process.stderr.write('vendor: working tree has uncommitted changes:\n')
    for (const p of dirty) process.stderr.write(`  ${p}\n`)
    process.stderr.write('git subtree requires a clean tree.\n')
    process.stderr.write('  jj: `jj new` to start a fresh change, then re-run.\n')
    process.stderr.write('  git: commit or stash, then re-run.\n')
    process.exit(1)
  }
}

function validateEntry(pkg, idx) {
  const where = `${TOML_REL} [[package]] #${idx + 1}`
  for (const key of REQUIRED) {
    if (pkg[key] === undefined) fail(`${where}: missing required field "${key}"`)
  }
  if (!VALID_NAME.test(pkg.name)) fail(`${where}: invalid name "${pkg.name}"`)
  if (pkg.mode !== 'sync' && pkg.mode !== 'frozen') {
    fail(`${where}: mode must be "sync" or "frozen" (got "${pkg.mode}")`)
  }
  if (!VALID_DATE.test(pkg.last_synced)) fail(`${where}: last_synced must be YYYY-MM-DD`)
  if (pkg.mode === 'frozen') {
    if (typeof pkg.frozen_reason !== 'string' || pkg.frozen_reason.length === 0) {
      fail(`${where}: mode = "frozen" requires non-empty frozen_reason`)
    }
    if (!VALID_DATE.test(pkg.frozen_at ?? '')) {
      fail(`${where}: mode = "frozen" requires frozen_at as YYYY-MM-DD`)
    }
  }
}

function loadCatalog() {
  if (!existsSync(TOML_PATH)) fail(`${TOML_REL} not found`)
  const text = readFileSync(TOML_PATH, 'utf8')
  let parsed
  try {
    parsed = parseToml(text)
  } catch (e) {
    fail(`${TOML_REL} is not valid TOML: ${e.message}`)
  }
  const packages = parsed.package ?? []
  packages.forEach(validateEntry)
  return packages
}

function serializeEntry(pkg) {
  const lines = ['[[package]]']
  for (const key of FIELD_ORDER) {
    if (pkg[key] === undefined) continue
    // JSON string syntax is a strict subset of TOML basic-string syntax,
    // so JSON.stringify produces valid TOML for any string value.
    lines.push(`${key} = ${JSON.stringify(pkg[key])}`)
  }
  return lines.join('\n')
}

// Preserve the file header (everything before the first [[package]] block).
// The header is the schema doc and is user-readable; only entries are tool-owned.
// The split point must be a real TOML table-array header — i.e., [[package]]
// at the start of a line (possibly indented). Substrings inside comments like
// "# Each [[package]] entry ..." don't count.
function saveCatalog(packages) {
  const existing = readFileSync(TOML_PATH, 'utf8')
  const match = existing.match(/^\s*\[\[package\]\]/m)
  const header = match ? existing.slice(0, match.index) : existing
  const body = packages.map(serializeEntry).join('\n\n')
  const out = body.length > 0 ? `${header.trimEnd()}\n\n${body}\n` : header.trimEnd() + '\n'
  writeFileSync(TOML_PATH, out)
}

function findPackage(packages, name) {
  const pkg = packages.find(p => p.name === name)
  if (!pkg) fail(`no vendor entry named "${name}" in ${TOML_REL}`)
  return pkg
}

// ---- subcommands -----------------------------------------------------------

function cmdAdd(name, url, ref) {
  if (!name || !url || !ref) fail('usage: vendor add <name> <url> <ref>')
  if (!VALID_NAME.test(name)) fail(`invalid name "${name}" — use a plain slug ("foo-bar") or npm-scoped form ("@scope/name"); lowercase alphanumerics, dashes, underscores only`)

  const packages = loadCatalog()
  if (packages.some(p => p.name === name)) fail(`vendor entry "${name}" already exists`)

  const prefix = `vendor/${name}`
  if (existsSync(resolve(REPO_ROOT, prefix))) fail(`${prefix}/ already exists on disk`)

  requireCleanWorktree()

  process.stderr.write(`vendor: git subtree add --prefix=${prefix} ${url} ${ref} --squash\n`)
  gitInherit(['subtree', 'add', `--prefix=${prefix}`, url, ref, '--squash'])

  packages.push({
    name,
    url,
    ref,
    mode: 'sync',
    last_synced: todayISO(),
    tree_sha: treeShaOf(prefix),
  })
  saveCatalog(packages)

  process.stderr.write(`vendor: added "${name}". Commit ${TOML_REL} to record the catalog update.\n`)
}

function cmdUpdate(name, newRef) {
  if (!name) fail('usage: vendor update <name> [new-ref]')

  const packages = loadCatalog()
  const pkg = findPackage(packages, name)
  if (pkg.mode === 'frozen') {
    fail(`"${name}" is frozen (reason: ${pkg.frozen_reason}); unfreeze in ${TOML_REL} first or promote to packages/`)
  }

  requireCleanWorktree()

  const targetRef = newRef && newRef.length > 0 ? newRef : pkg.ref
  const prefix = `vendor/${name}`

  process.stderr.write(`vendor: git subtree pull --prefix=${prefix} ${pkg.url} ${targetRef} --squash\n`)
  gitInherit(['subtree', 'pull', `--prefix=${prefix}`, pkg.url, targetRef, '--squash'])

  pkg.ref = targetRef
  pkg.last_synced = todayISO()
  pkg.tree_sha = treeShaOf(prefix)
  saveCatalog(packages)

  process.stderr.write(`vendor: updated "${name}" → ${targetRef}. Commit ${TOML_REL} to record.\n`)
}

function cmdFreeze(name, reason) {
  if (!name || !reason) fail('usage: vendor freeze <name> <reason>')
  if (reason.length < 8) fail('freeze reason must be at least 8 characters — say what & why')

  const packages = loadCatalog()
  const pkg = findPackage(packages, name)
  if (pkg.mode === 'frozen') fail(`"${name}" is already frozen`)

  pkg.mode = 'frozen'
  pkg.frozen_reason = reason
  pkg.frozen_at = todayISO()
  saveCatalog(packages)

  process.stderr.write(`vendor: froze "${name}". vendor-update will skip it.\n`)
  process.stderr.write('vendor: NOTE — if this freeze is long-lived, promote to packages/<name>/ instead.\n')
}

function cmdCheck() {
  const packages = loadCatalog()
  let problems = 0

  // Materialize the index as a tree object so we can extract the tree SHA at
  // any path. This compares apples-to-apples against the recorded tree_sha
  // (both are subtree objects), and reflects what would actually be committed —
  // which is exactly what the pre-commit hook needs to verify.
  // Side effect: write-tree adds the tree to the object database. Harmless.
  let indexRoot
  try {
    indexRoot = git(['write-tree'])
  } catch (e) {
    fail(`git write-tree failed: ${e.message}`)
  }

  for (const pkg of packages) {
    if (pkg.mode !== 'sync') continue
    const prefix = `vendor/${pkg.name}`

    let entry
    try {
      entry = git(['ls-tree', indexRoot, '--', prefix])
    } catch (e) {
      fail(`git ls-tree failed for ${prefix}: ${e.message}`)
    }

    if (entry.length === 0) {
      process.stderr.write(`vendor: ${pkg.name}: ${prefix}/ missing from index (deleted but not staged?)\n`)
      problems++
      continue
    }

    // ls-tree output: "<mode> <type> <sha>\t<path>"
    const match = entry.match(/^[0-7]+ tree ([0-9a-f]+)\t/)
    if (!match) fail(`unexpected ls-tree output for ${prefix}: ${entry}`)
    const current = match[1]

    if (current !== pkg.tree_sha) {
      process.stderr.write(`vendor: ${pkg.name}: drift from recorded tree_sha\n`)
      process.stderr.write(`  recorded: ${pkg.tree_sha}\n`)
      process.stderr.write(`  current:  ${current}\n`)
      process.stderr.write(`  if intentional: just vendor-freeze ${pkg.name} '<reason>'\n`)
      problems++
    }
  }

  if (problems > 0) {
    process.stderr.write(`vendor: ${problems} problem(s) found\n`)
    process.exit(1)
  }
  const syncCount = packages.filter(p => p.mode === 'sync').length
  const frozenCount = packages.length - syncCount
  process.stderr.write(`vendor: ok (${syncCount} sync, ${frozenCount} frozen)\n`)
}

function cmdStatus() {
  const packages = loadCatalog()
  if (packages.length === 0) {
    process.stdout.write('vendor: no packages vendored yet\n')
    return
  }
  const cols = ['name', 'mode', 'ref', 'last_synced', 'notes']
  const rows = packages.map(p => ({
    name: p.name,
    mode: p.mode,
    ref: p.ref,
    last_synced: p.last_synced,
    notes: p.mode === 'frozen' ? `${p.frozen_reason} (frozen ${p.frozen_at})` : '',
  }))
  const widths = Object.fromEntries(
    cols.map(c => [c, Math.max(c.length, ...rows.map(r => String(r[c]).length))]),
  )
  const fmt = row => cols.map(c => String(row[c]).padEnd(widths[c])).join('  ')
  const header = Object.fromEntries(cols.map(c => [c, c.toUpperCase()]))
  process.stdout.write(fmt(header) + '\n')
  for (const row of rows) process.stdout.write(fmt(row) + '\n')
}

// ---- dispatch --------------------------------------------------------------

const handlers = {
  add: cmdAdd,
  update: cmdUpdate,
  freeze: cmdFreeze,
  check: cmdCheck,
  status: cmdStatus,
}

const [, , cmd, ...args] = process.argv
const handler = handlers[cmd]
if (!handler) fail(`unknown command "${cmd ?? ''}"; valid: ${Object.keys(handlers).join(', ')}`)
handler(...args)
