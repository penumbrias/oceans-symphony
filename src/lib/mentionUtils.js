import { base44 } from "@/api/base44Client";

export function extractMentionedIds(content, alters) {
  const mentioned = new Set();
  alters.forEach((a) => {
    if (content.includes(`@${a.name}`) || (a.alias && content.includes(`@${a.alias}`))) {
      mentioned.add(a.id);
    }
  });
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