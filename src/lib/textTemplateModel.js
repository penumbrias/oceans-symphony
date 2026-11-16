// Text templates: the pure part (no database, no React), so it can be tested
// with plain node (scripts/test-text-templates.mjs).
//
// A template is a saved piece of writing the person pastes anywhere: the
// Templates button in the mini toolbar, or the ~template command.
//
//   TextTemplate        { title, content, folder_id, sort_order }
//   TextTemplateFolder  { name, parent_id, sort_order }
//
// `content` is always HTML (what the rich editors write). Text captured from
// a plain box has its newlines turned into <br> on the way in, and turned
// back into newlines when it is pasted into a plain box, so the formatting
// the toolbar wrote (its tags) survives both ways.
//
// Folders nest. Every walk over them is cycle-guarded and depth-clamped: a
// folder whose parent is gone, is itself, or loops is shown at the top level
// so nothing can be buried (the same rule as src/lib/groupTree.js).

export const MAX_FOLDER_DEPTH = 12;
export const TITLE_MAX = 80;

// ── Text ────────────────────────────────────────────────────────────────────

const ENTITIES = { "&nbsp;": " ", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&amp;": "&" };

// What the person reads: tags out, line breaks kept.
export function templatePlainText(content) {
  return String(content || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(nbsp|lt|gt|quot|#39|amp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/ /g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The default title: the first line that has any words on it.
export function firstLine(content) {
  const line = templatePlainText(content).split("\n").map((l) => l.trim()).find(Boolean) || "";
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

export function templateTitle(t) {
  return (t?.title || "").trim() || firstLine(t?.content) || "Untitled template";
}

// Plain-box text (newlines are line breaks, tags are formatting) → HTML.
export function fieldTextToHtml(text) {
  return String(text || "").replace(/\r\n?/g, "\n").replace(/\n/g, "<br>");
}

// HTML → plain-box text: line breaks and plain (unstyled) line wrappers
// become newlines; anything with formatting keeps its tags.
export function htmlToFieldText(html) {
  const src = String(html || "").replace(/&nbsp;/g, " ");
  const stack = [];
  let out = "";
  let pending = false; // a plain block just closed — the next text starts a new line
  const newline = () => { if (out && !out.endsWith("\n")) out += "\n"; };
  const re = /<(\/?)(div|p|br)\b([^>]*)>/gi;
  let last = 0;
  let m;
  const text = (chunk) => {
    if (!chunk) return;
    if (pending) { newline(); pending = false; }
    out += chunk;
  };
  while ((m = re.exec(src))) {
    text(src.slice(last, m.index));
    last = re.lastIndex;
    const [tag, closing, name, attrs] = m;
    if (name.toLowerCase() === "br") { pending = false; out += "\n"; continue; }
    if (!closing) {
      const plain = !attrs.replace(/\/\s*$/, "").trim();
      stack.push(plain);
      if (plain) { newline(); pending = false; } else text(tag);
    } else {
      const plain = stack.length ? stack.pop() : true;
      if (plain) pending = true; else text(tag);
    }
  }
  text(src.slice(last));
  return out.replace(/\n{3,}/g, "\n\n");
}

export const isBlankContent = (content) => !templatePlainText(content) && !/<(img|hr)\b/i.test(String(content || ""));

// ── Folders ─────────────────────────────────────────────────────────────────

const bySort = (a, b) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0)
  || String(a.name || a.title || "").localeCompare(String(b.name || b.title || ""));

export function indexFolders(folders = []) {
  const map = new Map();
  for (const f of folders) if (f && f.id) map.set(f.id, f);
  return map;
}

// The chain of ancestors (nearest first), stopping at a loop or a gap.
export function ancestorIds(folderId, folders) {
  const map = folders instanceof Map ? folders : indexFolders(folders);
  const out = [];
  const seen = new Set([folderId]);
  let cur = map.get(folderId);
  while (cur && cur.parent_id && map.has(cur.parent_id) && !seen.has(cur.parent_id) && out.length < MAX_FOLDER_DEPTH) {
    out.push(cur.parent_id);
    seen.add(cur.parent_id);
    cur = map.get(cur.parent_id);
  }
  return out;
}

// A folder's effective parent: null when its parent is missing, itself, or
// part of a loop (so it shows at the top level instead of vanishing).
export function effectiveParentId(folder, folders) {
  const map = folders instanceof Map ? folders : indexFolders(folders);
  const p = folder?.parent_id;
  if (!p || p === folder.id || !map.has(p)) return null;
  // Loop check: walking up from the parent must never come back to us.
  const seen = new Set([folder.id]);
  let cur = map.get(p);
  let steps = 0;
  while (cur && steps < MAX_FOLDER_DEPTH * 4) {
    if (seen.has(cur.id)) return null;
    seen.add(cur.id);
    if (!cur.parent_id || !map.has(cur.parent_id)) return p;
    cur = map.get(cur.parent_id);
    steps += 1;
  }
  return null;
}

export function childFolders(parentId, folders) {
  const map = indexFolders(folders);
  return folders.filter((f) => f && f.id && effectiveParentId(f, map) === (parentId || null)).sort(bySort);
}

export function descendantFolderIds(folderId, folders) {
  const out = new Set();
  const walk = (id, depth) => {
    if (depth > MAX_FOLDER_DEPTH) return;
    for (const c of childFolders(id, folders)) {
      if (out.has(c.id) || c.id === folderId) continue;
      out.add(c.id);
      walk(c.id, depth + 1);
    }
  };
  walk(folderId, 0);
  return out;
}

// Would putting `folderId` inside `newParentId` make a loop?
export function wouldNestFolder(folderId, newParentId, folders) {
  if (!newParentId) return false;
  if (newParentId === folderId) return true;
  return descendantFolderIds(folderId, folders).has(newParentId);
}

// Every folder, depth-tagged, in tree order — for SearchableSelect pickers.
export function flattenFolderTree(folders = []) {
  const out = [];
  const seen = new Set();
  const walk = (parentId, depth) => {
    if (depth > MAX_FOLDER_DEPTH) return;
    for (const f of childFolders(parentId, folders)) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ folder: f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// ["Parent", "Child"] — the folder's names from the top down.
export function folderPath(folderId, folders) {
  const map = folders instanceof Map ? folders : indexFolders(folders);
  if (!folderId || !map.has(folderId)) return [];
  const chain = [folderId];
  let cur = map.get(folderId);
  const seen = new Set(chain);
  while (cur) {
    const p = effectiveParentId(cur, map);
    if (!p || seen.has(p) || chain.length > MAX_FOLDER_DEPTH) break;
    chain.unshift(p);
    seen.add(p);
    cur = map.get(p);
  }
  return chain.map((id) => map.get(id)?.name || "Folder");
}

// Templates directly inside a folder (null = not in any folder). A template
// whose folder is gone shows at the top level.
export function templatesIn(folderId, templates = [], folders = []) {
  const map = indexFolders(folders);
  return templates
    .filter((t) => t && (map.has(t.folder_id) ? t.folder_id : null) === (folderId || null))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || templateTitle(a).localeCompare(templateTitle(b)));
}

// Every template inside a folder, at any depth.
export function countTemplatesUnder(folderId, templates = [], folders = []) {
  const ids = descendantFolderIds(folderId, folders);
  ids.add(folderId);
  return templates.filter((t) => ids.has(t.folder_id)).length;
}

// ── Search ──────────────────────────────────────────────────────────────────

const lc = (s) => String(s || "").toLowerCase();

// Templates matching every word of the query, by title, folder names or
// the text. Title hits first. Folders whose name matches come back too.
export function searchTemplates(query, templates = [], folders = []) {
  const words = lc(query).split(/\s+/).filter(Boolean);
  const map = indexFolders(folders);
  if (!words.length) return { templates: [], folders: [] };
  const tHits = [];
  for (const t of templates) {
    if (!t) continue;
    const title = lc(templateTitle(t));
    const path = lc(folderPath(t.folder_id, map).join(" "));
    const hay = `${title} ${path} ${lc(templatePlainText(t.content))}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const titleHit = words.every((w) => title.includes(w));
    const starts = title.startsWith(words[0]);
    tHits.push({ t, rank: (titleHit ? 0 : 2) + (starts ? 0 : 1) });
  }
  tHits.sort((a, b) => a.rank - b.rank || templateTitle(a.t).localeCompare(templateTitle(b.t)));
  const fHits = folders
    .filter((f) => f && words.every((w) => lc(f.name).includes(w)))
    .sort(bySort);
  return { templates: tHits.map((h) => h.t), folders: fHits };
}

// The one template a typed name means, for ~template:load at save time:
// an exact title (case-insensitive), or "Folder/Title" / "Folder:Title"
// paths. Null when nothing — or more than one thing — matches exactly.
export function resolveTemplateByName(name, templates = [], folders = []) {
  const q = lc(name).trim();
  if (!q) return null;
  const map = indexFolders(folders);
  const exact = templates.filter((t) => t && lc(templateTitle(t)).trim() === q);
  if (exact.length === 1) return exact[0];
  const pathed = templates.filter((t) => {
    if (!t) return false;
    const path = folderPath(t.folder_id, map).map(lc);
    const full = [...path, lc(templateTitle(t))];
    return full.join("/") === q || full.join(":") === q || full.join(" / ") === q;
  });
  if (pathed.length === 1) return pathed[0];
  return null;
}
