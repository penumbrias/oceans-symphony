// Universal whisper parsing + markup.
//
// A "whisper" is a bit of private text addressed to specific alters that
// renders as a small tap-to-reveal bar — the same delegated-handler / CSS-
// class trick the `||spoiler||` censor bar uses (see index.css `.whisper` +
// the click handler in AppLayout), so it works on EVERY surface that renders
// content as rich HTML (chat, bulletins, comments) and on the plain-text note
// surfaces once they render through the shared <RichText>.
//
// Syntax (works anywhere the @mention autocomplete works, and anywhere in the
// text — not just at the start):
//   /w @alter(s) [the secret part]   → only the bracketed part is hidden
//   /w @alter(s) the rest…           → everything from here to the end hides
//
// The no-bracket form is unambiguous when it LEADS the message (the whole
// thing is the whisper). When it appears mid-text with no brackets, what to
// hide is ambiguous, so we flag `needsConfirm` — the caller warns the user
// ("this hides everything from there on — proceed or go back?").
//
// A whisper must name at least one recipient; "/w" with no @mention is left
// as literal text.

import { effectiveAlias } from "@/lib/alterLabel";

// "/w" or "/whisper" at a word boundary, anywhere in the text.
export const WHISPER_RE = /\/(?:w|whisper)\b/i;
const CMD_RE = /\/(?:w|whisper)\b[ \t]*/gi;
const WORD_CH = /[\p{L}\p{N}_]/u;

