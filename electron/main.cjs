// Oceans Symphony — Electron desktop shell (main process).
//
// FOURTH BUILD TARGET. The web PWA, the Bubblewrap TWA and the Capacitor
// native build are untouched by this file; nothing here is imported by
// `src/`. The renderer runs the SAME `dist/` bundle every other target
// runs, so the desktop app is purely additive — see CLAUDE.md
// "Build Targets".
//
// ── Why a custom protocol instead of file:// ──
//
// Loading the app from `file://` would be the obvious thing and is wrong
// in three separate ways that all end in data loss:
//
//   1. `file://` is an OPAQUE origin. IndexedDB under an opaque origin is
//      either unavailable or non-persistent depending on Chromium
//      version — i.e. the entire local-first database, gone.
//   2. Service Workers refuse to register outside a secure context, so
//      `/local-image/<id>` avatar interception would never run.
//   3. Absolute asset paths (`/assets/…`, which is what Vite emits)
//      resolve against the filesystem root, not the app.
//
// So we register `symphony://app` as a standard, secure,
// service-worker-capable scheme and serve `dist/` from it. That gives a
// STABLE ORIGIN — which is the load-bearing property: Chromium keys
// IndexedDB by origin, so the origin string is effectively the address of
// the user's database. Changing APP_SCHEME or APP_HOST in a later release
// would orphan every existing desktop user's data. Don't.
//
// The same reasoning applies to the app name: `app.setName()` decides
// `app.getPath('userData')`, which is where Chromium puts the IndexedDB
// files. Renaming it moves the database. Both values are pinned below and
// documented in docs/desktop-setup.md.

const { app, BrowserWindow, Menu, shell, protocol, session, dialog, ipcMain, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const { execFile } = require('node:child_process');

// ── Pinned identity (see header: these ARE the database address) ──
const APP_SCHEME = 'symphony';
const APP_HOST = 'app';
const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
const APP_NAME = 'Oceans Symphony';

app.setName(APP_NAME);

// ── Platform ──
// Linux and Windows are both built. Every difference between them is a
// runtime branch on process.platform in this file — never a second entry
// point, never a build-time switch (CLAUDE.md "Build Targets").
//
// On Windows, userData is %APPDATA%\Oceans Symphony — the same
// app.setName() above decides it, so nothing here moves anyone's data.
const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';

// Windows ties notifications and taskbar grouping to an App User Model ID.
// Without one, toasts either don't appear or are attributed to "Electron".
// It MUST equal electron-builder's `appId`, because that is the id the
// NSIS installer stamps on the Start-menu shortcut — a mismatch makes the
// pinned taskbar icon and the running window two separate buttons. This
// has no effect on storage (userData comes from the app name, not this).
const WINDOWS_APP_USER_MODEL_ID = 'app.oceans-symphony.desktop';
if (IS_WINDOWS) app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);

// Renderer assets. Packaged: resources/app.asar/dist. Dev: <repo>/dist.
const DIST_DIR = path.join(__dirname, '..', 'dist');

// Point the shell at a running Vite dev server instead of dist/ —
// `npm run desktop:dev` sets this. The dev server is plain http on
// localhost, which is already a secure context, so Service Workers and
// IndexedDB behave there too (under a DIFFERENT origin than the packaged
// app, so dev work never touches real desktop data — deliberate).
const DEV_SERVER_URL = process.env.SYMPHONY_DEV_SERVER || '';

// Must run before `app.whenReady()`.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,          // parseable origin → IndexedDB gets a real key
      secure: true,            // secure context → SW + Cache API + crypto.subtle
      supportFetchAPI: true,
      allowServiceWorkers: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

// Explicit Content-Type per extension rather than trusting file:// sniffing:
// Chromium enforces the JavaScript MIME type for ES modules, and a wrong or
// missing type makes the whole app fail to boot with a blank window.
const contentTypeFor = (filePath) =>
  MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';

