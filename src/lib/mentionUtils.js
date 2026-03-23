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

export async function saveMentions({ content, alters, sourceType, sourceId, sourceLabel, navigatePath }) {
  if (!content) return;
  const mentionedIds = extractMentionedIds(content, alters);
  if (mentionedIds.length === 0) return;
  const today = format(new Date(), "yyyy-MM-dd");
  await Promise.all(
    mentionedIds.map((id) =>
      base44.entities.MentionLog.create({
        mentioned_alter_id: id,
        source_type: sourceType,
        source_id: sourceId || "",
        source_label: sourceLabel || sourceType,
        source_date: today,
        preview_text: content.slice(0, 120),
        navigate_path: navigatePath || "/timeline",
      })
    )
  );
}