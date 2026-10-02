# Desktop build (Electron) — Linux first

Fourth build target, added in v0.240.0. Same `src/` as every other
target; the shell lives entirely in `electron/` and nothing in `src/`
imports it.

## Why Electron and not Tauri

Tauri would ship an ~8 MB binary instead of ~90 MB, which is genuinely
nicer. It was rejected for one reason: on Linux, Tauri renders in
WebKitGTK. Every other Oceans Symphony target runs Blink (Chrome, the
Android WebView), and the storage layer has a seven-scenario boot
contract (see CLAUDE.md "Storage Layer Invariants") that is only ever
tested against Chromium's IndexedDB behaviour and quota rules. Adding a
second rendering engine means adding a second, untested storage
behaviour to the one part of the app where a bug loses user data.
Electron bundles the same Chromium the app is already known-good on.

## Running it

```bash
npm run desktop:start     # build dist/, then launch
npm run desktop           # launch against whatever is already in dist/
npm run dev               # terminal 1: Vite dev server
npm run desktop:dev       # terminal 2: launch pointed at the dev server
```

`desktop:dev` deliberately doesn't spawn Vite itself — no
`concurrently` dependency for something you already run.

## Packaging

```bash
npm run desktop:build     # → release/OceansSymphony-<version>-x64.AppImage
                          #   release/oceans-symphony_<version>_amd64.deb
```

Config: `electron-builder.config.cjs`. Notes:

- Output goes to `release/`, **not** `dist/` — `dist/` is Vite's output
  and the payload being packaged. electron-builder's default would
  clobber it.
- The version comes from `src/lib/appVersion.js`, not `package.json`
  (whose `version` is a base44 leftover pinned at `0.0.0`). So the
  release checklist stays a triple and artifact names stay honest.
- `files` excludes `node_modules`: Vite already bundled every renderer
  dependency into `dist/`, and the main process uses only Electron
  built-ins.
- The `.deb` target does NOT need `dpkg`/`fakeroot` installed —
  electron-builder downloads its own `fpm` on first use. It DOES need
  `homepage` and `desktopName` in `extraMetadata` (both set): without
  `homepage`, fpm refuses and the whole build task fails rather than
  skipping the deb and keeping the AppImage.
- Verified on Linux Mint: both artifacts build, and the packaged
  AppImage runs from asar with the same origin and userData path as
  `npm run desktop` (so it opens the same database, not a fresh one).
- `linux.maintainer` is a placeholder (`noreply@oceans-symphony.app`).
  `.deb` requires the field; set it to a real project address before
  any public distribution.

## The two pinned identities — do not change these

Both of these are effectively **the address of the user's database**.
Changing either one orphans every existing desktop user's data.

1. **Origin: `symphony://app`** (`APP_SCHEME` / `APP_HOST` in
   `electron/main.cjs`). Chromium keys IndexedDB by origin.
2. **App name: `Oceans Symphony`** (`app.setName()`), which decides
   `app.getPath('userData')` — where Chromium writes the IndexedDB
   files. On Linux that is `~/.config/Oceans Symphony`.

A custom scheme is used rather than `file://` because `file://` is an
opaque origin (IndexedDB unavailable or non-persistent), is not a secure
context (no Service Worker, no `crypto.subtle`), and resolves Vite's
absolute `/assets/…` paths against the filesystem root.

## Desktop-specific runtime branches

Everything branches at runtime via `isDesktop()` in
`src/lib/platform.js`, which reads the frozen `window.symphonyDesktop`
object the preload exposes. Never sniff the user agent — Electron's UA
contains "Chrome" and would be mis-detected as the web build.

- **No Service Worker.** The Cache API only accepts http/https requests,
  so `sw.js`'s install throws on the `symphony://` scheme. Skipped in
  `src/main.jsx`. Nothing is lost: offline caching is pointless when the
  assets are on local disk, and `/local-image/` avatar interception
  already falls back to reading IndexedDB directly whenever no SW
  controls the page (`swServesLocalImages()` in `imageUrlResolver.js`) —
  the same path iOS uses.
- **No web push.** There is no push service behind the shell;
  `pushRegistration.js` fails early with that reason instead of a
  confusing scheme error. Local/OS notifications are unaffected.
- **Absolute API URLs.** The page isn't served from the deploy that
  hosts `/api/*`, so relative paths would 404. All three server surfaces
  now resolve through `src/lib/apiBase.js`.
- **Single instance.** Two windows would be two renderers holding two
  copies of the same single-blob database, and the staler one's next save
  would revert the other's writes. `requestSingleInstanceLock()` prevents
  a second instance entirely.

## Data on desktop

The desktop app's database is separate from your browser's and your
phone's — different origin, different store. First run therefore looks
empty, which is what `src/components/onboarding/DesktopFirstRunNotice.jsx`
exists to explain, alongside the existing "Import a backup file" path.

Recovery bonus: on desktop the database is a directory you can copy.
File → Open Data Folder (and the notice's folder button) opens
`~/.config/Oceans Symphony`.

Cross-device sync shipped in v0.242.0 — see `docs/device-sync.md`. The
first-run notice offers "Sync from another device" (pull straight off a
phone over USB) above the backup-file import.


## Not done yet

- **Self-hosted Friends relay.** `apiBase.js` has the host override so
  this is a setting rather than a code change, but the server side
  (running `api/friends/*` off Vercel against a real Redis) and the fact
  that friend codes are scoped to whichever relay minted them are both
  still to do. Not federation — one home relay per user.
- Windows and macOS builds, auto-update, and a tray icon.
