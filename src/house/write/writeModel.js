// The house's Write room (plan step 5.2, "writing and talking"): the pure
// rules behind Journals (board 05) and System chat (board 14). No React, no
// records written: the room reads through these and writes only through
// src/lib/journalEntry.js and src/lib/chatEntry.js.
//
// Tested by scripts/test-house-write.mjs.

import { journalEntryTime, normalizeTag } from "@/lib/journalDate";
import { journalAuthorIds, journalCoAuthorIds } from "@/lib/journalAuthors";

// ── Which room this path is ─────────────────────────────────────────────
export function writeRoomOf(pathname) {
  const p = String(pathname || "").replace(/\/+$/, "") || "/";
  if (p === "/journals") return "journals";
  if (p === "/chat") return "chat";
  return null;
}

// ── Journal folders ─────────────────────────────────────────────────────
// Folders are paths ("Dreams/Lucid"). They come from the old page's saved
// list (localStorage os_journal_folders, read only here) and from every
// entry's own folder, with its ancestors, so nothing is ever hidden.
export const FOLDERS_KEY = "os_journal_folders";
// The pseudo-folder for switch journals (entry_type "switch_log"); never a
// real folder path (a real path can't start with a NUL).
export const SWITCH_FOLDER = "\u0000switch";

export const parentOf = (path) => {
  const parts = String(path || "").split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : null;
};
export const ancestorsOf = (path) => {
  const parts = String(path || "").split("/").filter((x) => x !== "");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
};
export const folderName = (path) => String(path || "").split("/").pop();

