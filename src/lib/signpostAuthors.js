// Shared signpost parser used by JournalEditorModal, BulletinComposer,
// and BulletinCommentThread so all three surfaces recognise the same
// `-name` / `-name/name2` patterns and the same matching rules.
//
// Format recognised:
//   "-kyo"            → matches alter "kyo"
//   "-kyo/hex"        → matches both alters "kyo" AND "hex" (slash
//                       continues the same signpost group, common
//                       co-signed-paragraph shorthand)
//   "-kyo -hex"       → matches both, separately
//   "-hex"            → matches alter "hexandroga" via unique-prefix
//                       fallback when no exact match exists
//   "-system"         → resolves to the system-level sentinel author
//                       (no specific alter; the entry is attributed to
//                       the whole system, like having no fronter set).
//                       The user's custom term for "system" works too
//                       — see SYSTEM_SENTINEL_ID below for the literal
//                       id, and pass `terms.system` into the parser
//                       via the `systemKeywords` arg.
//
// Matching precedence per term:
//   1. system-keyword match (returns SYSTEM_SENTINEL author)
//   2. exact match on `alter.name` or `alter.alias` (case-insensitive)
//   3. unique-prefix match on either field — only fires when EXACTLY
//      one alter starts with the term, so ambiguous prefixes match
//      nothing rather than guessing wrong.
//
// Both functions are pure and Array-of-alters in / Array-of-alters
// out (or, for parseAndStripSignposts, also a cleaned text). They
// preserve order of first appearance and dedupe by id.

export const SYSTEM_SENTINEL_ID = "__system__";

export function isSystemSignpost(author) {
  return author && author.id === SYSTEM_SENTINEL_ID;
}

function makeSystemSentinel() {
  return { id: SYSTEM_SENTINEL_ID, isSystem: true, name: "System" };
}

const PATTERN = /-(\w+(?:\/\w+)*)/g;

// Opt-in: callers that want `-system` to resolve to the system-level
// sentinel must pass `systemKeywords` (e.g. `[terms.system]`). Callers
// that don't pass it keep the old behaviour where "system" would only
// match if there was literally an alter named "system" — important for
// surfaces (bulletins, comments) where the "no fronter" case is
// already handled by the absence of authors and we don't want to
// silently start writing a sentinel id into existing entity fields.
function normalizeKeywords(extra) {
  const set = new Set();
  if (Array.isArray(extra)) {
    extra.forEach((k) => {
      if (typeof k === "string" && k.trim()) set.add(k.trim().toLowerCase());
    });
    // Always include the canonical "system" alongside any user-custom
    // term so a journal still recognises the literal word regardless
    // of what they renamed it to.
    if (set.size > 0) set.add("system");
  }
  return set;
}

function resolveTerm(term, alters, systemKeywords) {
  if (systemKeywords.has(term)) return makeSystemSentinel();
  let alter = alters.find(
    (a) =>
      a?.name?.toLowerCase() === term ||
      (a?.alias && a.alias.toLowerCase() === term),
  );
  if (!alter) {
    const candidates = alters.filter(
      (a) =>
        a?.name?.toLowerCase().startsWith(term) ||
        (a?.alias && a.alias.toLowerCase().startsWith(term)),
    );
    if (candidates.length === 1) alter = candidates[0];
  }
  return alter;
}

export function parseSignpostAuthors(text, alters, systemKeywords) {
  if (!text) return [];
  const safeAlters = Array.isArray(alters) ? alters : [];
  const keywords = normalizeKeywords(systemKeywords);
  const found = [];
  for (const match of [...String(text).matchAll(PATTERN)]) {
    for (const term of match[1].toLowerCase().split("/").filter(Boolean)) {
      const alter = resolveTerm(term, safeAlters, keywords);
      if (alter && !found.find((f) => f.id === alter.id)) found.push(alter);
    }
  }
  return found;
}

export function parseAndStripSignposts(text, alters, systemKeywords) {
  if (!text) return { authors: [], cleanText: text || "" };
  const safeAlters = Array.isArray(alters) ? alters : [];
  const keywords = normalizeKeywords(systemKeywords);
  const found = [];
  let cleanText = String(text);
  for (const match of [...String(text).matchAll(PATTERN)]) {
    const resolvedHere = [];
    for (const term of match[1].toLowerCase().split("/").filter(Boolean)) {
      const alter = resolveTerm(term, safeAlters, keywords);
      if (alter) resolvedHere.push(alter);
    }
    if (resolvedHere.length > 0) {
      for (const a of resolvedHere) {
        if (!found.find((f) => f.id === a.id)) found.push(a);
      }
      // Strip only this specific occurrence so we don't blow away
      // similar substrings elsewhere in the body.
      cleanText = cleanText.replace(match[0], "");
    }
  }
  return { authors: found, cleanText: cleanText.trim() };
}
