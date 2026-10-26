// Puts the pages of every switched-on mod into the app's navigation.
//
// ALL_PAGES (src/utils/navigationConfig.js) is the master page list that the
// bars, the dashboard grid, Navigation settings and quick actions read. Mod
// pages are spliced into that same array (marked `isMod`), so a mod page can
// be pinned anywhere a built-in page can, with no second list to forget.
// Components whose memos read ALL_PAGES add useModPagesVersion() to their
// dependencies so they re-read it when mods are installed or switched.

import { useEffect, useSyncExternalStore } from "react";
import { Puzzle } from "lucide-react";
import { ALL_PAGES } from "@/utils/navigationConfig";
import { useMods, syncBuiltinMods } from "@/lib/mods/modStore";
import { useExperimentalOn, subscribeExperimental } from "@/lib/experimentalFeatures";

export const modPageId = (modId, pageId) => `mod:${modId}:${pageId}`;
export const modPagePath = (modId, pageId) => `/mod/${modId}/${pageId}`;

export function modPagesFor(mods) {
  const out = [];
  for (const mod of mods || []) {
    if (!mod?.enabled) continue;
    for (const p of mod.pages || []) {
      out.push({
        id: modPageId(mod.mod_id, p.id),
        label: p.title,
        path: modPagePath(mod.mod_id, p.id),
        icon: Puzzle,
        isMod: true,
        modName: mod.name,
      });
    }
  }
  return out;
}

let version = 0;
const listeners = new Set();
let lastKey = "";

export function syncModPages(mods) {
  const pages = modPagesFor(mods);
  const key = pages.map((p) => `${p.id}|${p.label}`).join("\n");
  if (key === lastKey) return;
  lastKey = key;
  for (let i = ALL_PAGES.length - 1; i >= 0; i--) if (ALL_PAGES[i].isMod) ALL_PAGES.splice(i, 1);
  ALL_PAGES.push(...pages);
  version++;
  listeners.forEach((fn) => fn());
}

// The experimental switch adds or removes built-in pages (navigationConfig
// re-syncs ALL_PAGES first), so every memo keyed on this version re-reads.
subscribeExperimental(() => {
  version++;
  listeners.forEach((fn) => fn());
});

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const getVersion = () => version;

export function useModPagesVersion() {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}

// Mounted once in AppLayout: keeps ALL_PAGES in step with installed mods.
export function ModNavSync() {
  const { mods, refresh } = useMods();
  // Mods are experimental: with the switch off their pages leave the nav
  // (installed mods and their data stay put).
  const expOn = useExperimentalOn();
  useEffect(() => { syncModPages(expOn ? mods : []); }, [mods, expOn]);
  // Built-in mods pick up the copy this app version ships.
  useEffect(() => {
    if (!expOn || !mods.length) return;
    syncBuiltinMods(mods).then((n) => { if (n) refresh(); }).catch(() => {});
  }, [mods, expOn, refresh]);
  return null;
}
