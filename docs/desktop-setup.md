# Desktop build (Electron) — Linux and Windows

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
`concurrently` dependency for something you already run. Its
`VAR=value command` syntax is POSIX-only; on Windows (PowerShell) run
`$env:SYMPHONY_DEV_SERVER="http://localhost:5173"; npx electron .`
instead.

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
   files. On Linux that is `~/.config/Oceans Symphony`; on Windows,
   `%APPDATA%\Oceans Symphony`.

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
`~/.config/Oceans Symphony` (Linux) or `%APPDATA%\Oceans Symphony`
(Windows).

Cross-device sync shipped in v0.242.0 — see `docs/device-sync.md`. The
first-run notice offers "Sync from another device" (pull straight off a
phone over USB) above the backup-file import.


## Windows

Added after v0.247.3. Same shell (`electron/main.cjs`), same pinned
origin and app name; every Windows difference is a runtime
`process.platform` branch in that file. Linux behaviour is unchanged.

### Building

```bash
npm run desktop:build:win   # → release/OceansSymphony-<version>-x64-Setup.exe
                            #   release/OceansSymphony-<version>-x64-Setup.exe.blockmap
                            #   release/latest.yml
```

Run it **on Windows** (Node 22, `npm ci` first). Cross-building from
Linux needs `wine` for the exe's icon/version resources; without it,
electron-builder fails at that step.

The easy way is GitHub Actions → **Desktop release** → *Run workflow*
(`.github/workflows/desktop-release.yml`, manual only). It builds the
Windows installer on a Windows runner AND the Linux AppImage + `.deb` on
a Linux runner, so nobody has to build anything by hand:

- **tag empty** → a test build. Both platforms' files are under
  *Artifacts* at the bottom of the run page. Nothing is published.
- **tag set** (e.g. `v0.250.1`, must already be pushed and must match
  `APP_VERSION` at that tag) → attaches every file (installer, blockmap,
  AppImage, `.deb`, `latest.yml`, `latest-linux.yml`) to that GitHub
  Release. If the release doesn't exist yet it's created once, as a
  **draft** marked to become *Latest*, with download + install notes, so
  nothing reaches users until it's published by hand.

### Publishing a release (checklist)

1. Merge the release's version bump to `main` and tag that commit:
   `git tag v0.250.1 && git push origin v0.250.1`.
2. Actions → **Desktop release** → *Run workflow* on `main`, tag
   `v0.250.1`.
3. When both jobs are green, open the draft on the Releases page, check
   the files are there, leave **Set as the latest release** ticked, and
   publish.
4. Share the release link — that's the download page.

Only desktop releases may be marked *Latest*: installed copies read
their update feed from whichever release GitHub calls Latest, so a
release without `latest.yml` (e.g. an Android-only one) marked Latest
stops desktop updates until the next desktop release.

### Installer

NSIS, one-click, **per-user**: no admin prompt, installs to
`%LOCALAPPDATA%\Programs\oceans-symphony`, adds Start-menu and desktop
shortcuts, launches when done. Config is the `win` / `nsis` blocks in
`electron-builder.config.cjs`.

**Unsigned.** There is no code-signing certificate, so the first install
shows *"Windows protected your PC"* (SmartScreen, "unknown publisher").
Click **More info → Run anyway**. Some browsers also flag the download
itself as uncommon — choose *Keep*. This is expected for any unsigned
app and goes away only with a paid certificate.

### Where data lives

`%APPDATA%\Oceans Symphony` (i.e. `C:\Users\<you>\AppData\Roaming\Oceans Symphony`).
File → Open Data Folder opens it. The installed program and the update
cache (`%LOCALAPPDATA%\oceans-symphony-updater`) are separate from it.

**Uninstalling keeps the data.** `deleteAppDataOnUninstall` is pinned
`false`: the uninstaller removes the program only, and reinstalling
opens the same database. To really wipe it, delete the folder above by
hand after uninstalling.

### Updates

