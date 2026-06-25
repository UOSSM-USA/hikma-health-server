# HH Local HUB

A Tauri desktop app that acts as an **offline, LAN-local sync server** for HikmaHealth mobile
clients, buffering sync between devices when there is no internet and later relaying to the cloud
server (the master DB).

Run the desktop app with:
```bash
pnpm tauri dev
```

## Releases & downloads

Releases are built by the **Local Hub Release** workflow (`.github/workflows/local-hub-release.yaml`):
run it from the Actions tab, supply a CalVer version (e.g. `2026.5.4`), and it builds macOS, Windows,
and Linux bundles, signs the updater artifacts, and uploads them to a **draft** GitHub Release. The
in-app auto-updater only picks up a release once you **publish** it.

Bundles are **not OS-code-signed yet**, so first launch trips the platform gatekeepers:

- **macOS:** right-click the app → **Open**, then confirm (Gatekeeper blocks double-click launch of
  unsigned/unnotarized apps).
- **Windows:** on the SmartScreen prompt click **More info → Run anyway**.

Apple notarization and Windows Authenticode signing are a planned follow-up.

## Security model (read before changing transport or sync)

- **Data at rest:** the local SQLite database is encrypted with **SQLCipher**; the key is held in
  memory and the DB is unlocked with a passphrase.
- **Data in transit — no TLS, by design.** The hub serves **plain HTTP** on `0.0.0.0:4001`.
  It cannot use transport-layer TLS because it has no CA-issued certificate, and **self-signed
  certificates are rejected by iOS App Transport Security and the Android system trust store**,
  which breaks the mobile clients. Confidentiality/integrity of PHI in transit is instead provided
  at the **application layer**: all data endpoints are `/rpc/command` and `/rpc/query`, whose
  payloads are encrypted with **ECDH-derived AES-256-GCM**. There is no unauthenticated/plaintext
  data endpoint (the legacy REST `/api/v2/sync` + `/api/login` were removed).
  This is an *addressable* HIPAA transmission-security safeguard with the app-layer envelope as the
  documented equivalent measure. **Assumes a trusted LAN — never expose port 4001 to the internet.**
- **Auth:** clients handshake (ECDH) then log in (email + password) for a JWT, which is required on
  every non-exempt RPC call.

Full transport/encryption details: [`src-tauri/src/rpc/procedures-readme.md`](src-tauri/src/rpc/procedures-readme.md).
Open security/correctness review and fix tracker: repo-root `local-test-hub-review.local.md`.