export function readSavedFolders(storage) {
  try {
    const s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    const v = JSON.parse(s?.getItem(FOLDERS_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : [];
  } catch { return []; }
}

/** Every folder path, sorted, saved ones plus every entry's (and its ancestors). */
export function folderPaths(entries = [], saved = []) {
  const set = new Set();
  for (const p of saved || []) for (const a of ancestorsOf(p)) set.add(a);
  for (const e of entries || []) if (e?.folder) for (const a of ancestorsOf(e.folder)) set.add(a);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Keep a new (still empty) folder in the old page's saved list, as the old page does. */
export function addSavedFolder(storage, path) {
  const p = String(path || "").trim();
  if (!p) return readSavedFolders(storage);
  const cur = readSavedFolders(storage);
  if (cur.includes(p)) return cur;
  const next = [...cur, p];
  try { (storage || localStorage).setItem(FOLDERS_KEY, JSON.stringify(next)); } catch { /* storage refused: the folder shows until reload */ }
  return next;
}

/** Rename or remove a folder (and its sub-folders) in the saved list, as the old page does. */
export function savedFoldersAfter(saved = [], { rename, remove } = {}) {
  if (remove) return saved.filter((f) => f !== remove && !f.startsWith(`${remove}/`));
  if (rename) {
    const { from, to } = rename;
    return saved.map((f) => (f === from ? to : f.startsWith(`${from}/`) ? to + f.slice(from.length) : f));
  }
  return saved;
}

export function writeSavedFolders(storage, list) {
  try { (storage || localStorage).setItem(FOLDERS_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

const inFolder = (e, path) => !!e?.folder && (e.folder === path || e.folder.startsWith(`${path}/`));

/** The folder tree's rows: { path, name, depth, count, hasKids, open }, folded ones' children left out. */
export function folderRows(paths = [], entries = [], folded = []) {
  const shut = new Set(folded || []);
  const rows = [];
  for (const path of paths) {
    let hidden = false;
    let cur = parentOf(path);
    let guard = 0;
    while (cur && guard++ < 64) { if (shut.has(cur)) { hidden = true; break; } cur = parentOf(cur); }
    if (hidden) continue;
    rows.push({
      path,
      name: folderName(path),
      depth: Math.min(path.split("/").length - 1, 8),
      count: (entries || []).filter((e) => inFolder(e, path)).length,
      hasKids: paths.some((q) => parentOf(q) === path),
      open: !shut.has(path),
    });
  }
  return rows;
}

// ── Finding entries ─────────────────────────────────────────────────────
const plain = (html) => String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");

/**
 * The entries shown for a folder and the filters (newest first is the
 * caller's: pass entries sorted by sortJournalsNewestFirst).
 *   folder: null (every entry) | SWITCH_FOLDER | a path (it and its sub-folders)
 *   search: words in the title or (unlocked) text; locked text is never searched
 *   tag, authorId: as the old page; fronterIds: null (off) or the ids to keep
 */
export function filterEntries(entries = [], { folder = null, search = "", tag = null, authorId = null, fronterIds = null } = {}) {
  const q = String(search || "").trim().toLowerCase();
  return (entries || []).filter((e) => {
    if (!e) return false;
    if (folder === SWITCH_FOLDER) { if (e.entry_type !== "switch_log") return false; }
    else if (folder && !inFolder(e, folder)) return false;
    if (q) {
      const inTitle = String(e.title || "").toLowerCase().includes(q);
      const inText = !e.is_encrypted && plain(e.content).toLowerCase().includes(q);
      if (!inTitle && !inText) return false;
    }
    if (tag && !(e.tags || []).some((t) => normalizeTag(t) === tag)) return false;
    const authors = [e.author_alter_id || e.alter_id, ...journalCoAuthorIds(e)].filter(Boolean);
    if (authorId && !authors.includes(authorId)) return false;
    if (fronterIds) {
      if (fronterIds.length === 0) return false;
      if (!authors.some((id) => fronterIds.includes(id))) return false;
    }
    return true;
  });
}

export function allTags(entries = []) {
  const s = new Set();
  for (const e of entries || []) for (const t of e?.tags || []) { const c = normalizeTag(t); if (c) s.add(c); }
  return [...s].sort((a, b) => a.localeCompare(b));
}

/** Everyone who wrote at least one entry (for the author filter). */
export function authorIdsOf(entries = []) {
  const s = new Set();
  for (const e of entries || []) {
    const a = e?.author_alter_id || e?.alter_id;
    if (a) s.add(a);
    for (const id of journalCoAuthorIds(e)) s.add(id);
  }
  return [...s];
}

// ── One entry, in words ─────────────────────────────────────────────────
/**
 * The by-line: { lead, co, text }. lead is the first author's label (or the
 * system's name when nobody signed and there are no co-authors).
 */
export function byLine(entry, { altersById = {}, label = (a) => a?.name || "", systemName = "" } = {}) {
  if (!entry) return { lead: "", co: [], text: "" };
  const author = altersById[entry.author_alter_id || entry.alter_id];
  const co = journalCoAuthorIds(entry).map((id) => altersById[id]).filter(Boolean);
  const lead = author ? label(author) : (co.length ? "" : systemName || "");
  return { lead, author: author || null, co: co.map(label), text: [lead, ...co.map(label)].filter(Boolean).join(", ") };
}

/** Who was in front when the entry was written (ids, primary first). */
export function frontingAt(sessions = [], at) {
  const t = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(t)) return [];
  const out = [];
  const seen = new Set();
  const live = (sessions || []).filter((s) => {
    if (!s || s.removed_at || s.trashed_at) return false;
    const start = Date.parse(s.start_time);
    if (!Number.isFinite(start) || start > t) return false;
    if (!s.end_time) return true;
    const end = Date.parse(s.end_time);
    return Number.isFinite(end) ? end >= t : !!s.is_active;
  }).sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary));
  for (const s of live) {
    const ids = s.alter_id ? [s.alter_id] : [s.primary_alter_id, ...(s.co_fronter_ids || [])];
    for (const id of ids) if (id && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

/** Words in an entry's text; null for a locked entry (its text is never read). */
export function wordCount(entry) {
  if (!entry || entry.is_encrypted) return null;
  const words = plain(entry.content).trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/** "Fri Nov 20"-style day words are the caller's (date-fns); this is the order of the facts. */
export function entryFacts(entry, { terms = {}, folderWords, writtenBy, withWords, frontingWords, dayWords, readers = [] } = {}) {
  if (!entry) return [];
  const tags = [...new Set((entry.tags || []).map(normalizeTag).filter(Boolean))];
  return [
    ["Folder", folderWords || "None"],
    ["Written by", writtenBy || "Not signed"],
    withWords ? ["With", withWords] : null,
    [`${terms.Fronting || "Fronting"} then`, frontingWords || "No one recorded"],
    ["Day", dayWords || ""],
    entry.entry_type === "switch_log" ? ["Kind", `${terms.Switch || "Switch"} journal`] : null,
    tags.length ? ["Tags", tags.map((t) => `#${t}`).join(" ")] : null,
    entry.is_encrypted ? ["Locked", "With a password"] : null,
    readers.length ? ["Who can read", readers.join(", ")] : null,
  ].filter(Boolean);
}

/**
 * "What this entry did": the notices it sent (MentionLog rows with this
 * entry as their source), as words. Whispers never say what was whispered.
 */
export function effectRows(notices = [], { altersById = {}, label = (a) => a?.name || "", someone = "someone" } = {}) {
  return (notices || [])
    .filter((n) => n && n.source_type === "journal")
    .map((n) => {
      const who = altersById[n.mentioned_alter_id || n.author_alter_id || n.alter_id];
      const name = who ? label(who) : someone;
      if (n.log_type === "authored") return { id: n.id, color: who?.color || null, text: `Signed the entry for ${name}` };
      if (String(n.source_label || "").startsWith("Whisper")) return { id: n.id, color: null, text: "Sent a private whisper" };
      return { id: n.id, color: who?.color || null, text: `Let ${name} know they were mentioned` };
    });
}

/** The newest entry that's still in the list (a deleted or filtered-out pick falls back). */
export function pickEntry(list = [], id) {
  return (id && list.find((e) => e.id === id)) || list[0] || null;
}

/** All of an entry's signers, for "Signed:" in the status line. */
export const signerIds = (entry) => journalAuthorIds(entry);
export const entryTime = (entry) => journalEntryTime(entry);

// ── Chat ────────────────────────────────────────────────────────────────
/** Everyone in front now (ids), from the live sessions. */
export function frontIds(activeSessions = []) {
  const ids = new Set();
  for (const s of activeSessions || []) {
    if (s?.alter_id) ids.add(s.alter_id);
    else if (s?.primary_alter_id) ids.add(s.primary_alter_id);
    for (const id of s?.co_fronter_ids || []) ids.add(id);
  }
  return [...ids];
}

/** The composer's first speaker: the primary fronter, else anyone in front, else the first alter. */
export function defaultSpeaker(activeSessions = [], alters = []) {
  const primary = (activeSessions || []).find((s) => s?.is_primary && s.alter_id)?.alter_id
    || (activeSessions || []).find((s) => s?.primary_alter_id)?.primary_alter_id;
  return primary || frontIds(activeSessions)[0] || alters?.[0]?.id || null;
}

/**
 * A private channel shows its name and opens freely only while one of its
 * members is in front, or after the person chose "View anyway" this visit.
 */
export function privateVisible(channel, frontSet, revealed) {
  if (!channel?.is_private) return true;
  if ((channel.member_alter_ids || []).some((id) => frontSet?.has?.(id))) return true;
  return !!revealed?.has?.(channel.id);
}

/** Live channels in the old sidebar's order (categories walked depth-first, then loose, then private). */
export function channelOrder(tree, channels = []) {
  const out = [];
  const walk = (node, depth) => {
    if (!node || depth > 12) return;
    out.push(...(node.channels || []));
    for (const sub of node.subNodes || []) walk(sub, depth + 1);
  };
  for (const n of tree?.rootNodes || []) walk(n, 0);
  out.push(...(tree?.uncategorized || []));
  const priv = (channels || []).filter((c) => c && !c.is_archived && c.is_private)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.created_date || "").localeCompare(String(b.created_date || "")));
  out.push(...priv);
  return out;
}

/** The channel the address names, else the first one. */
export function pickChannel(ordered = [], id) {
  return (id && ordered.find((c) => c.id === id)) || ordered[0] || null;
}

/** The tree as flat rows for the house's channel list: categories (with folds) and channels. */
export function channelRows(tree) {
  const rows = [];
  const walk = (node, depth) => {
    if (!node || depth > 12) return;
    const cat = node.category;
    rows.push({ kind: "category", id: cat.id, category: cat, depth, open: !cat.collapsed });
    if (cat.collapsed) return;
    for (const sub of node.subNodes || []) walk(sub, depth + 1);
    for (const ch of node.channels || []) rows.push({ kind: "channel", id: ch.id, channel: ch, depth: depth + 1 });
  };
  for (const n of tree?.rootNodes || []) walk(n, 0);
  for (const ch of tree?.uncategorized || []) rows.push({ kind: "channel", id: ch.id, channel: ch, depth: 0 });
  return rows;
}

/** A private channel's members, in words ("Ash + River"). */
export function memberWords(channel, altersById = {}, label = (a) => a?.alias || a?.name || "", joiner = " + ") {
  return (channel?.member_alter_ids || []).map((id) => altersById[id]).filter(Boolean).map(label).join(joiner);
}
