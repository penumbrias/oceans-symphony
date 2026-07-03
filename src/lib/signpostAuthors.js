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

import { effectiveAlias } from "@/lib/alterLabel";

export const SYSTEM_SENTINEL_ID = "__system__";

export function isSystemSignpost(author) {
  return author && author.id === SYSTEM_SENTINEL_ID;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Bare-emoji signposts: an alter with "use emoji as alias" on can sign a text
// entry simply by including their emoji — no `-` needed. e.g. if their emoji is
// ":)", then "wow cool day :)" is authored by them, exactly as "wow cool day
// -alias" would be. We attribute authorship and (optionally) strip the emoji,
// but we SKIP emoji that are part of an @mention (preceded by "@"), since those
// are mentions, not authorship, and stay in the text.
function applyEmojiSignposts(text, alters, found, strip) {
  let working = String(text);
  for (const a of alters) {
    if (!a?.use_emoji_as_alias || !a?.emoji) continue;
    const emoji = String(a.emoji).trim();
    if (!emoji) continue;
    const esc = escapeRegex(emoji);
    // Present (not as part of an @mention)?
    if (!new RegExp(`(?<!@)${esc}`).test(working)) continue;
    if (!found.find((f) => f.id === a.id)) found.push(a);
    if (strip) {
      // Eat one leading space with the emoji so "day :)" → "day", not "day ".
      working = working.replace(new RegExp(`\\s?(?<!@)${esc}`, "g"), "");
    }
  }
  return working;
}

function makeSystemSentinel() {
  return { id: SYSTEM_SENTINEL_ID, isSystem: true, name: "System" };
}

// Signpost triggers: the REPLACE sign (default `-`) and the ADD sign (default
// `+`). The sign is captured so callers can tell ADD from REPLACE — see
// parseSignpostDirectives. Both are USER-CUSTOMISABLE (Settings → Terms):
// `configureSignpostSigns({ add, replace })` (called from useTerms whenever
// SystemSettings loads/changes) rebuilds the pattern, so a user who prefers,
// say, `!name` / `.name` gets that everywhere the shared parser runs.
let ADD_SIGN = "+";
let REPLACE_SIGN = "-";
function buildSignpostPattern() {
  // Longer sign first so a multi-char sign can't be pre-empted by a 1-char one.
  const signs = [ADD_SIGN, REPLACE_SIGN].sort((a, b) => b.length - a.length).map(escapeRegex);
  return new RegExp(`(${signs.join("|")})(\\w+(?:\\/\\w+)*)`, "g");
}
let PATTERN = buildSignpostPattern();

export function configureSignpostSigns({ add, replace } = {}) {
  const a = typeof add === "string" && add.trim() ? add.trim() : ADD_SIGN;
  const r = typeof replace === "string" && replace.trim() ? replace.trim() : REPLACE_SIGN;
  if (a === ADD_SIGN && r === REPLACE_SIGN) return;
  ADD_SIGN = a;
  REPLACE_SIGN = r;
  PATTERN = buildSignpostPattern();
}

export function getSignpostSigns() {
  return { add: ADD_SIGN, replace: REPLACE_SIGN };
}

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
      (a?.alias && a.alias.toLowerCase() === term) ||
      (effectiveAlias(a) && effectiveAlias(a).toLowerCase() === term),
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
    for (const term of match[2].toLowerCase().split("/").filter(Boolean)) {
      const alter = resolveTerm(term, safeAlters, keywords);
      if (alter && !found.find((f) => f.id === alter.id)) found.push(alter);
    }
  }
  // Bare-emoji signposts (no dash) — attribute, but don't need to strip here.
  applyEmojiSignposts(text, safeAlters, found, false);
  return found;
}

// Ordered signpost directives WITH their mode, for the live composer's
// add/replace authorship. Each match is one directive:
//   "-name"   → { mode: "replace", … }  (clear others, set as the author)
//   "+name"   → { mode: "add", … }       (add to the current authors)
// A slash group ("-a/b") shares the directive's mode. Returned in order of
// appearance so the composer can fold them left-to-right.
export function parseSignpostDirectives(text, alters, systemKeywords) {
  if (!text) return [];
  const safeAlters = Array.isArray(alters) ? alters : [];
  const keywords = normalizeKeywords(systemKeywords);
  const out = [];
  for (const match of [...String(text).matchAll(PATTERN)]) {
    const mode = match[1] === ADD_SIGN ? "add" : "replace";
    const group = [];
    for (const term of match[2].toLowerCase().split("/").filter(Boolean)) {
      const alter = resolveTerm(term, safeAlters, keywords);
      if (alter && !group.find((g) => g.id === alter.id)) group.push(alter);
    }
    if (group.length) out.push({ mode, alters: group });
  }
  return out;
}

// Fold a post's signpost directives into a final ordered author list, applying
// the whole-message +/- rule shared by the bulletin composer and comment
// thread (so multiple names in one entry all stick):
//   • no signposts        → the provided `base` (current fronters / retained
//                           authors — caller's choice).
//   • ANY "+" in the text → ADDITIVE: base PLUS every signposted name, e.g.
//                           fronting w,e + "+t -j -l" → w,e,t,j,l.
//   • only "-" signposts  → REPLACE: exactly the signposted names, ignoring the
//                           front, e.g. "-x -y -z" → x,y,z.
//   • bare emoji-alias signposts (no dash) are always added on top.
// Returns alter objects (may include the system sentinel for an explicit
// `-system`), deduped by id, in order of appearance. The caller applies any
// per-chip removals and the "empty → whole system" fallback.
export function foldSignpostAuthors(text, alters, { systemKeywords, base = [] } = {}) {
  const safeAlters = Array.isArray(alters) ? alters : [];
  const safeBase = Array.isArray(base) ? base.filter(Boolean) : [];
  const directives = parseSignpostDirectives(text, safeAlters, systemKeywords);
  const signposted = [];
  let anyAdd = false;
  for (const d of directives) {
    if (d.mode === "add") anyAdd = true;
    for (const a of d.alters) if (!signposted.find((x) => x.id === a.id)) signposted.push(a);
  }
  let working;
  if (signposted.length === 0) working = [...safeBase];
  else if (anyAdd) {
    working = [...safeBase];
    for (const a of signposted) if (!working.find((x) => x.id === a.id)) working.push(a);
  } else {
    working = [...signposted];
  }
  // Emoji-alias authors (no dash) — always additive, minus the system sentinel
  // and anyone already collected.
  const have = new Set(working.map((a) => a.id));
  for (const a of parseSignpostAuthors(text, safeAlters, systemKeywords)) {
    if (isSystemSignpost(a) || have.has(a.id)) continue;
    working.push(a);
    have.add(a.id);
  }
  const seen = new Set();
  return working.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
}

export function parseAndStripSignposts(text, alters, systemKeywords) {
  if (!text) return { authors: [], cleanText: text || "" };
  const safeAlters = Array.isArray(alters) ? alters : [];
  const keywords = normalizeKeywords(systemKeywords);
  const found = [];
  let cleanText = String(text);
  for (const match of [...String(text).matchAll(PATTERN)]) {
    const resolvedHere = [];
    for (const term of match[2].toLowerCase().split("/").filter(Boolean)) {
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
  // Bare-emoji signposts (no dash) — attribute AND strip the emoji from the body.
  cleanText = applyEmojiSignposts(cleanText, safeAlters, found, true);
  return { authors: found, cleanText: cleanText.trim() };
}
