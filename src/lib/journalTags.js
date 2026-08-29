// Hashtag → tag extraction for journal entries.
//
// The Journals page filters by an entry's `tags` array (the #checkin /
// #switch / #dream chips), but nothing in the editor ever SET tags — they
// only arrived on app-generated entries. Typing a hashtag in the body is
// the intuitive way to add one (owner request), so every journal save path
// runs its text through this and merges what it finds.
//
// HTML safety: content can be rich HTML. Tags and attributes are stripped
// FIRST so `#6366f1` inside a style="" never becomes a tag; entities are
// flattened so `&nbsp;#note` still detects.

const TAG_RE = /(^|[\s>])#([\p{L}\p{N}_-]{2,30})(?=[\s.,!?;:<)]|$)/gmu;

export function extractHashtags(html) {
  if (!html || typeof html !== "string") return [];
  const text = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ");
  const found = new Set();
  for (const m of text.matchAll(TAG_RE)) {
    const tag = m[2].toLowerCase();
    // A bare number is a price/date fragment, not a tag.
    if (/^\d+$/.test(tag)) continue;
    found.add(tag);
  }
  return [...found];
}

// Merge freshly-extracted tags into an entry's existing tags without
// dropping any the user (or the app) already put there.
export function mergeTags(existing, extracted) {
  const out = new Set((existing || []).filter(Boolean));
  (extracted || []).forEach((t) => out.add(t));
  return [...out];
}
