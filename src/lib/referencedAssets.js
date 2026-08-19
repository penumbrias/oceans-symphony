// Every picture the app is USING that isn't in the local image store —
// data: URLs and web URLs sitting on records (an imported avatar, a pasted
// banner URL, the system picture) — plus the app's own built-in images.
// The library and the picker list these next to stored images, so "all of
// the app's assets" really means all of them (v0.192.2).
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { getLocalImageId } from "@/lib/localImageStorage";
import { alterFolderName } from "@/lib/assetFolders";

const BUILT_IN = [
  { url: "/logo.png", name: "App logo" },
  { url: "/logo.svg", name: "App logo (vector)" },
  { url: "/icon-192.png", name: "App icon" },
  { url: "/icon-512.png", name: "App icon (large)" },
  { url: "/favicon.svg", name: "Favicon" },
];
export const BUILT_IN_FOLDER = "App";

function looksLikeImage(url) {
  if (typeof url !== "string" || !url) return false;
  if (url.startsWith("folder://")) return false;
  if (url.startsWith("data:image/")) return true;
  if (/^https?:\/\//i.test(url)) return true;
  return false;
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// Returns [{ key, url, name, folder, refOnly: true, ownerAlterId?, role? }]
export function useReferencedAssets(rules, alterNameById = {}) {
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list().catch(() => []) });
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settings = settingsList[0] || null;

  return useMemo(() => {
    const out = [];
    const seen = new Set();
    const add = (url, name, folder, extra = {}) => {
      if (!looksLikeImage(url) || getLocalImageId(url)) return;
      if (seen.has(url)) return;
      seen.add(url);
      out.push({ key: `ref-${hash(url)}`, url, name, folder, refOnly: true, ...extra });
    };
    for (const a of alters) {
      const nm = alterNameById[a.id] || a.name || "Unnamed";
      const owned = (role) => (rules?.perAlter ? alterFolderName(nm, role, rules) : { avatar: "Avatars", header: "Headers & banners", background: "Backgrounds" }[role]);
      add(a.avatar_url, `${nm} — avatar`, owned("avatar"), { ownerAlterId: a.id, role: "avatar" });
      add(a.banner_url, `${nm} — banner`, owned("header"), { ownerAlterId: a.id, role: "header" });
      const cf = a.custom_fields && typeof a.custom_fields === "object" ? a.custom_fields : {};
      add(cf._header_image, `${nm} — header`, owned("header"), { ownerAlterId: a.id, role: "header" });
      add(cf._bg_image, `${nm} — background`, owned("background"), { ownerAlterId: a.id, role: "background" });
    }
    for (const g of groups) {
      add(g.avatar_url, `${g.name || "Group"} — picture`, rules?.folders?.group || "Group images");
      add(g.banner_url, `${g.name || "Group"} — banner`, rules?.folders?.group || "Group images");
    }
    for (const c of contacts) add(c.avatar_url, `${c.name || "Contact"} — picture`, rules?.folders?.contact || "Contacts");
    if (settings) {
      add(settings.system_avatar_url, "System — avatar", rules?.folders?.system || "System profile");
      add(settings.system_banner_url, "System — banner", rules?.folders?.system || "System profile");
    }
    for (const b of BUILT_IN) out.push({ key: `builtin-${hash(b.url)}`, url: b.url, name: b.name, folder: BUILT_IN_FOLDER, refOnly: true, builtIn: true });
    return out;
  }, [alters, groups, contacts, settings, rules, alterNameById]);
}

// Which STORED image (by local id) is in use where — so a stored picture
// with no library record still files by its role and owner (an imported
// avatar under the alter's 👤 folder, the system banner under System
// profile) instead of by its id prefix alone.
export function useImageUsage(rules, alterNameById = {}) {
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list().catch(() => []) });
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settings = settingsList[0] || null;
  return useMemo(() => {
    const map = {};
    const put = (url, info) => { const id = getLocalImageId(url); if (id && !map[id]) map[id] = info; };
    for (const a of alters) {
      const nm = alterNameById[a.id] || a.name || "Unnamed";
      const owned = (role) => (rules?.perAlter ? alterFolderName(nm, role, rules) : { avatar: "Avatars", header: "Headers & banners", background: "Backgrounds" }[role]);
      put(a.avatar_url, { folder: owned("avatar"), name: `${nm} — avatar`, ownerAlterId: a.id, role: "avatar" });
      put(a.banner_url, { folder: owned("header"), name: `${nm} — banner`, ownerAlterId: a.id, role: "header" });
      const cf = a.custom_fields && typeof a.custom_fields === "object" ? a.custom_fields : {};
      put(cf._header_image, { folder: owned("header"), name: `${nm} — header`, ownerAlterId: a.id, role: "header" });
      put(cf._bg_image, { folder: owned("background"), name: `${nm} — background`, ownerAlterId: a.id, role: "background" });
    }
    for (const g of groups) {
      put(g.avatar_url, { folder: rules?.folders?.group || "Group images", name: `${g.name || "Group"} — picture` });
      put(g.banner_url, { folder: rules?.folders?.group || "Group images", name: `${g.name || "Group"} — banner` });
    }
    for (const c of contacts) put(c.avatar_url, { folder: rules?.folders?.contact || "Contacts", name: `${c.name || "Contact"} — picture` });
    if (settings) {
      put(settings.system_avatar_url, { folder: rules?.folders?.system || "System profile", name: "System — avatar" });
      put(settings.system_banner_url, { folder: rules?.folders?.system || "System profile", name: "System — banner" });
    }
    return map;
  }, [alters, groups, contacts, settings, rules, alterNameById]);
}
