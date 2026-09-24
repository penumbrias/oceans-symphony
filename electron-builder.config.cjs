// electron-builder configuration for the Linux desktop build.
//
// Run via `npm run desktop:build` (which builds dist/ first — the packaged
// app serves that exact directory, so a stale dist ships a stale app).
//
// ── Version ──
// package.json's "version" is a base44 leftover stuck at 0.0.0, and the
// real version lives in src/lib/appVersion.js (the file the release
// checklist already bumps). Reading it here keeps the artifact filenames
// and the in-app version label in lockstep without adding a fourth file
// to the checklist.
//
// ── Size ──
// `files` deliberately excludes node_modules: Vite has already bundled
// every renderer dependency into dist/, and the main process requires
// nothing but Electron's own built-ins. Shipping the dependency tree
// (three, firebase-admin, jspdf…) a second time would roughly double the
// download for no benefit.

const fs = require('node:fs');
const path = require('node:path');

function readAppVersion() {
  const file = path.join(__dirname, 'src', 'lib', 'appVersion.js');
  const match = /APP_VERSION\s*=\s*["']([^"']+)["']/.exec(fs.readFileSync(file, 'utf8'));
  if (!match) throw new Error('[electron-builder] could not read APP_VERSION from src/lib/appVersion.js');
  return match[1];
}

module.exports = {
  appId: 'app.oceans-symphony.desktop',
  productName: 'Oceans Symphony',
  // NOTE: this name decides app.getPath('userData') — i.e. the folder
  // Chromium keeps the IndexedDB database in. Changing it orphans every
  // existing desktop user's data. See electron/main.cjs's header.
  extraMetadata: {
    version: readAppVersion(),
    // package.json's `name` is still the base44 scaffold's "base44-app",
    // and electron-builder uses it for the .deb package name, the binary
    // inside /opt, the installed icon filename and the WM class. Left
    // alone, `apt` lists the app as "base44-app" and the launcher icon
    // doesn't bind to the window. productName only fixes the DISPLAY name.
    //
    // Safe for existing installs: the data directory comes from
    // app.setName('Oceans Symphony') in electron/main.cjs, not from this.
    name: 'oceans-symphony',
    // Required by the .deb target (fpm refuses to build without it) and
    // used as the Homepage field in the package metadata. Without this
    // the AppImage still builds but the deb fails the whole task.
    homepage: 'https://oceans-symphony.app',
    description: 'Journaling and organisation for plural systems',
    // Window association: without this the desktop environment can't link
    // the running window to the .desktop entry, so the dock/taskbar shows
    // a generic icon instead of the app's.
    desktopName: 'oceans-symphony.desktop',
    // electron-builder reads `main` from the packaged package.json.
    main: 'electron/main.cjs',
  },
  directories: {
    // NOT "dist" — that is Vite's output and the payload we are packaging.
    output: 'release',
    buildResources: 'electron/build',
  },
  files: [
    'dist/**/*',
    'electron/main.cjs',
    'electron/preload.cjs',
    'electron/build/icon.png',
    'package.json',
    '!node_modules/**',
  ],
  linux: {
    target: [
      // AppImage first: runs on any distro with no root and no packaging
      // infrastructure, which is what an alpha tester actually wants.
      { target: 'AppImage', arch: ['x64'] },
      // .deb for Mint / Ubuntu / Debian. Needs `dpkg` + `fakeroot` on the
      // BUILD machine; if they are missing, electron-builder skips it and
      // the AppImage still builds.
      { target: 'deb', arch: ['x64'] },
    ],
    category: 'Utility',
    syncDesktopName: true,
    synopsis: 'Journaling and organisation for plural systems',
    description:
      'Oceans Symphony is a local-first journaling and organisation tool built for plural and dissociative systems. Your data stays on your device.',
    icon: 'electron/build/icon.png',
    // Placeholder on purpose — .deb requires a maintainer field and this
    // should be a project address, not a personal one. Set it before any
    // public distribution.
    maintainer: 'Oceans Symphony <noreply@oceans-symphony.app>',
    desktop: {
      entry: {
        Name: 'Oceans Symphony',
        Comment: 'Journaling and organisation for plural systems',
        Categories: 'Utility;Office;',
        StartupWMClass: 'oceans-symphony',
      },
    },
  },
  appImage: {
    artifactName: 'OceansSymphony-${version}-${arch}.AppImage',
  },
  deb: {
    artifactName: 'oceans-symphony_${version}_${arch}.deb',
    // WebKit/Chromium runtime libs that Electron needs on Debian-likes.
    depends: [
      'libgtk-3-0',
      'libnotify4',
      'libnss3',
      'libxss1',
      'libxtst6',
      'xdg-utils',
      'libatspi2.0-0',
      'libsecret-1-0',
    ],
  },
};
