// Is there anything to show in a stored text value? (v0.374.9)
//
// Written fields keep HTML, so "empty" used to mean "nothing left once the
// tags are stripped". That hid a value that is only a picture — the <img>
// is a tag — so a custom field holding just a photo showed on the old
// profile but vanished from the new one. Pictures, videos and embeds count
// as content here; empty paragraphs and stray <br>s still don't.

const MEDIA_TAG = /<(img|video|iframe|svg|picture|audio)\b/i;

export function hasShownContent(value) {
  if (value === undefined || value === null) return false;
  if (typeof value !== "string") return true;
  if (MEDIA_TAG.test(value)) return true;
  return !!value.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
}

export const isBlankValue = (value) => !hasShownContent(value);

// Holds HTML markup (as opposed to plain text or Markdown).
export const looksLikeHtml = (value) => typeof value === "string" && /<[a-z][\s\S]*>/i.test(value);
