// Universal whisper parsing + markup.
//
// A "whisper" is a bit of private text addressed to specific alters that
// renders blurred behind a tap-to-reveal bar — the same delegated-handler /
// CSS-class trick the `||spoiler||` censor bar uses (see index.css `.whisper`
// + the click handler in AppLayout), so it works on EVERY surface that
// renders content as rich HTML (chat, bulletins, comments, journals) and on
// the plain-text surfaces once they render through the shared <RichText>.
//
// Syntax (works anywhere the @mention autocomplete works):
//   /w @alter(s) [the secret part]   → only the bracketed part is hidden (inline)
//   /w @alter(s) the whole thing     → the WHOLE entry is hidden (whole)
//
// The whole form only makes sense on "posting" surfaces (chat / bulletins /
// comments) where the entry IS a message to an audience. On a personal-record
// surface (journal / task / check-in / activity / status / alter note) a
// no-bracket whisper would hide the entire note, so callers pass
// `allowWholeBlur:false` and we flag `needsConfirm` — the caller warns the
// user and lets them proceed or go back.

// "/w" or "/whisper" at the very start (leading whitespace allowed).
export const WHISPER_RE = /^\s*\/(?:w|whisper)\b[ \t]*/i;
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

// Replace every [bracketed] run in `body` with a whisper span, escaping the
// non-bracket text too when the host is plain-text (so the stored string is
// valid HTML end-to-end). Returns null if there were no brackets.
function transformInline(body, names, rich) {
  const re = /\[([\s\S]+?)\]/g;
  let m;
  let last = 0;
  let found = false;
  const out = [];
  while ((m = re.exec(body))) {
    found = true;
    const pre = body.slice(last, m.index);
    out.push(rich ? pre : esc(pre));
    out.push(whisperSpan(rich ? m[1] : esc(m[1]), names));
    last = m.index + m[0].length;
  }
  if (!found) return null;
  const tail = body.slice(last);
  out.push(rich ? tail : esc(tail));
  return out.join("");
}

// Parse a typed whisper command into a transformed content string + the
// recipient alter ids (for notification).
//
// Returns one of:
//   { isWhisper:false }
//   { isWhisper:true, mode:"inline", transformed, recipientIds, recipientNames, needsConfirm:false }
//   { isWhisper:true, mode:"whole",  transformed, recipientIds, recipientNames, needsConfirm:<!allowWholeBlur> }
export function parseWhisperInput(content, alters, { allowWholeBlur = false, rich = false } = {}) {
  if (!hasWhisperCommand(content)) return { isWhisper: false };
  const afterCmd = (content || "").replace(WHISPER_RE, "");
  const { recipientIds, body } = peelLeadingMentions(afterCmd, alters);
  const recipientNames = namesFor(recipientIds, alters);

  const inline = transformInline(body, recipientNames, rich);
  if (inline !== null) {
    return {
      isWhisper: true,
      mode: "inline",
      transformed: inline.trim(),
      recipientIds,
      recipientNames,
      needsConfirm: false,
    };
  }

  // No brackets — hide the whole remaining body.
  const trimmed = body.trim();
  return {
    isWhisper: true,
    mode: "whole",
    transformed: whisperSpan(rich ? trimmed : esc(trimmed), recipientNames),
    recipientIds,
    recipientNames,
    needsConfirm: !allowWholeBlur,
  };
}

export function buildWholeBlurWarning(surfaceLabel = "entry") {
  return (
    `You're whispering without [brackets].\n\n` +
    `On a ${surfaceLabel} that hides the WHOLE thing behind the lock. ` +
    `To hide just part of it, wrap that part in square brackets, like:\n\n` +
    `  /w @name [the secret part]\n\n` +
    `Hide the whole ${surfaceLabel} anyway?`
  );
}

// One-call helper for a surface's save handler. Returns:
//   { content, recipientIds, isWhisper, mode }  — use these to save + notify
//   null                                        — user chose "go back" at the warning
export function applyWhisper(content, alters, {
  allowWholeBlur = false,
  rich = false,
  surfaceLabel = "entry",
  confirm,
} = {}) {
  const parsed = parseWhisperInput(content, alters, { allowWholeBlur, rich });
  if (!parsed.isWhisper) {
    return { content, recipientIds: [], isWhisper: false, mode: "none" };
  }
  if (parsed.needsConfirm) {
    const fn = confirm || ((msg) => (typeof window !== "undefined" ? window.confirm(msg) : true));
    const ok = fn(buildWholeBlurWarning(surfaceLabel), parsed);
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