// Anything under /assets/ is content-hashed by Vite, so it can be cached
// forever. index.html and the service worker must never be — this mirrors
// the header block in vercel.json so desktop update behaviour matches web.
function cacheControlFor(relPath) {
  if (relPath.startsWith('assets/')) return 'public, max-age=31536000, immutable';
  if (relPath === 'sw.js' || relPath === 'sw-reminders.js' || relPath === 'index.html') {
    return 'no-cache, no-store, must-revalidate';
  }
  return 'no-cache';
}

async function serveFile(absPath, relPath) {
  const data = await fsp.readFile(absPath);
  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': contentTypeFor(absPath),
      'Cache-Control': cacheControlFor(relPath),
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// The app uses BrowserRouter, so `symphony://app/Journals` is a real route
// with no file behind it. Requests with no extension fall back to
// index.html (the SPA shell), exactly like the catch-all rewrite in
// vercel.json. Requests that DO name a file type 404 honestly instead —
// a missing chunk must not be answered with HTML, or the failure surfaces
// as an unreadable syntax error instead of a 404.
async function handleAppRequest(request) {
  let relPath;
  try {
    relPath = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '');
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (!relPath) relPath = 'index.html';

  const absPath = path.join(DIST_DIR, relPath);
  // Path-traversal guard: never serve outside dist/.
  const rootWithSep = DIST_DIR.endsWith(path.sep) ? DIST_DIR : DIST_DIR + path.sep;
  if (absPath !== DIST_DIR && !absPath.startsWith(rootWithSep)) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const stat = await fsp.stat(absPath);
    if (stat.isFile()) return await serveFile(absPath, relPath);
    if (stat.isDirectory()) {
      const indexPath = path.join(absPath, 'index.html');
      if (fs.existsSync(indexPath)) return await serveFile(indexPath, 'index.html');
    }
  } catch {
    // falls through to the SPA fallback / 404 below
  }

  if (path.extname(relPath)) return new Response('Not found', { status: 404 });

  try {
    return await serveFile(path.join(DIST_DIR, 'index.html'), 'index.html');
  } catch {
    return new Response('index.html missing — run `npm run build` first.', { status: 500 });
  }
}

// ── Window bounds, remembered across launches ──
// Written to userData, never into the app database. Every read and write is
// swallowed on failure: a corrupt window-state file must not stop the app
// from opening, because the app is the only way to reach the data.
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function readWindowState() {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const ok = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
    if (!ok(raw.width) || !ok(raw.height)) return null;
    return raw;
  } catch {
    return null;
  }
}

function saveWindowState(win) {
  try {
    if (!win || win.isDestroyed()) return;
    const bounds = win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds();
    fs.writeFileSync(
      stateFile(),
      JSON.stringify({ ...bounds, maximized: win.isMaximized() }),
      'utf8',
    );
  } catch {
    /* best effort */
  }
}

// Windows only: a laptop that was last used on an external monitor
// reopens with saved x/y pointing at a screen that no longer exists, and
// the window opens invisibly off to the side — which reads as "the app
// won't start". If the saved top-left isn't on any current display, drop
// the position (keep the size) and let the OS place the window.
// Linux behaviour is left exactly as it was.
function onScreenPosition(saved) {
  if (!saved || typeof saved.x !== 'number' || typeof saved.y !== 'number') return saved;
  if (!IS_WINDOWS) return saved;
  try {
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      saved.x >= a.x - 50 && saved.x < a.x + a.width - 50
      && saved.y >= a.y - 10 && saved.y < a.y + a.height - 50);
    if (visible) return saved;
    return { width: saved.width, height: saved.height, maximized: saved.maximized };
  } catch {
    return saved;
  }
}

// Window/taskbar icon. Windows renders .ico crisply at every size it
// needs (title bar 16px, taskbar 32px, Alt-Tab 48px+); a PNG gets
// rescaled and blurs. The installer's own icon comes from
// electron-builder.config.cjs, not from here.
function windowIconPath() {
  const ico = path.join(__dirname, 'build', 'icon.ico');
  if (IS_WINDOWS && fs.existsSync(ico)) return ico;
  return path.join(__dirname, 'build', 'icon.png');
}

let mainWindow = null;