export function hasWhisperCommand(content) {
  return WHISPER_RE.test(content || "");
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Peel leading "@Name" tokens off the front of `text`, returning the
// recipient alter ids and the remaining body. Longest-name-first so
// "@First Last" beats "@First". Parses the recipients of "/w @Hex @Kyo …".
export function peelLeadingMentions(text, alters) {
  const tokens = [];
  for (const a of alters || []) {
    if (a.name) tokens.push({ token: `@${a.name}`, id: a.id });
    if (a.alias) tokens.push({ token: `@${a.alias}`, id: a.id });
    // Emoji-as-alias: `/w @😀 …` resolves to the alter just like an alias
    // would (matches mentionUtils / the composer's @-token resolution).
    const ea = effectiveAlias(a);
    if (ea && ea !== a.alias) tokens.push({ token: `@${ea}`, id: a.id });
  }
  tokens.sort((x, y) => y.token.length - x.token.length);
  let rest = (text || "").replace(/^\s+/, "");
  const ids = new Set();
  let matched = true;
  while (matched) {
    matched = false;
    for (const t of tokens) {
      if (rest.startsWith(t.token)) {
        const after = rest[t.token.length];
        if (!after || !WORD_CH.test(after)) {
          ids.add(t.id);
          rest = rest.slice(t.token.length).replace(/^[\s,]+/, "");
          matched = true;
          break;
        }
      }
    }
  }
  return { recipientIds: [...ids], body: rest };
}

function namesFor(recipientIds, alters) {
  return recipientIds
    .map((id) => {
      const a = (alters || []).find((x) => x.id === id);
      return a ? (a.alias || a.name) : null;
    })
    .filter(Boolean);
}

// Wrap `inner` in the whisper span. `inner` is already-safe HTML on rich
// surfaces; on plain surfaces the caller has escaped it.
export function whisperSpan(inner, names) {
  const label = (names && names.length) ? names.join(", ") : "";
  return `<span class="whisper" data-whisper-for="${esc(label)}">${inner}</span>`;
}

// Parse the typed content for whisper commands and return the transformed
// content + recipient alter ids.
//
// Returns:
//   { isWhisper:false }
//   { isWhisper:true, transformed, recipientIds, recipientNames, needsConfirm, mode }
//
// mode: "inline" (one or more bracketed whispers), "whole" (a leading
// no-bracket whisper covering everything), or "whole-mid" (a no-bracket
// whisper starting mid-text → needsConfirm true).
export function parseWhisperInput(content, alters, { rich = false } = {}) {
  const text = content || "";
  if (!hasWhisperCommand(text)) return { isWhisper: false };

  const firstNonSpace = (() => { const i = text.search(/\S/); return i === -1 ? 0 : i; })();
  const recipientIds = new Set();
  const segments = []; // { text } | { secret, names }
  let cursor = 0;
  let needsConfirm = false;
  let sawWhole = false;
  let sawInline = false;

  CMD_RE.lastIndex = 0;
  let m;
  let stop = false;
  while (!stop && (m = CMD_RE.exec(text)) !== null) {
    const cmdStart = m.index;
    const afterCmd = text.slice(CMD_RE.lastIndex);
    const { recipientIds: rids, body } = peelLeadingMentions(afterCmd, alters);
    if (rids.length === 0) continue; // "/w" with no recipient → literal text
    const consumed = afterCmd.length - body.length;
    const names = namesFor(rids, alters);

    if (body.startsWith("[")) {
      const close = body.indexOf("]");
      if (close === -1) continue; // unclosed bracket → leave literal, keep scanning
      const secret = body.slice(1, close);
      segments.push({ text: text.slice(cursor, cmdStart) });
      segments.push({ secret, names });
      rids.forEach((id) => recipientIds.add(id));
      const endPos = CMD_RE.lastIndex + consumed + close + 1;
      cursor = endPos;
      CMD_RE.lastIndex = endPos;
      sawInline = true;
    } else {
      // No brackets → hide from here to the end of the text.
      const isLeading = cmdStart === firstNonSpace;
      segments.push({ text: text.slice(cursor, cmdStart) });
      segments.push({ secret: body, names });
      rids.forEach((id) => recipientIds.add(id));
      cursor = text.length;
      needsConfirm = !isLeading; // mid-text + no brackets → warn
      sawWhole = true;
      stop = true;
    }
  }

  if (recipientIds.size === 0) return { isWhisper: false };
  segments.push({ text: text.slice(cursor) });

  const transformed = segments
    .map((s) => ("secret" in s)
      ? whisperSpan(rich ? s.secret : esc(s.secret), s.names)
      : (rich ? s.text : esc(s.text)))
    .join("")
    .trim();

  return {
    isWhisper: true,
    transformed,
    recipientIds: [...recipientIds],
    recipientNames: namesFor([...recipientIds], alters),
    needsConfirm,
    mode: needsConfirm ? "whole-mid" : (sawWhole && !sawInline ? "whole" : "inline"),
  };
}

export function buildMidWhisperWarning(surfaceLabel = "entry") {
  return (
    `You put "/w" in the middle without [brackets], so everything from there ` +
    `to the end of this ${surfaceLabel} will be hidden behind the whisper.\n\n` +
    `Tip: wrap just the secret part in square brackets to hide only that:\n` +
    `  /w @name [the secret part]\n\n` +
    `Hide everything from "/w" onward anyway?`
  );
}

// One-call helper for a surface's save handler. Returns:
//   { content, recipientIds, isWhisper, mode } — use these to save + notify
//   null                                       — user chose "go back" at the warning
export function applyWhisper(content, alters, {
  rich = false,
  surfaceLabel = "entry",
  confirm,
} = {}) {
  const parsed = parseWhisperInput(content, alters, { rich });
  if (!parsed.isWhisper) {
    return { content, recipientIds: [], isWhisper: false, mode: "none" };
  }
  if (parsed.needsConfirm) {
    const fn = confirm || ((msg) => (typeof window !== "undefined" ? window.confirm(msg) : true));
    const ok = fn(buildMidWhisperWarning(surfaceLabel), parsed);
    if (!ok) return null;
  }
  return {
    content: parsed.transformed,
    recipientIds: parsed.recipientIds,
    recipientNames: parsed.recipientNames,
    isWhisper: true,
    mode: parsed.mode,
  };
}
