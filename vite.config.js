import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

// Vite excludes dot-prefixed directories under public/ from the build copy,
// so a file dropped at public/.well-known/assetlinks.json never lands in
// dist/. Serving via a Vercel rewrite seems to be flagged as a redirect by
// Google's Digital Asset Links verifier (zero redirects allowed). Copy the
// file into place at build time so it's served from the canonical path with
// no rewrite at all.
const copyWellKnownAssetlinks = () => ({
  name: 'copy-well-known-assetlinks',
  closeBundle() {
    const source = path.resolve('public/assetlinks.json')
    const destDir = path.resolve('dist/.well-known')
    fs.mkdirSync(destDir, { recursive: true })
    fs.copyFileSync(source, path.join(destDir, 'assetlinks.json'))
  },
})

// Route-level code splitting (v0.184.0) means most pages are separate JS
// chunks fetched on first navigation. The service worker caches assets on
// first fetch, so a page never visited ONLINE would be missing OFFLINE — a
// regression from the single-bundle days when everything was cached after
// first load. This emits the list of built chunks; sw.js prefetches them in
// the background after the shell is up, restoring "offline = everything".
const emitAssetList = () => ({
  name: 'emit-asset-list',
  closeBundle() {
    const dir = path.resolve('dist/assets')
    if (!fs.existsSync(dir)) return
    const files = fs.readdirSync(dir)
      .filter((f) => /\.(js|css)$/.test(f))
      .map((f) => `/assets/${f}`)
    fs.writeFileSync(path.resolve('dist/assets-list.json'), JSON.stringify({ v: Date.now(), files }))
  },
})

// Content-Security-Policy, injected as a <meta> tag at BUILD time only (a
// meta CSP in dev would break Vite's HMR websocket). The web deploy also gets
// this policy as a real header via vercel.json (which additionally carries
// frame-ancestors — meta CSP can't express it); the meta copy is what covers
// the Capacitor native build, whose WebView serves the same dist/ assets.
//
// Notes on the broad-looking bits:
// - style-src 'unsafe-inline': inline styles + runtime-injected <style> tags
//   (theme vars, scoped bio CSS, custom fonts) are load-bearing app-wide.
// - img/connect/media https:: the app deliberately fetches arbitrary remote
//   images (avatar caching, Simply Plural CDN, HTTP-image migration), so
//   these can't be pinned to a host list without breaking imports. Bio CSS
//   is held to a far stricter local-only url() allowlist in scopedBioStyle.
// - fonts.googleapis.com / fonts.gstatic.com: the OPT-IN "extra fonts" pack
//   (Settings → Appearance) — the only remote stylesheet the app ever loads.
//
// COUPLED TO index.html — DO NOT EDIT ONE WITHOUT THE OTHER.
// script-src carries the sha256 of the inline white-screen watchdog script in
// index.html. The hash covers the script's EXACT text, so any edit to it (even
// whitespace) invalidates the hash and the browser silently refuses to run the
// watchdog — which is precisely how it sat dead on every build target until
// v0.239.12. assertInlineScriptHashes() below fails the build when that drifts,
// and also checks the duplicate policy in vercel.json. If the build tells you
// the hash changed, paste the new one into BOTH this list and vercel.json.
const WATCHDOG_SCRIPT_HASH = 'sha256-lmVjp2JPA/TkzzTbAfli2KiE3kkbmx0n7xOrd18yDrA='

const CSP_POLICY = [
  "default-src 'self'",
  `script-src 'self' '${WATCHDOG_SCRIPT_HASH}'`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https:",
  "media-src 'self' blob: data: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
].join('; ')

// Every inline <script> in the HTML must be covered by a hash in script-src,
// otherwise the browser drops it on the floor with a console error nobody is
// watching. Verify that at build time rather than trusting a hand-copied
// constant, and verify vercel.json (the web deploy's real header, which the
// meta tag does NOT override) carries the same hashes.
function assertInlineScriptHashes(html) {
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  if (inline.length === 0) throw new Error('[csp] no inline <script> found in index.html — did the watchdog get removed?')

  let vercelCsp = ''
  try {
    const vercel = JSON.parse(fs.readFileSync(path.resolve('vercel.json'), 'utf8'))
    for (const entry of vercel.headers || []) {
      const hit = (entry.headers || []).find((h) => h.key === 'Content-Security-Policy')
      if (hit) vercelCsp += hit.value
    }
  } catch (err) {
    throw new Error(`[csp] could not read vercel.json to cross-check script hashes: ${err.message}`)
  }

  for (const [, body] of inline) {
    const hash = `sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}`
    const missing = []
    if (!CSP_POLICY.includes(hash)) missing.push('vite.config.js CSP_POLICY')
    if (!vercelCsp.includes(hash)) missing.push('vercel.json Content-Security-Policy header')
    if (missing.length) {
      throw new Error(
        `[csp] inline script in index.html hashes to '${hash}' but that hash is missing from: ${missing.join(', ')}.\n` +
        '      Paste the hash above into script-src in BOTH places. Until you do, the browser will block the\n' +
        '      script (the white-screen watchdog) and the blank-screen recovery will not run.'
      )
    }
  }
}

const injectCspMeta = () => ({
  name: 'inject-csp-meta',
  apply: 'build',
  transformIndexHtml(html) {
    assertInlineScriptHashes(html)
    return html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}" />`
    )
  },
})

export default defineConfig({
  logLevel: 'error',
  plugins: [react(), copyWellKnownAssetlinks(), injectCspMeta(), emitAssetList()],
  resolve: {
    alias: {
      '@': path.resolve('./src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Keep the OpenPlural zip dependency (fflate) in its own lazily-loaded
        // chunk so it stays OUT of the main entry bundle — it's only fetched
        // when a user actually opens the OpenPlural / PluralSpace importer and
        // picks a .zip (see src/lib/openPlural.js's dynamic `import("fflate")`).
        // Without this, Rollup folds the single-consumer dynamic import back
        // into the entry chunk since the app isn't otherwise code-split.
        manualChunks(id) {
          if (id.includes('node_modules/fflate')) return 'fflate'
        },
      },
    },
  },
})
