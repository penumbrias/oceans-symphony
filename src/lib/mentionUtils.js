import { base44 } from "@/api/base44Client";
import { format } from "date-fns";

export function extractMentionedIds(content, alters) {
  const mentioned = new Set();
  alters.forEach((a) => {
    if (content.includes(`@${a.name}`) || (a.alias && content.includes(`@${a.alias}`))) {
      mentioned.add(a.id);
    }
  });
  return Array.from(mentioned);
}

export async function saveMentions({ content, alters, sourceType, sourceId, sourceLabel, navigatePath, authorAlterId }) {
  if (!content) return;
  const mentionedIds = extractMentionedIds(content, alters);
  const today = format(new Date(), "yyyy-MM-dd");
  const preview = content.slice(0, 120);

  const logs = [];

  // Log for each mentioned alter
  for (const id of mentionedIds) {
    logs.push(
      base44.entities.MentionLog.create({
        mentioned_alter_id: id,
        author_alter_id: authorAlterId || null,
        source_type: sourceType,
        source_id: sourceId || "",
        source_label: sourceLabel || sourceType,
        source_date: today,
        preview_text: preview,
        navigate_path: navigatePath || "/",
      })
    );
  }

  // Also log in the author's board (if author mentioned others)
  if (authorAlterId && mentionedIds.length > 0) {
    logs.push(
      base44.entities.MentionLog.create({
        mentioned_alter_id: authorAlterId,
        author_alter_id: authorAlterId,
        source_type: sourceType + "_sent",
        source_id: sourceId || "",
        source_label: `Mentioned ${mentionedIds.length} alter${mentionedIds.length > 1 ? "s" : ""} in ${sourceLabel || sourceType}`,
        source_date: today,
        preview_text: preview,
        navigate_path: navigatePath || "/",
      })
    );
  }

  await Promise.all(logs);
}