// Post-`vite build` step: ensure assetlinks.json is available at
// /.well-known/assetlinks.json in the deployed site. This is the location
// Android requires for Digital Asset Links verification (used by the
// existing Bubblewrap TWA, NOT by the Capacitor native build).
//
// Written as a Node script (rather than the original Unix `mkdir -p && cp`
// shell chain) so it runs on Windows PowerShell / CMD without needing
// `shx` or WSL.
//
// Idempotent: safe to re-run, recursive mkdir, overwrite-on-copy.

import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const src = resolve(root, 'public', 'assetlinks.json');
const destDir = resolve(root, 'dist', '.well-known');
const dest = resolve(destDir, 'assetlinks.json');

if (!existsSync(src)) {
  console.error(`[finalize-build] missing ${src}`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[finalize-build] copied ${src} -> ${dest}`);