function createWindow() {
  const saved = onScreenPosition(readWindowState());

  mainWindow = new BrowserWindow({
    width: saved?.width ?? 1280,
    height: saved?.height ?? 880,
    x: saved?.x,
    y: saved?.y,
    // The UI is mobile-first and responsive; a narrow window is a
    // legitimate layout (it renders the phone board), so the minimum is
    // phone-sized rather than desktop-sized.
    minWidth: 380,
    minHeight: 520,
    title: APP_NAME,
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    icon: windowIconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [`--symphony-desktop=${Buffer.from(JSON.stringify({
        shell: 'electron',
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        os: process.platform,
        dataPath: app.getPath('userData'),
      })).toString('base64')}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The renderer is our own bundle served from our own origin; it
      // never loads remote code (CSP script-src 'self'). Web security
      // stays ON — no exceptions, this is a personal-data app.
      webSecurity: true,
      spellcheck: true,
    },
  });

  if (saved?.maximized) mainWindow.maximize();

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // A blank window with no explanation is the worst failure mode here —
  // the user assumes their data is gone. Say what actually happened.
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return; // ERR_ABORTED — normal during navigation
    dialog.showErrorBox(
      'Oceans Symphony could not load',
      `Failed to load ${validatedURL}\n\n${errorDescription} (${errorCode})\n\n` +
        'Your data is stored separately and is not affected by this error. ' +
        'If you are running from source, make sure `npm run build` has been run.',
    );
  });

  // External links leave the app. This is what makes the existing
  // openExternalUrl() helper work unchanged on desktop: it calls
  // window.open(), which lands here, and we hand the URL to the real
  // browser instead of opening a second Electron window with no chrome.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_ORIGIN) || (DEV_SERVER_URL && url.startsWith(DEV_SERVER_URL))) {
      return { action: 'allow' };
    }
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Same rule for in-place navigations: the main window must never leave
  // the app origin, or the SPA (and its IndexedDB origin) goes with it.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith(APP_ORIGIN) || (DEV_SERVER_URL && url.startsWith(DEV_SERVER_URL));
    if (allowed) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  for (const ev of ['resize', 'move', 'close']) {
    mainWindow.on(ev, () => saveWindowState(mainWindow));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load the ORIGIN ROOT, not /index.html. The app uses BrowserRouter, so
  // the URL path is the route: "/index.html" is a route named
  // "index.html", which matches nothing and renders the 404 page. The
  // protocol handler maps "/" to index.html itself.
  const target = DEV_SERVER_URL || `${APP_ORIGIN}/`;
  mainWindow.loadURL(target);
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Data Folder',
          // Deliberate: the recovery story for desktop is "your database
          // is a folder you can copy". Surfacing it makes a manual
          // snapshot possible even if the app itself won't start.
          click: () => shell.openPath(app.getPath('userData')),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
    ...(canSelfUpdate() ? [{
      label: 'Help',
      submenu: [{
        label: 'Check for updates automatically',
        type: 'checkbox',
        checked: readUpdateConsent() === true,
        click: (item) => {
          writeUpdateConsent(item.checked);
          if (item.checked) startUpdater(); else stopUpdater();
        },
      }],
    }] : []),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Auto-update ───────────────────────────────────────────────────────
//
// Linux: AppImage ONLY. A .deb is a system-installed package that apt
// owns — electron-updater cannot replace it, and trying produces a
// confusing error for someone who installed the "proper" way.
// process.env.APPIMAGE is set by the AppImage runtime itself, so it is the
// honest test for "this build can replace itself".
//
// Windows: the NSIS installer. electron-updater reads latest.yml from the
// same GitHub release the Linux build uses (Linux reads latest-linux.yml),
// downloads the new installer and runs it. The installer is per-user, so
// updating never needs an admin prompt. A portable .exe (not built today)
// can't replace itself, so it is skipped the same way a .deb is.
//
// Nothing is installed behind the user's back: the download happens
// quietly, and the swap only occurs when they say yes or when they next
// quit. The one thing worse than a stale app for these users would be one
// that restarts itself mid-journal-entry.
// ── Update checks need a yes (owner, 2026-10-01) ──
// Checking for a new version contacts GitHub. The app makes no network
// contact the person didn't agree to, so the first time an updatable
// build starts it ASKS, remembers the answer in <userData>/update-consent.json,
// and Help → "Check for updates automatically" changes it any time.
const consentFile = () => path.join(app.getPath('userData'), 'update-consent.json');
function readUpdateConsent() {
  try { const v = JSON.parse(fs.readFileSync(consentFile(), 'utf8')); return typeof v?.allowed === 'boolean' ? v.allowed : null; }
  catch { return null; }
}
function writeUpdateConsent(allowed) {
  try { fs.writeFileSync(consentFile(), JSON.stringify({ allowed, at: new Date().toISOString() })); } catch { /* best effort */ }
}

function canSelfUpdate() {
  if (!app.isPackaged) return false;           // dev runs are not updatable
  if (IS_LINUX) {
    if (!process.env.APPIMAGE) {
      console.log('[update] not an AppImage (deb/source) — updates come from your package manager');
      return false;
    }
    return true;
  }
  if (IS_WINDOWS) {
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      console.log('[update] portable build — download the new version by hand');
      return false;
    }
    return true;
  }
  return false;                                // macOS: not built yet
}

function setUpAutoUpdate() {
  if (!canSelfUpdate()) return;
  const consent = readUpdateConsent();
  if (consent === false) return;
  if (consent === true) { startUpdater(); return; }
  // Not asked yet: ask once the window is up.
  setTimeout(async () => {
    try {
      const { response } = await dialog.showMessageBox(mainWindow || undefined, {
        type: 'question',
        buttons: ['Check for updates', 'Not now'],
        defaultId: 0,
        cancelId: 1,
        message: 'Check for new versions automatically?',
        detail: 'When on, the app asks GitHub (where it is published) whether a newer version exists — at start and every few hours. Nothing about you or your data is sent. You can change this any time under Help.',
      });
      const allowed = response === 0;
      writeUpdateConsent(allowed);
      buildMenu();
      if (allowed) startUpdater();
    } catch { /* ask again next launch */ }
  }, 3000);
}

let _updaterStarted = false;
let _updateTimer = null;
function stopUpdater() {
  if (_updateTimer) { clearInterval(_updateTimer); _updateTimer = null; }
}

function startUpdater() {
  if (_updaterStarted) {
    // Turned back on after being switched off: resume the schedule.
    if (!_updateTimer && _checkForUpdates) _updateTimer = setInterval(_checkForUpdates, 6 * 60 * 60 * 1000);
    return;
  }
  _updaterStarted = true;

  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) {
    console.warn('[update] electron-updater unavailable:', e?.message || e);
    return;
  }

  autoUpdater.autoDownload = true;
  // Never swap the binary out from under someone mid-sentence.
  autoUpdater.autoInstallOnAppQuit = true;

  let promptOpen = false;
  autoUpdater.on('update-downloaded', async (info) => {
    if (promptOpen || !mainWindow || mainWindow.isDestroyed()) return;
    promptOpen = true;
    try {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 1,          // "Later" — an accidental Enter must not restart
        cancelId: 1,
        title: 'Update ready',
        message: `Oceans Symphony ${info?.version || ''} is ready to install.`.trim(),
        detail: 'It will be applied next time you quit, or you can restart now. Your data is not affected either way.',
      });
      if (response === 0) {
        // Windows: run the installer silently and reopen the app, so the
        // user sees the app close and come back, not an installer window.
        // Linux keeps electron-updater's defaults (AppImage swap).
        setImmediate(() => (IS_WINDOWS ? autoUpdater.quitAndInstall(true, true) : autoUpdater.quitAndInstall()));
      }
    } finally {
      promptOpen = false;
    }
  });

  autoUpdater.on('error', (err) => {
    // Offline, rate-limited, no release yet — all normal. Log, never
    // interrupt: a failed update check is not the user's problem.
    console.warn('[update] check failed:', err?.message || err);
  });

  const check = () => { if (readUpdateConsent() === true) autoUpdater.checkForUpdates().catch(() => {}); };
  _checkForUpdates = check;
  // Not at launch: first paint matters more than an update check.
  setTimeout(check, 30_000);
  _updateTimer = setInterval(check, 6 * 60 * 60 * 1000);
  _updateTimer.unref?.();
}
let _checkForUpdates = null;

// ── Single instance ──
//
// Two instances would be two renderers holding two in-memory copies of the
// SAME single-blob database, and the staler one's next save would revert
// the other's writes. localDb has cross-tab guards (BroadcastChannel +
// generation sidecar) for exactly this, but the correct fix on desktop is
// to never have a second instance at all.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    protocol.handle(APP_SCHEME, handleAppRequest);

    // Default-deny permissions, allowing only what the app actually uses.
    // Mirrors the Permissions-Policy header in vercel.json.
    const allowed = new Set([
      'notifications',
      'geolocation',
      'clipboard-read',
      'clipboard-sanitized-write',
      'fullscreen',
      'background-sync',
    ]);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(allowed.has(permission));
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

    // The single renderer→main channel. Takes no arguments on purpose:
    // the renderer cannot ask us to open an arbitrary path, only the one
    // folder we already expose in the File menu.
    ipcMain.handle('symphony:open-data-folder', () => shell.openPath(app.getPath('userData')));

    // ── Private-file copy (src/lib/nativeMirror.js) ──
    // The same second copy of every database blob, picture and font the
    // Android app keeps in its private files, here in
    // <userData>/symphony-safe/. Chromium's IndexedDB used to be the ONLY
    // place desktop data lived (audit 2026-10-01, durability L8); a damaged
    // profile database now has a copy beside it that boot puts back into an
    // empty store. Confined to that one folder: every path must start with
    // "symphony-safe/", use only the mirror's own filename characters, and
    // never climb out. Writes go to a temp file then rename (atomic).
    const SAFE_ROOT = 'symphony-safe';
    const SAFE_PATH_RE = /^symphony-safe(\/[A-Za-z0-9_~.-]+)*$/;
    function safeResolve(rel) {
      if (typeof rel !== 'string' || !SAFE_PATH_RE.test(rel) || rel.split('/').some((p) => p === '..' || p === '.')) return null;
      const base = path.join(app.getPath('userData'), SAFE_ROOT);
      const full = path.join(app.getPath('userData'), ...rel.split('/'));
      if (full !== base && !full.startsWith(base + path.sep)) return null;
      return full;
    }
    ipcMain.handle('symphony:safe:read', async (_e, rel) => {
      const full = safeResolve(rel);
      if (!full) return { ok: false, error: 'Refused path.' };
      try { return { ok: true, data: await fsp.readFile(full, 'utf8') }; }
      catch (e) { return { ok: false, error: e?.code || String(e) }; }
    });
    ipcMain.handle('symphony:safe:write', async (_e, rel, text) => {
      const full = safeResolve(rel);
      if (!full || typeof text !== 'string') return { ok: false, error: 'Refused.' };
      try {
        await fsp.mkdir(path.dirname(full), { recursive: true });
        const tmp = `${full}.tmp-${process.pid}`;
        await fsp.writeFile(tmp, text, 'utf8');
        await fsp.rename(tmp, full);
        return { ok: true };
      } catch (e) { return { ok: false, error: e?.code || String(e) }; }
    });
    ipcMain.handle('symphony:safe:remove', async (_e, rel) => {
      const full = safeResolve(rel);
      if (!full || full === path.join(app.getPath('userData'), SAFE_ROOT)) return { ok: false, error: 'Refused path.' };
      try { await fsp.rm(full, { force: true }); return { ok: true }; }
      catch (e) { return { ok: false, error: e?.code || String(e) }; }
    });
    ipcMain.handle('symphony:safe:list', async (_e, rel) => {
      const full = safeResolve(rel);
      if (!full) return { ok: false, error: 'Refused path.' };
      try {
        const names = await fsp.readdir(full);
        return { ok: true, files: names.filter((n) => !n.includes('.tmp-')) };
      } catch (e) { return e?.code === 'ENOENT' ? { ok: true, files: [] } : { ok: false, error: e?.code || String(e) }; }
    });

    // ── Device sync (v0.242.0) ────────────────────────────────────────
    //
    // Files only. No sockets, no network — plug a phone in and point the
    // app at its storage, or use a USB stick. See src/lib/deviceSync.js.
    //
    // CONTAINMENT: the renderer may name a directory, but every operation
    // is refused unless the FILENAME is one of our own snapshot files.
    // So even a compromised renderer can't read ~/.ssh or overwrite a
    // user's documents through this channel — the worst it can do is
    // read and write files it already owns.
    // A phone plugged in over USB mounts through gvfs, and gvfs's FUSE
    // layer rejects EVERY POSIX write — writeFile, copyFile, streams and
    // rename all fail with ENOTSUP, whether creating or overwriting.
    // Reads and unlink work fine; it is writes specifically. Verified
    // against a Samsung device: even `cp` fails, while `gio copy`
    // succeeds, because GIO talks to the gvfs daemon directly instead of
    // going through the FUSE mount.
    //
    // So: try POSIX first (fast, and what every normal disk wants), and
    // fall back to staging a local temp file and handing it to `gio`.
    // gio ships with glib2 and is by definition present when the path is
    // a /gvfs/ mount, since that is what mounted it.
    function gioCopy(src, dest) {
      return new Promise((resolve, reject) => {
        execFile('gio', ['copy', src, dest], { timeout: 180000 }, (err, _out, stderr) => {
          if (err) {
            const detail = String(stderr || err.message || '').trim();
            reject(new Error(detail || 'gio copy failed'));
            return;
          }
          resolve();
        });
      });
    }

    const SYNC_FILE_RE = /^symphony-sync-[A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.(data|media)\.json$/;

    const badName = (name) =>
      typeof name !== 'string' || name.includes('/') || name.includes('\\')
      || name.includes('\0') || !SYNC_FILE_RE.test(name);

    // Windows: Explorer's "Copy as path" wraps the path in double quotes
    // ("D:\My Sync"), and a bare drive ("E:") is not absolute to Node —
    // it means "the current directory on E:". Both are what a person
    // naturally pastes for a USB stick, so accept them. Spaces and drive
    // letters need nothing else: every path below goes through path.join.
    // Linux paths pass through untouched.
    function normDir(dir) {
      if (!IS_WINDOWS || typeof dir !== 'string') return dir;
      let d = dir.trim();
      if (d.length >= 2 && d.startsWith('"') && d.endsWith('"')) d = d.slice(1, -1).trim();
      if (/^[A-Za-z]:$/.test(d)) d += '\\';
      return d;
    }

    // Windows: renaming over a file that something else has open (the
    // search indexer, antivirus, a cloud-sync client, Explorer's preview
    // pane) fails briefly with EPERM/EBUSY/EACCES and succeeds a moment
    // later. Retry a few times before giving up on the atomic write — the
    // same thing graceful-fs does. Linux never retries: a POSIX rename
    // that fails won't succeed 100ms later.
    async function renameWithRetry(from, to) {
      const transient = new Set(['EPERM', 'EBUSY', 'EACCES']);
      for (let attempt = 0; ; attempt++) {
        try {
          await fsp.rename(from, to);
          return;
        } catch (e) {
          if (!IS_WINDOWS || attempt >= 5 || !transient.has(e?.code)) throw e;
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
        }
      }
    }

    async function usableDir(dir) {
      if (typeof dir !== 'string' || !path.isAbsolute(dir)) return false;
      try {
        const st = await fsp.stat(dir);
        return st.isDirectory();
      } catch {
        return false;
      }
    }

    ipcMain.handle('symphony:sync:pick-folder', async () => {
      const res = await dialog.showOpenDialog(mainWindow, {
        title: 'Choose the folder to sync through',
        properties: ['openDirectory', 'createDirectory'],
        message: 'Pick a folder both devices can reach — a plugged-in phone, or a USB stick.',
      });
      if (res.canceled || !res.filePaths?.length) return { ok: true, path: null };
      return { ok: true, path: res.filePaths[0] };
    });

    ipcMain.handle('symphony:sync:list', async (_e, rawDir) => {
      const dir = normDir(rawDir);
      if (!(await usableDir(dir))) return { ok: false, error: 'That folder is not reachable. If it is a phone, check it is still plugged in and unlocked.' };
      try {
        const names = await fsp.readdir(dir);
        const files = [];
        for (const name of names) {
          if (badName(name)) continue;
          try {
            const st = await fsp.stat(path.join(dir, name));
            if (st.isFile()) files.push({ name, size: st.size, mtimeMs: st.mtimeMs });
          } catch { /* skip unreadable entries rather than failing the listing */ }
        }
        return { ok: true, files };
      } catch (e) {
        return { ok: false, error: e?.message || 'Could not read that folder.' };
      }
    });

    ipcMain.handle('symphony:sync:read', async (_e, rawDir, name) => {
      const dir = normDir(rawDir);
      if (badName(name)) return { ok: false, error: 'Refused: not a sync file.' };
      if (!(await usableDir(dir))) return { ok: false, error: 'That folder is not reachable.' };
      try {
        return { ok: true, text: await fsp.readFile(path.join(dir, name), 'utf8') };
      } catch (e) {
        return { ok: false, error: e?.message || 'Could not read that file.' };
      }
    });

    // Removing a snapshot is how the app cleans up after a device that
    // was reinstalled (new id = new filename, old file lingers forever)
    // or after a half-written file. Same filename guard as everything
    // else, so this can't be turned into "delete any file".
    ipcMain.handle('symphony:sync:remove', async (_e, rawDir, name) => {
      const dir = normDir(rawDir);
      if (badName(name)) return { ok: false, error: 'Refused: not a sync file.' };
      if (!(await usableDir(dir))) return { ok: false, error: 'That folder is not reachable.' };
      try {
        await fsp.unlink(path.join(dir, name));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e?.message || 'Could not remove that file.' };
      }
    });

    ipcMain.handle('symphony:sync:write', async (_e, rawDir, name, text) => {
      const dir = normDir(rawDir);
      if (badName(name)) return { ok: false, error: 'Refused: not a sync file.' };
      if (!(await usableDir(dir))) return { ok: false, error: 'That folder is not reachable. If it is a phone, check it is still plugged in and unlocked.' };
      if (typeof text !== 'string') return { ok: false, error: 'Nothing to write.' };
      const dest = path.join(dir, name);
      const tmp = `${dest}.part`;
      try {
        // Write-then-rename, so a yanked USB cable can never leave a
        // half-written snapshot that the other device would then try to
        // merge. The reader only ever sees a complete file.
        await fsp.writeFile(tmp, text, 'utf8');
        await renameWithRetry(tmp, dest);
        return { ok: true };
      } catch (e) {
        // MTP and some removable filesystems don't support rename. Fall
        // back to a direct write rather than refusing to sync at all;
        // the risk window is small and the alternative is no sync.
        try {
          await fsp.writeFile(dest, text, 'utf8');
          try { await fsp.unlink(tmp); } catch { /* best effort */ }
          return { ok: true, atomic: false };
        } catch (e2) {
          try { await fsp.unlink(tmp); } catch { /* best effort */ }
          // Last resort: a gvfs/MTP mount (a phone over USB). See gioCopy.
          if (IS_LINUX) {
            const staged = path.join(os.tmpdir(), `symphony-sync-${process.pid}-${Date.now()}.json`);
            try {
              await fsp.writeFile(staged, text, 'utf8');
              await gioCopy(staged, dest);
              return { ok: true, atomic: false, via: 'gio' };
            } catch (e3) {
              return {
                ok: false,
                error: `Couldn't write to that folder. Direct write failed (${e2?.code || e2?.message || 'unknown'}) and copying via gio failed too: ${e3?.message || e3}`,
              };
            } finally {
              try { await fsp.unlink(staged); } catch { /* best effort */ }
            }
          }
          return { ok: false, error: e2?.message || e?.message || 'Could not write to that folder.' };
        }
      }
    });

    buildMenu();
    createWindow();
    setUpAutoUpdate();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    // Linux/Windows convention: closing the window quits. No tray in this
    // phase, so staying resident would just be an invisible process
    // holding the single-instance lock.
    app.quit();
  });
}
