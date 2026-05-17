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
//
// Matching precedence per term:
//   1. exact match on `alter.name` or `alter.alias` (case-insensitive)
//   2. unique-prefix match on either field — only fires when EXACTLY
//      one alter starts with the term, so ambiguous prefixes match
//      nothing rather than guessing wrong.
//
// Both functions are pure and Array-of-alters in / Array-of-alters
// out (or, for parseAndStripSignposts, also a cleaned text). They
// preserve order of first appearance and dedupe by id.

const PATTERN = /-(\w+(?:\/\w+)*)/g;

function resolveTerm(term, alters) {
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

export function parseSignpostAuthors(text, alters) {
  if (!text || !Array.isArray(alters) || alters.length === 0) return [];
  const found = [];
  for (const match of [...String(text).matchAll(PATTERN)]) {
    for (const term of match[1].toLowerCase().split("/").filter(Boolean)) {
      const alter = resolveTerm(term, alters);
      if (alter && !found.find((f) => f.id === alter.id)) found.push(alter);
    }
  }
  return found;
}

export function parseAndStripSignposts(text, alters) {
  if (!text) return { authors: [], cleanText: text || "" };
  const safeAlters = Array.isArray(alters) ? alters : [];
  const found = [];
  let cleanText = String(text);
  for (const match of [...String(text).matchAll(PATTERN)]) {
    const resolvedHere = [];
    for (const term of match[1].toLowerCase().split("/").filter(Boolean)) {
      const alter = resolveTerm(term, safeAlters);
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
