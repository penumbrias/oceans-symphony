// A custom field's title can carry formatting and pictures (v0.372.1) —
// the same fancy text and text-plus-picture abilities a field's answer has.
//
// The CustomField record keeps TWO spellings of its title:
//   name       plain text — what search, duplicate checks, exports, pickers,
//              older app versions and every plain-text surface read. Always
//              present, never markup.
//   name_rich  the formatted title (the HTML the rich editor writes), or
//              null when the title is just plain text.
//
// The formatted title is shown only while its plain text still matches
// `name`. If the field is renamed somewhere that only knows plain text (an
// older version, the profile's Info page, an import), the plain name shows
// and the formatted copy stays on the record untouched — never silently
// removed, and it comes back if the name is set back.

// Text a person sees in a bit of the editor's HTML.
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9#]+);/gi, (m, k) => (k.toLowerCase() in ENTITIES ? ENTITIES[k.toLowerCase()] : m));
}

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();

// The plain-text title of a formatted title. A title that is only a picture
// takes the picture's alt text, or "Picture", so `name` is never empty.
export function plainTitleOf(markup) {
  const raw = String(markup || "");
  const noStyle = raw.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const text = norm(decodeEntities(noStyle.replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|div|li|h[1-6])>/gi, " ").replace(/<[^>]*>/g, "")));
  if (text) return text;
  if (/<img\b/i.test(raw)) {
    const alt = raw.match(/<img\b[^>]*\balt\s*=\s*"([^"]*)"/i)?.[1];
    return norm(decodeEntities(alt || "")) || "Picture";
  }
  return "";
}

// Does this HTML hold anything more than plain text (line wraps don't count)?
export function hasFormatting(markup) {
  const stripped = String(markup || "").replace(/<\/?(div|p)\s*>/gi, "").replace(/<br\s*\/?>/gi, "");
  return /<[a-z!]/i.test(stripped);
}

// What to write for a title typed in the rich editor.
export function titlePatchFromMarkup(markup) {
  const name = plainTitleOf(markup);
  return { name, name_rich: name && hasFormatting(markup) ? String(markup) : null };
}

// The formatted title to show for a field, or null to show the plain name.
export function richTitleOf(field) {
  const rich = field?.name_rich;
  if (!rich || typeof rich !== "string") return null;
  return norm(plainTitleOf(rich)) === norm(field?.name) ? rich : null;
}

// What the rich editor should start with when this field is edited.
export function editableTitleOf(field) {
  const rich = richTitleOf(field);
  if (rich) return rich;
  return String(field?.name || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
