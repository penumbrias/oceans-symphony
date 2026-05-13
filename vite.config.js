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

export default defineConfig({
  logLevel: 'error',
  plugins: [react(), copyWellKnownAssetlinks()],
  resolve: {
    alias: {
      '@': path.resolve('./src'),
    },
  },
})
