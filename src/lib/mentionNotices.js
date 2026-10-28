// THE notification list for mentions and whispers (roadmap step 6).
//
// Pop-ups, the history sheet, the dashboard banner, the v2 notices strip and
// both bells used to each read MentionLog their own way: some counted the
// "authored" trail rows as notifications, some ignored legacy rows that name
// their recipient as `alter_id`, one checked fields that never exist, and the
// newest 200 rows of ANY kind were all anyone saw, so a busy day of notes
// pushed real mentions out. Now:
//
//   • mentionLogsQuery     — the one react-query entry (["mentionLogs"]): the
//                            newest notices only, never the authored trail.
//   • isMentionNotice      — is this row a notification at all?
//   • isMentionDismissed   — has its recipient seen it?
//   • pendingMentionsFor   — the undismissed notices for whoever is in front.
//   • dismissMention       — hide it for its recipient. Dismissing never
//                            deletes: the rows are also what @mention
//                            history and "who wrote this" read.

import { base44 } from "@/api/base44Client";
import { markMentionAcknowledgedToday } from "@/lib/dailyTaskSystem";
import { WHISPER_PREVIEW, redactWhispers } from "@/lib/whisperRedact";

export const MENTION_LOGS_KEY = ["mentionLogs"];
const NOTICE_LIMIT = 300;

export const mentionRecipientId = (m) => m?.mentioned_alter_id || m?.alter_id || null;

export const isMentionNotice = (m) => !!m && m.log_type !== "authored" && !!mentionRecipientId(m);

export function isMentionDismissed(m) {
  if (!m) return true;
  if (m.is_read === true) return true;
  return (m.dismissed_by_alter_ids || []).includes(mentionRecipientId(m));
}

export async function fetchMentionNotices() {
  const all = (await base44.entities.MentionLog.list("-created_date")) || [];
  return all.filter(isMentionNotice).slice(0, NOTICE_LIMIT);
}

export const mentionLogsQuery = {
  queryKey: MENTION_LOGS_KEY,
  queryFn: fetchMentionNotices,
};

export function pendingMentionsFor(logs, frontingAlterIds = []) {
  const here = new Set(frontingAlterIds || []);
  return (logs || []).filter((m) => isMentionNotice(m) && here.has(mentionRecipientId(m)) && !isMentionDismissed(m));
}

export async function dismissMention(m, { queryClient } = {}) {
  if (!m?.id) return;
  // Fresh read, so two quick dismissals (or another device's) both stick.
  const fresh = (await base44.entities.MentionLog.get(m.id).catch(() => null)) || m;
  if (isMentionDismissed(fresh)) return;
  const recipient = mentionRecipientId(fresh);
  const patch = fresh.mentioned_alter_id
    ? { dismissed_by_alter_ids: [...(fresh.dismissed_by_alter_ids || []), recipient] }
    : { is_read: true }; // legacy rows keep their own flag
  await base44.entities.MentionLog.update(m.id, patch);
  markMentionAcknowledgedToday();
  queryClient?.invalidateQueries({ queryKey: MENTION_LOGS_KEY });
}

// Leave one notice for one alter (v0.303.0) — a message left on their board
// or in their inbox. A whisper never puts its secret in the preview, and
// any whisper spans inside the text are taken out.
export async function notifyAlter({ recipientId, authorId = null, sourceType, sourceId, sourceLabel, text = "", isWhisper = false, navigatePath = "/" }) {
  if (!recipientId) return null;
  return base44.entities.MentionLog.create({
    mentioned_alter_id: recipientId,
    author_alter_id: authorId,
    log_type: "mention",
    source_type: sourceType,
    source_id: sourceId || "",
    source_label: sourceLabel || sourceType,
    source_date: new Date().toISOString(),
    preview_text: isWhisper ? WHISPER_PREVIEW : redactWhispers(String(text || "")).slice(0, 120),
    navigate_path: navigatePath,
  });
}
