// ONE way to save text the user wrote, so every note-like field in the app
// behaves the same: inline ~commands create real records, "/w @name" whispers
// peel their recipients off, "-name" / "+name" signposts decide who signed
// it, and @mentions notify the people named — the same grammar the chat,
// bulletins and journals already speak.
//
//   const prepared = await prepareAuthoredText(text, { alters, terms, surfaceLabel: "sleep note" });
//   if (prepared === null) return;                       // user backed out of the whisper warning
//   const row = await base44.entities.X.create({ notes: prepared.content, author_alter_ids: prepared.authorIds });
//   await recordAuthoredText({ ...prepared, alters, sourceType: "sleep", sourceId: row.id,
//                              sourceLabel: "Sleep note", navigatePath: `/sleep?highlight=${row.id}` });
//
// prepareAuthoredText throws a LogCommandFormatError (user-facing message)
// when a ~command is malformed — the owner rule is that a broken command
// BLOCKS the save so the text stays editable. Catch it with
// isLogCommandError(e) and toast e.message.
//
// Pair it with <MentionTextarea signposts alters={alters}> for the input, which
// gives the @ / - / + / ~ autocomplete popups.

import { base44 } from "@/api/base44Client";
import { applyLogCommands } from "@/lib/logCommands";
import { applyWhisper } from "@/lib/whisperUtils";
import { parseAndStripSignposts, foldSignpostAuthors, isSystemSignpost } from "@/lib/signpostAuthors";
import { saveMentions, saveAuthoredLog } from "@/lib/mentionUtils";

export function isLogCommandError(e) {
  return e?.name === "LogCommandFormatError";
}

/**
 * Turn raw typed text into what gets stored.
 * @returns {Promise<null | { content, logged, authorIds, isWhisper, recipientIds }>}
 *   null when the user cancelled the mid-message whisper warning.
 *   `authorIds` = baseAuthorIds folded with any signposts ("+x" adds, "-x" replaces).
 */
export async function prepareAuthoredText(text, {
  alters = [],
  terms = {},
  rich = false,                 // true when the field stores HTML
  surfaceLabel = "note",        // named in the whisper warning
  signposts = true,
  whisper = true,
  allowWholeBlur = false,
  baseAuthorIds = [],           // who signs it when no signpost says otherwise
  chips = true,                 // false → executed ~commands become plain text, not chips
} = {}) {
  const raw = typeof text === "string" ? text : "";
  const base = (baseAuthorIds || []).filter(Boolean);
  if (!raw.trim()) return { content: raw, logged: [], authorIds: [...base], isWhisper: false, recipientIds: [] };

  const lc = await applyLogCommands(raw, { isRich: rich, chips, source: surfaceLabel });
  let content = lc.content;
  let recipientIds = [];
  let isWhisper = false;

  if (whisper) {
    const w = await applyWhisper(content, alters, { allowWholeBlur, rich: rich || lc.logged.length > 0, surfaceLabel });
    if (w === null) return null;
    content = w.content;
    recipientIds = w.recipientIds || [];
    isWhisper = !!w.isWhisper;
  }

  let authorIds = [...base];
  if (signposts) {
    const systemKeywords = terms?.system ? [terms.system] : undefined;
    const folded = foldSignpostAuthors(content, alters, { systemKeywords, base: base.map((id) => ({ id })) });
    authorIds = folded.filter((a) => !isSystemSignpost(a)).map((a) => a.id);
    content = parseAndStripSignposts(content, alters, systemKeywords).cleanText;
  }

  return { content, logged: lc.logged, authorIds, isWhisper, recipientIds };
}

/**
 * After the record exists: notify @mentioned alters, whisper recipients, and
 * leave an "authored" trail for the signing alter (what passive attribution
 * reads). Best-effort — a failed log never fails the save.
 */
export async function recordAuthoredText({
  content = "",
  alters = [],
  recipientIds = [],
  authorIds = [],
  sourceType,
  sourceId,
  sourceLabel,
  navigatePath,
}) {
  const authorAlterId = authorIds[0] || null;
  try {
    await saveMentions({ content, alters, sourceType, sourceId, sourceLabel, navigatePath, authorAlterId, excludeIds: recipientIds });
  } catch { /* best-effort */ }
  for (const rid of recipientIds || []) {
    try {
      await base44.entities.MentionLog.create({
        mentioned_alter_id: rid,
        author_alter_id: authorAlterId,
        log_type: "mention",
        source_type: sourceType,
        source_id: sourceId || "",
        source_label: `Whisper in ${sourceLabel || sourceType}`,
        source_date: new Date().toISOString(),
        preview_text: "🔒 private whisper",
        navigate_path: navigatePath || "/",
      });
    } catch { /* best-effort */ }
  }
  if (authorAlterId) {
    try { await saveAuthoredLog({ authorAlterId, sourceType, sourceId, sourceLabel, navigatePath, previewText: content }); } catch { /* best-effort */ }
  }
}
