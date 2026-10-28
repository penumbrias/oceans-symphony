// An alter's board as one feed (v0.303.0): the messages posted on their
// board, every MentionLog row naming them (mentions of them and what they
// authored), and the notes / feelings / symptoms recorded in their own
// fronting sessions. The Board feed widget and the classic Board tab both
// read it from here.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { extractPerAlterEntries } from "@/lib/perAlterSessionEntries";
import { mentionPreviewText } from "@/lib/whisperRedact";
import { boardMessagesKey, boardPath } from "@/lib/alterMessages";

// The kinds a feed can be narrowed to; `matches` decides membership.
export const BOARD_KINDS = [
  { key: "mention",  label: "Mentions",  matches: (i) => i.log_type === "mention" || (!i.log_type && !i._is_message && !i._is_session) },
  { key: "bulletin", label: "Bulletins", matches: (i) => i.source_type === "bulletin" },
  { key: "comment",  label: "Comments",  matches: (i) => i.source_type === "comment" },
  { key: "reply",    label: "Replies",   matches: (i) => i.source_type === "reply" },
  { key: "journal",  label: "Journals",  matches: (i) => i.source_type === "journal" },
  { key: "checkin",  label: "Check-ins", matches: (i) => i.source_type === "checkin" },
  { key: "message",  label: "Messages",  matches: (i) => !!i._is_message },
  { key: "session",  label: "Session",   matches: (i) => !!i._is_session },
];

export const boardKindMatches = (key, item) => {
  if (!key || key === "all") return true;
  const kind = BOARD_KINDS.find((k) => k.key === key);
  return kind ? kind.matches(item) : item.source_type === key;
};

export function boardItemMatchesSearch(item, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return mentionPreviewText(item).toLowerCase().includes(q) || String(item.source_label || "").toLowerCase().includes(q);
}

export function useAlterBoardFeed(alterId, { alters = [], sessionLabel = "Session", systemLabel = "System" } = {}) {
  const { data: messages = [], isLoading: l1 } = useQuery({
    queryKey: boardMessagesKey(alterId),
    queryFn: () => base44.entities.AlterMessage.filter({ alter_id: alterId }, "-created_date"),
    enabled: !!alterId,
  });
  const { data: mentionLogs = [], isLoading: l2 } = useQuery({
    queryKey: ["mentionLogs", alterId],
    queryFn: () => base44.entities.MentionLog.filter({ mentioned_alter_id: alterId }, "-created_date"),
    enabled: !!alterId,
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["frontingSessions", "byAlter", alterId],
    queryFn: () => base44.entities.FrontingSession.filter({ alter_id: alterId }, "-start_time"),
    enabled: !!alterId,
  });

  const items = useMemo(() => {
    const byId = Object.fromEntries((alters || []).map((a) => [a.id, a]));
    const messageItems = messages.map((m) => ({
      id: `msg-${m.id}`,
      _raw_id: m.id,
      source_type: "message",
      log_type: "message",
      preview_text: m.content,
      source_date: m.created_date,
      source_label: byId[m.author_alter_id]?.name || systemLabel,
      navigate_path: null,
      _is_message: true,
    }));
    // Read-only: they come from the session record itself.
    const sessionItems = extractPerAlterEntries(sessions, { alterId }).map((e) => {
      const labels = Array.isArray(e.payload?.labels) ? e.payload.labels : (e.payload?.label ? [e.payload.label] : []);
      const symptoms = Array.isArray(e.payload?.items) && e.payload.items.length > 0
        ? e.payload.items
        : (e.payload?.label ? [e.payload] : []);
      const previews = {
        note: e.payload?.text,
        emotion: labels.length > 0 ? `Felt ${labels.join(", ")}` : "",
        symptom: symptoms
          .map((sym) => `${sym.label}${sym.value !== undefined && sym.value !== null && sym.value !== true ? ` · ${sym.value}` : ""}`)
          .join(", "),
      };
      return {
        id: `session-${e.id}`,
        source_type: `session_${e.kind}`,
        log_type: "session",
        preview_text: previews[e.kind] || "",
        source_date: e.ts,
        source_label: sessionLabel,
        navigate_path: null,
        _is_session: true,
      };
    });
    // The notice a board message leaves for this alter is the message
    // itself, already in the feed (and gone with it when it's deleted).
    const ownBoard = boardPath(alterId);
    const notices = mentionLogs.filter((l) => !(l.log_type === "mention" && l.source_type === "message" && l.navigate_path === ownBoard));
    return [
      ...notices.map((l) => ({ ...l, _is_message: false })),
      ...messageItems,
      ...sessionItems,
    ].sort((a, b) => String(b.source_date || b.created_date || "").localeCompare(String(a.source_date || a.created_date || "")));
  }, [messages, mentionLogs, sessions, alters, alterId, sessionLabel, systemLabel]);

  return { items, isLoading: l1 || l2 };
}