electron-updater polls the latest **published** GitHub Release for
`latest.yml` (30 s after launch, then every 6 h), downloads the new
installer quietly, and asks *Restart now / Later*. *Later* (the default)
installs on next quit; *Restart now* installs silently and reopens the
app. Per-user install → no admin prompt. Updates are fetched by the app,
not a browser, so SmartScreen doesn't fire again. With no signing
certificate, electron-updater skips the publisher check but still
verifies the installer's sha512 from `latest.yml`.

A release only updates Windows users once `latest.yml` and the
`-Setup.exe` are attached; Linux reads `latest-linux.yml` from the same
release, so the two don't interfere.

### Windows-specific branches in `electron/main.cjs`

- `app.setAppUserModelId('app.oceans-symphony.desktop')` — must equal
  `appId`, or notifications are mis-attributed and the taskbar shows two
  buttons. Storage is unaffected (that's the app name).
- Window/taskbar icon uses `electron/build/icon.ico` (multi-size,
  generated from `icon.png`).
- A saved window position that's off every current display (laptop
  undocked from a monitor) is dropped, so the window can't open
  off-screen.
- Device sync: a pasted path in quotes (Explorer's *Copy as path*) or a
  bare drive (`E:`) is accepted; the write-then-rename retries briefly on
  `EPERM`/`EBUSY`/`EACCES` (search indexer, antivirus, cloud clients
  holding the file). The `gio` fallback stays Linux-only.

### Device sync on Windows — phones over USB

On Linux a plugged-in phone is mounted as a folder (gvfs), so the app can
read and write it directly. **Windows doesn't do that**: a phone over USB
(MTP) shows in File Explorer but is not a real folder path, so the folder
picker is expected to refuse it and a pasted path won't work. On Windows,
sync through:

- a **USB stick** or **SD card** both devices can use, or
- copying by hand: in File Explorer, copy the phone's
  `symphony-sync-…json` files from its sync folder into a folder on the
  PC, press Sync in the app (pointed at that PC folder), then copy the
  PC's file back to the phone.

Folders with spaces and on any drive letter work normally.

### What to test on a Windows laptop

The plain-language version for a tester is
[`docs/windows-test-checklist.md`](windows-test-checklist.md). In short:

1. Install (SmartScreen → More info → Run anyway); no admin prompt.
2. First run shows the empty-desktop notice; File → Open Data Folder
   opens `%APPDATA%\Oceans Symphony`.
3. Create data (an alter with an avatar, a journal entry, a status),
   close, reopen — everything is still there, avatar included.
4. Second launch while open focuses the existing window (single instance).
5. Sync: pick a folder with a space in its name, and a USB stick; press
   Sync; a `symphony-sync-…data.json` file appears. Paste a path from
   Explorer's *Copy as path* (with quotes) — accepted.
6. Export a backup, then import it — data intact.
7. Update: install version N, publish N+1 with `latest.yml` attached,
   wait ~30 s after launch → *Update ready* prompt → *Restart now* →
   reopens on N+1, data intact.
8. Uninstall from Settings → Apps → the data folder is still there;
   reinstall → data is back.

## Not done yet

- **Self-hosted Friends relay.** `apiBase.js` has the host override so
  this is a setting rather than a code change, but the server side
  (running `api/friends/*` off Vercel against a real Redis) and the fact
  that friend codes are scoped to whichever relay minted them are both
  still to do. Not federation — one home relay per user.
- macOS build, code signing (Windows installer is unsigned), and a tray
  icon.

## Update checks need a yes (v0.248.4)

The app makes no network contact the person didn't agree to. The first time an
updatable build starts (AppImage on Linux, the installed app on Windows) it asks
"Check for new versions automatically?" and remembers the answer in
`<userData>/update-consent.json`. **Help → Check for updates automatically**
changes it any time. Until the answer is yes, nothing contacts GitHub.

## Second copy of the data (v0.248.3)

Like the Android app, the desktop app keeps a second copy of every database
blob, picture and font in `<userData>/symphony-safe/` and puts it back into an
empty store at boot. See `src/lib/nativeMirror.js`.
