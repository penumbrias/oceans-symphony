// Who's in front, as the header shows it — one copy for every header that
// carries the "Who's fronting" item (the new UI's top bar and the pixel
// header). Reads the live front and alters through the shared queries and
// decides the bell's unread dot by the same rule as every other bell.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { clockOpts } from "@/lib/timeFormat";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { useT } from "@/lib/i18n";
import { mentionLogsQuery, pendingMentionsFor } from "@/lib/mentionNotices";
import { adjustForContrast, getSurfaceBackground } from "@/lib/contrast";

export function useFrontPresence() {
  const t = useT();
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: mentionLogs = [] } = useQuery(mentionLogsQuery);
  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const fronters = activeSessions
    .map((s) => ({ s, alter: altersById[s.alter_id || s.primary_alter_id] }))
    .filter((x) => x.alter)
    .sort((a, b) => (b.s.is_primary === true) - (a.s.is_primary === true));
  const presenceText = fronters.length === 0
    ? applyTerms(t("top.noFronter"), terms)
    : fronters.length === 1
      ? formatAlter(fronters[0].alter)
      : `${formatAlter(fronters[0].alter)} +${fronters.length - 1}`;
  // Unread for whoever is here now — the same rule as every other bell.
  const hasUnread = pendingMentionsFor(mentionLogs, activeSessions.map((s) => s.alter_id || s.primary_alter_id).filter(Boolean)).length > 0;
  return { fronters, presenceText, hasUnread, formatAlter };
}

// The time, refreshed every 30 seconds, in the person's clock format.
export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", ...clockOpts() });
}

// An alter's name drawn in their own colour, adjusted to stay readable on
// the panel behind it (style for an .os-alter-name span).
export function alterNameColorVar(alter) {
  const c = typeof alter?.color === "string" ? alter.color.trim() : "";
  if (!/^#[0-9a-f]{6}$/i.test(c)) return undefined;
  let v = c;
  try { v = adjustForContrast(c, getSurfaceBackground(), { minRatio: 4.5 }); } catch { /* keep their colour */ }
  return { "--alter-name": v };
}
