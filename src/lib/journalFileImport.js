// Bring note files (.txt / .md / .html) into Journals — for people moving
// over from simple notes apps like Easy Notes, which export one file per note.
//
// Pure-ish helpers: `readJournalImportFile(file)` reads ONE File and returns a
// preview row; `buildJournalImportPayload(row, opts)` turns a row into the
// JournalEntry fields. The dialog (JournalImportDialog.jsx) only ever CREATES
// entries from these — an import never touches an existing entry.
//
// Content format: JournalEntry.content is HTML (the BioEditor / wysiwyg
// writes HTML, JournalViewModal renders any content containing a tag as
// sanitized HTML). Every import is converted to HTML here so the entry is
// editable in the normal editor, and every result goes through DOMPurify —
// no scripts, handlers, styles or embeds survive.
//
// Date: the file's lastModified goes in `entry_date` (journalDate.js reads it
// first). Inline ~commands are NOT run and @mentions don't notify — a bulk
// import of old notes must not create records or fire a burst of
// notifications; the text is kept exactly as written.
//
// JSON is deliberately not accepted: Easy Notes' backup format isn't
// documented, and guessing at a JSON shape risks importing garbage.

import DOMPurify from "dompurify";
import { extractHashtags } from "@/lib/journalTags";

export const JOURNAL_IMPORT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB per file
export const JOURNAL_IMPORT_EXTENSIONS = [".txt", ".md", ".markdown", ".html", ".htm"];
export const JOURNAL_IMPORT_ACCEPT =
  ".txt,.md,.markdown,.html,.htm,text/plain,text/markdown,text/html";

// Tags a note file has no business injecting into the app.
const FORBID_TAGS = ["style", "link", "meta", "base", "form", "input", "button",
  "textarea", "select", "iframe", "frame", "frameset", "object", "embed", "script", "svg", "math"];

export function sanitizeImportedHtml(html) {
  return DOMPurify.sanitize(String(html || ""), {
    FORBID_TAGS,
    FORBID_ATTR: ["style", "class", "id"],
  }).trim();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extOf(name) {
  const m = /(\.[^./\\]+)$/.exec(String(name || ""));
  return m ? m[1].toLowerCase() : "";
}

export function baseName(name) {
  const n = String(name || "").split(/[/\\]/).pop() || "";
  const ext = extOf(n);
  return (ext ? n.slice(0, -ext.length) : n).trim();
}

// Plain text → paragraphs; blank lines split paragraphs, single newlines
// become <br>. Everything is escaped, so nothing in the file is markup.
export function plainTextToHtml(text) {
  const paras = String(text || "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
  return paras
    .map((p) => p.replace(/^\n+|\n+$/g, ""))
    .filter((p) => p.trim())
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

// Markdown → HTML through react-markdown (already used to render journal
// markdown), loaded lazily so it stays out of the main bundle. Raw HTML inside
// the markdown is shown as text by react-markdown, and the output is
// sanitized regardless.
export async function markdownToHtml(md) {
  const [{ createElement }, { renderToStaticMarkup }, { default: ReactMarkdown }] = await Promise.all([
    import("react"),
    import("react-dom/server"),
    import("react-markdown"),
  ]);
  return renderToStaticMarkup(createElement(ReactMarkdown, null, String(md || "")));
}

// First "# Heading" (ATX, level 1–2) in a markdown file, plus the markdown
// with that line removed (the heading becomes the entry title instead).
export function splitMarkdownTitle(md) {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = /^#{1,2}\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) return { title: m[1].trim(), body: [...lines.slice(0, i), ...lines.slice(i + 1)].join("\n").trim() };
    break; // only a heading that OPENS the file counts as its title
  }
  return { title: null, body: String(md || "").trim() };
}

function htmlDocToParts(raw) {
  const doc = new DOMParser().parseFromString(String(raw || ""), "text/html");
  const docTitle = doc.querySelector("title")?.textContent?.trim() || "";
  const h1 = doc.body?.querySelector("h1")?.textContent?.trim() || "";
  return { title: docTitle || h1 || null, html: doc.body ? doc.body.innerHTML : "" };
}

function plainLength(html) {
  return String(html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length;
}

function readText(file) {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error || new Error("read failed"));
    r.readAsText(file);
  });
}

// Read one File into a preview row:
//   { key, fileName, title, content, date, size, ok, reason }
// `ok: false` rows carry a short user-facing `reason` and are never imported.
export async function readJournalImportFile(file, index = 0) {
  const fileName = file?.name || `file-${index + 1}`;
  const ext = extOf(fileName);
  const lm = Number(file?.lastModified);
  const date = Number.isFinite(lm) && lm > 0 ? new Date(lm).toISOString() : null;
  const row = {
    key: `${index}:${fileName}:${file?.size}:${lm}`,
    fileName, title: baseName(fileName) || fileName, content: "", date,
    size: file?.size || 0, ok: false, reason: null,
  };
  if (!JOURNAL_IMPORT_EXTENSIONS.includes(ext)) { row.reason = "Not a .txt, .md or .html file"; return row; }
  if (row.size > JOURNAL_IMPORT_MAX_BYTES) { row.reason = "Larger than 2 MB"; return row; }
  let raw;
  try { raw = await readText(file); }
  catch { row.reason = "Couldn't be read"; return row; }
  raw = raw.replace(/^﻿/, "");
  if (raw.includes("\u0000")) { row.reason = "Not a text file"; return row; }
  try {
    if (ext === ".md" || ext === ".markdown") {
      const { title, body } = splitMarkdownTitle(raw);
      if (title) row.title = title;
      row.content = sanitizeImportedHtml(await markdownToHtml(body));
    } else if (ext === ".html" || ext === ".htm") {
      const { title, html } = htmlDocToParts(raw);
      if (title) row.title = title;
      row.content = sanitizeImportedHtml(html);
    } else {
      row.content = plainTextToHtml(raw);
    }
  } catch {
    row.reason = "Couldn't be converted";
    return row;
  }
  if (!plainLength(row.content) && !/<img\b/i.test(row.content)) { row.reason = "Empty"; return row; }
  row.title = row.title.slice(0, 200);
  row.ok = true;
  return row;
}

// JournalEntry fields for one preview row. Always a NEW record.
export function buildJournalImportPayload(row, { folder = null, authorAlterId = null } = {}) {
  return {
    ...(row.date ? { entry_date: row.date } : {}),
    title: row.title || baseName(row.fileName) || "Imported note",
    content: row.content,
    tags: extractHashtags(`${row.title} ${row.content}`),
    is_encrypted: false,
    folder: folder || null,
    author_alter_id: authorAlterId || null,
    co_author_alter_ids: [],
    source: "file_import",
    source_file_name: row.fileName,
  };
}

// True when an entry from this same file (name + date) was already imported —
// the preview unticks it so a second import doesn't duplicate by accident.
export function isAlreadyImported(row, entries) {
  return (entries || []).some((e) =>
    e?.source === "file_import" && e.source_file_name === row.fileName &&
    (e.entry_date || null) === (row.date || null));
}
