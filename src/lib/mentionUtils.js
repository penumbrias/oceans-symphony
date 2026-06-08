import { base44 } from "@/api/base44Client";
import { effectiveAlias } from "@/lib/alterLabel";

// A character that can be part of a name/alias (letters, numbers, _ — any
// script). Used to require a boundary AFTER a matched @mention so "@Sam"
// doesn't falsely match inside "@Samantha".
const WORD_CHAR = /[\p{L}\p{N}_]/u;

export function extractMentionedIds(content, alters) {
  if (!content) return [];
  // Candidate tokens, longest first, so a longer name wins over a shorter
  // one that's a prefix of it (e.g. "@Sam Jones" beats "@Sam").
  const tokens = [];
  for (const a of alters) {
    if (a.name) tokens.push({ token: `@${a.name}`, id: a.id });
    if (a.alias) tokens.push({ token: `@${a.alias}`, id: a.id });
    // Emoji-as-alias: @😀 resolves to the alter just like an alias would.
    const ea = effectiveAlias(a);
    if (ea && ea !== a.alias) tokens.push({ token: `@${ea}`, id: a.id });
  }
  tokens.sort((x, y) => y.token.length - x.token.length);

  const mentioned = new Set();
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== "@") continue;
    for (const t of tokens) {
      if (content.startsWith(t.token, i)) {
        // Only a real mention if the char right after the name is a
        // boundary (end of string, space, punctuation) — not another letter.
        const after = content[i + t.token.length];
        if (!after || !WORD_CHAR.test(after)) {
          mentioned.add(t.id);
          i += t.token.length - 1; // consume the matched token
          break;
        }
      }
    }
  }
  return Array.from(mentioned);
}

export async function saveAuthoredLog({ authorAlterId, sourceType, sourceId, sourceLabel, navigatePath, previewText }) {
  if (!authorAlterId) return;
  await base44.entities.MentionLog.create({
    mentioned_alter_id: authorAlterId,
    author_alter_id: authorAlterId,
    log_type: "authored",
    source_type: sourceType,
    source_id: sourceId || "",
    source_label: sourceLabel || sourceType,
    source_date: new Date().toISOString(),
    preview_text: (previewText || "").slice(0, 120),
    navigate_path: navigatePath || "/",
  });
}

export async function saveMentions({ content, alters, sourceType, sourceId, sourceLabel, navigatePath, authorAlterId }) {
  if (!content) return;
  const mentionedIds = extractMentionedIds(content, alters);
  const preview = content.slice(0, 120);

  const logs = [];

  // Log for each mentioned alter
  for (const id of mentionedIds) {
    logs.push(
      base44.entities.MentionLog.create({
        mentioned_alter_id: id,
        author_alter_id: authorAlterId || null,
        log_type: "mention",
        source_type: sourceType,
        source_id: sourceId || "",
        source_label: sourceLabel || sourceType,
        source_date: new Date().toISOString(),
        preview_text: preview,
        navigate_path: navigatePath || "/",
      })
    );
  }

  await Promise.all(logs);
}