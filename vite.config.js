import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'

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
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
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

const injectCspMeta = () => ({
  name: 'inject-csp-meta',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}" />`
    )
  },
})

export default defineConfig({
  logLevel: 'error',
  plugins: [react(), copyWellKnownAssetlinks(), injectCspMeta()],
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
