// Goals for writing (v0.339.0): sections that are chapters, and tags.
//
// A section (a Goal with a parent) can carry `section_style`:
//   "chapter" | "part" | "scene"  — numbered among its brothers and sisters
//   of the same style, in page order ("Chapter 3"), with a word count of
//   everything written inside it;
//   null / missing                — an ordinary section, as before.
// A page can carry `child_section_style`, the style its NEW sections take,
// so a story page makes chapters without asking each time.
//
// Any page or section can carry `tags` (strings, no leading "#"). The
// sidebar lists every tag and filters to the pages that have it.
//
// Everything here is pure (no writes) so scripts/test-goal-writing.mjs can
// check it. Walks reuse goalTree's cycle-guarded index.

import { childPages, descendantIds, liveSteps } from "@/lib/goalTree";
import { normalizeTag } from "@/lib/journalDate";

export const SECTION_STYLES = [
  { id: "chapter", label: "Chapter", plural: "chapters" },
  { id: "part", label: "Part", plural: "parts" },
  { id: "scene", label: "Scene", plural: "scenes" },
];
const STYLE_IDS = new Set(SECTION_STYLES.map((s) => s.id));

export function sectionStyleOf(page) {
  return STYLE_IDS.has(page?.section_style) ? page.section_style : null;
}
export function sectionStyleMeta(id) {
  return SECTION_STYLES.find((s) => s.id === id) || null;
}

// "Chapter 3": the place among the page's sections of the same style.
export function sectionNumber(index, page) {
  const style = sectionStyleOf(page);
  if (!style || !page?.id) return null;
  const parentId = index.parent.get(page.id) || null;
  let n = 0;
  for (const sib of childPages(index, parentId)) {
    if (sectionStyleOf(sib) !== style) continue;
    n += 1;
    if (sib.id === page.id) return n;
  }
  return null;
}

export function sectionHeading(index, page) {
  const meta = sectionStyleMeta(sectionStyleOf(page));
  if (!meta) return null;
  const n = sectionNumber(index, page);
  return n ? `${meta.label} ${n}` : meta.label;
}

// Words in a piece of text: markup, [[link]] brackets and @/~ markers don't
// count as words of their own.
export function countWords(text) {
  if (!text || typeof text !== "string") return 0;
  const plain = text
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\[\[|\]\]/g, " ")
    .replace(/[*_`#>~|]+/g, " ");
  const words = plain.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return words ? words.length : 0;
}

// Every word written on a page and inside its sections: its notes and the
// page notes.
export function pageWordCount(index, steps, pageId) {
  const ids = new Set([pageId, ...descendantIds(index, pageId)]);
  let n = 0;
  for (const id of ids) n += countWords(index.byId.get(id)?.why);
  for (const s of liveSteps(steps)) {
    if (s.kind === "text" && ids.has(s.goal_id)) n += countWords(s.body);
  }
  return n;
}

export function formatWords(n) {
  return `${Number(n || 0).toLocaleString()} ${n === 1 ? "word" : "words"}`;
}

// ── Tags ────────────────────────────────────────────────────────────

export function pageTags(page) {
  const out = [];
  for (const t of Array.isArray(page?.tags) ? page.tags : []) {
    const clean = normalizeTag(t);
    if (clean && !out.some((x) => x.toLowerCase() === clean.toLowerCase())) out.push(clean);
  }
  return out;
}

// A tag list with one more (kept once, whatever its case) or one fewer.
export function withTag(tags, tag) {
  const clean = normalizeTag(tag).replace(/\s+/g, "-");
  const list = pageTags({ tags });
  if (!clean || list.some((x) => x.toLowerCase() === clean.toLowerCase())) return list;
  return [...list, clean];
}
export function withoutTag(tags, tag) {
  const key = normalizeTag(tag).toLowerCase();
  return pageTags({ tags }).filter((x) => x.toLowerCase() !== key);
}

// Every tag in use, most used first: [{ tag, count }].
export function allPageTags(pages) {
  const counts = new Map();
  for (const p of pages || []) {
    if (!p || p.trashed_at) continue;
    for (const t of pageTags(p)) {
      const key = t.toLowerCase();
      const cur = counts.get(key) || { tag: t, count: 0 };
      cur.count += 1;
      counts.set(key, cur);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function pageHasTag(page, tag) {
  const key = normalizeTag(tag).toLowerCase();
  return !!key && pageTags(page).some((t) => t.toLowerCase() === key);
}
