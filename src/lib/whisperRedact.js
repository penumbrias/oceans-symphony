// Keeping whispers private outside the message itself (v0.279.13).
//
// A whisper's secret lives inside the stored HTML (see whisperSpan in
// whisperUtils.js), so anything that turns content into plain text —
// global search, the therapy report, notification previews — must take it
// out first. These are the only helpers for that. Pure, no React, so the
// search index and the report builders can use them.

export const WHISPER_PREVIEW = "🔒 private whisper";
// Any span tag that names a whisper (its class or data-whisper-for), also
// when the HTML sits JSON-escaped inside a note payload.
const WHISPER_OPEN_RE = /<span\b[^>]*\bwhisper\b[^>]*>/i;
const SPAN_TAG_RE = /<span\b[^>]*>|<\/span\s*>/gi;

// Replace every whisper span (with whatever nests inside it) by `mask`.
// An unclosed span hides everything after it, never less.
export function redactWhispers(html, mask = WHISPER_PREVIEW) {
  if (!html || typeof html !== "string" || !/whisper/i.test(html)) return html || "";
  let out = "";
  let rest = html;
  for (let guard = 0; guard < 1000; guard++) {
    const m = WHISPER_OPEN_RE.exec(rest);
    if (!m) return out + rest;
    out += rest.slice(0, m.index) + ` ${mask} `;
    const after = rest.slice(m.index + m[0].length);
    let depth = 1;
    let end = -1;
    SPAN_TAG_RE.lastIndex = 0;
    let t;
    while ((t = SPAN_TAG_RE.exec(after)) !== null) {
      depth += t[0][1] === "/" ? -1 : 1;
      if (depth === 0) { end = t.index + t[0].length; break; }
    }
    if (end === -1) return out;
    rest = after.slice(end);
  }
  return out;
}

// What a notification row may show as its preview. Chat whispers used to
// store the secret itself as the preview (their source label ends in
// "(whisper)"), so those always show the mask; anything else has its
// whisper spans taken out.
export function mentionPreview(log) {
  if (!log) return "";
  if (/\(whisper\)\s*$/i.test(log.source_label || "")) return WHISPER_PREVIEW;
  return redactWhispers(log.preview_text || "");
}

// The same, as plain text for surfaces that don't render HTML.
export function mentionPreviewText(log) {
  return mentionPreview(log)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}
