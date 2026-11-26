// The alters directory's Info panel (pixel look on a computer): what the
// picked card holds, and the doors that act on it — open the profile,
// edit it, add to / remove from front (the same toggleFrontFor the hold
// menu uses) and message them. With no card picked it shows the system's
// own header (name, picture, "About this system").
//
// Display only: every action goes through the existing write paths.

import React from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, isToday, startOfDay, subDays } from "date-fns";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useRotatingImageUrl } from "@/lib/imageRotation";
import { alterPictureStyle } from "@/lib/imageFraming";
import { alterRoles } from "@/lib/alterRoles";
import { isValidHexColor } from "@/lib/colorUtils";
import { usesNewProfile } from "@/lib/profileBoard";
import { toggleFrontFor } from "@/hooks/useSwipeActions";
import { anonymizeBlurNames, anonymizeBlurAvatars } from "@/hooks/useAnonymizeMode";

const DAY = 24 * 60 * 60 * 1000;
const membersOf = (s) => (s.alter_id ? [s.alter_id] : [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean));

// Hours in front on each of the last seven days (today last).
export function weekHours(alterId, sessions, now = Date.now()) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const start = startOfDay(subDays(new Date(now), 6 - i)).getTime();
    return { start, end: start + DAY, ms: 0 };
  });
  for (const s of sessions || []) {
    if (!membersOf(s).includes(alterId) || !s.start_time) continue;
    const a = new Date(s.start_time).getTime();
    const b = s.end_time ? new Date(s.end_time).getTime() : now;
    if (!(b > a)) continue;
    for (const d of days) {
      const lo = Math.max(a, d.start); const hi = Math.min(b, d.end);
      if (hi > lo) d.ms += hi - lo;
    }
  }
  return days.map((d) => ({ day: format(d.start, "EEE"), hours: d.ms / 3600000 }));
}

export default function PixelAlterInfo({ alter, activeSessions = [], allSessions = [], groups = [], anonymize = "off", systemCard = null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const rotating = useRotatingImageUrl({ alterId: alter?.id, role: "avatar", mode: alter?.avatar_rotation_mode, fallbackUrl: alter?.avatar_url, alter });
  const avatar = useResolvedAvatarUrl(alter ? rotating : null);

  if (!alter) {
    return (
      <aside className="pxa-side pxa-info" aria-label="Info">
        <div className="pxa-ttl"><span>Info: {t.System}</span></div>
        <div className="pxa-info-body">
          {systemCard}
          <p className="pxa-hint">Click {t.an(t.alter)} to see their info here. Double-click opens their profile.</p>
        </div>
      </aside>
    );
  }

  const color = isValidHexColor(alter.color) ? alter.color : "#9333ea";
  const label = formatAlter(alter);
  const mine = activeSessions.find((s) => membersOf(s).includes(alter.id));
  const roles = alterRoles(alter);
  const groupNames = groups.map((g) => g.name).filter(Boolean);
  const since = mine?.start_time ? new Date(mine.start_time) : null;
  const facts = [
    alter.age ? ["Age", String(alter.age)] : null,
    groupNames.length ? ["Groups", groupNames.join(", ")] : null,
    alter.origin_year ? ["First appeared", String(alter.origin_year)] : null,
    since ? [`${t.Fronting} since`, `${format(since, "h:mm a")}${isToday(since) ? " today" : `, ${format(since, "MMM d")}`}`] : null,
  ].filter(Boolean);
  const week = weekHours(alter.id, allSessions);
  const maxH = Math.max(1, ...week.map((d) => d.hours));
  const total = week.reduce((n, d) => n + d.hours, 0);
  const open = (q = "") => navigate(`/alter/${alter.id}${q}`);

  return (
    <aside className="pxa-side pxa-info" aria-label={`Info: ${label}`}>
      <div className="pxa-ttl">
        <span className={`truncate${anonymizeBlurNames(anonymize) ? " blur-sm" : ""}`}>Info: {label}</span>
        <button type="button" className="pxa-ttl-btn" onClick={() => open("?edit=1")} title={`Edit everything about ${alter.name}`}>Edit</button>
      </div>
      <div className="pxa-info-body">
        <div className="pxa-info-head">
          <span className={`pxa-av pxa-av-lg${anonymizeBlurAvatars(anonymize) ? " blur-sm" : ""}`} style={{ background: color }}>
            {avatar && <img src={avatar} alt="" style={alterPictureStyle(alter, rotating)} draggable={false} />}
          </span>
          <span className="min-w-0">
            <span className={`pxa-info-name${anonymizeBlurNames(anonymize) ? " blur-sm" : ""}`}>{alter.emoji ? `${alter.emoji} ` : ""}{label}</span>
            <span className="pxa-info-sub">
              {[alter.pronouns, alter.alias && alter.alias !== label ? `aka ${alter.alias}` : null].filter(Boolean).join("  ·  ")}
            </span>
          </span>
        </div>
        {roles.length > 0 && (
          <div className="pxa-chips pxa-chips-lg">{roles.map((r, i) => <span key={`${r}-${i}`} className="pxa-chip">{r}</span>)}</div>
        )}
        {facts.length > 0 && (
          <dl className="pxa-facts">
            {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        )}
        <div className="pxa-week-ttl"><span>{t.Fronting} this week</span><span className="pxa-muted">{Math.round(total)} h</span></div>
        <div className="pxa-week" role="img" aria-label={`${t.Fronting} hours this week: ${week.map((d) => `${d.day} ${d.hours.toFixed(1)}`).join(", ")}`}>
          {week.map((d, i) => (
            <span key={i} title={`${d.day}: ${d.hours.toFixed(1)} h`}
              style={{ height: `${Math.max(d.hours > 0 ? 8 : 2, Math.round((d.hours / maxH) * 100))}%`, background: color }} />
          ))}
        </div>
        <div className="pxa-week-days" aria-hidden="true">{week.map((d, i) => <span key={i}>{d.day.slice(0, 2)}</span>)}</div>
        <div className="pxa-actions">
          <button type="button" className="pxa-btn on" onClick={() => open()}>Open profile</button>
          <button type="button" className="pxa-btn"
            onClick={() => toggleFrontFor(alter, activeSessions, base44, qc, toast, t)}>
            {mine ? `Remove from ${t.front}` : `Add to ${t.front}`}
          </button>
          <button type="button" className="pxa-btn"
            onClick={() => open(`?tab=${usesNewProfile(alter) ? "messages" : "private-messages"}&compose=1`)}>
            Message
          </button>
        </div>
      </div>
    </aside>
  );
}
