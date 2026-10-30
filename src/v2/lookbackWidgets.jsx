// Look-back widgets (v0.324.0): Feelings and Symptom analytics.
//
// Three real depths instead of one embedded page:
//   minimal  = the top three, each with its change since the window before
//   normal   = the top N as bars (N, window and comparison in options)
//   expanded = every one as bars, then the full analytics section below
// On a profile board they count only that profile's alters (SCOPE_FIELD),
// through the same counting the analytics page uses (src/lib/lookbackCounts.js).
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Section, Row, Muted, TextAction, useWidgetMode } from "@/v2/primitives";
import { useScopeAlterIds } from "@/v2/subjectScope";
import { useAuthoredPresence } from "@/hooks/useAuthoredPresence";
import { emotionEvents, countEmotions, countSymptomCheckIns, rankCounts } from "@/lib/lookbackCounts";
import EmotionAnalytics from "@/components/emotions/EmotionAnalytics";
import SymptomAnalytics from "@/components/analytics/SymptomAnalytics";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { useT } from "@/lib/i18n";

const DAY = 86400000;
const clampInt = (v, lo, hi, dflt) => Math.max(lo, Math.min(hi, parseInt(v, 10) || dflt));

// The window this widget looks at, and the one just before it.
function useWindows(settings) {
  const days = clampInt(settings?.days, 1, 365, 30);
  return useMemo(() => {
    const to = new Date();
    const from = new Date(+to - days * DAY);
    return { days, to, from, prevFrom: new Date(+from - days * DAY) };
  }, [days]);
}

function Delta({ count, prev }) {
  if (prev == null) return null;
  const d = count - prev;
  if (d === 0) return <span className="text-muted-foreground"> ·</span>;
  return <span style={{ color: "var(--v2-accent)" }}>{d > 0 ? ` ▲${d}` : ` ▼${-d}`}</span>;
}

// One bar per row: name, count (+ change), and a thin bar in the accent.
function CountBars({ rows, labelOf, onTap }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return rows.map((r) => (
    <button key={r.key} type="button" onClick={() => onTap?.(r)}
      className="w-full text-left -mx-1 px-1 py-0.5 hover:bg-muted/40"
      style={{ borderRadius: "var(--v2-radius, 8px)" }}>
      <span className="flex items-baseline gap-2">
        <span className="text-sm truncate min-w-0">{labelOf(r)}</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums flex-shrink-0">
          {r.count}<Delta count={r.count} prev={r.prev} />
        </span>
      </span>
      <span className="block h-1 rounded-full bg-muted/50 overflow-hidden mt-0.5">
        <span className="block h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: "var(--v2-accent)" }} />
      </span>
    </button>
  ));
}

function LookbackBody({ label, rows, labelOf, settings, empty, openPath, full }) {
  const navigate = useNavigate();
  const mode = useWidgetMode();
  const top = clampInt(settings?.top, 1, 20, 5);
  const open = () => navigate(openPath);
  const action = <TextAction onClick={open}>Open</TextAction>;
  if (rows.length === 0) {
    return (
      <Section label={label} action={action}>
        <Muted>{empty}</Muted>
        {mode === "expanded" && full}
      </Section>
    );
  }
  if (mode === "minimal") {
    return (
      <Section label={label} action={action}>
        {rows.slice(0, 3).map((r) => (
          <Row key={r.key} primary={labelOf(r)} right={<>{r.count}<Delta count={r.count} prev={r.prev} /></>} onClick={open} />
        ))}
      </Section>
    );
  }
  return (
    <Section label={label} action={action}>
      <CountBars rows={mode === "expanded" ? rows.slice(0, 30) : rows.slice(0, top)} labelOf={labelOf} onTap={open} />
      {mode === "expanded" && full}
    </Section>
  );
}

// The full analytics section, only for everyone's numbers — it has no
// per-profile scope of its own.
function FullBelow({ scoped, children }) {
  if (scoped) return null;
  return (
    <div className="mt-2 pt-2 border-t border-border/40 min-h-0">
      <ErrorBoundary fallback={<Muted>The full analytics couldn't be drawn here. Open the Analytics page.</Muted>}>
        {children}
      </ErrorBoundary>
    </div>
  );
}

export function FeelingsLookbackWidget({ settings }) {
  const tr = useT();
  const mode = useWidgetMode();
  const scopeIds = useScopeAlterIds(settings);
  const { from, to, prevFrom, days } = useWindows(settings);
  const compare = settings?.compare !== false;
  const { data: checkIns = [] } = useQuery({ queryKey: ["emotionCheckIns"], queryFn: () => base44.entities.EmotionCheckIn.list() });
  const { data: sessions = [] } = useQuery({
    queryKey: ["frontingSessionsAll"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 2000),
  });
  const { inferAlters } = useAuthoredPresence();
  const rows = useMemo(() => {
    const cur = countEmotions(emotionEvents({ checkIns, sessions, from, to, inferAlters }), scopeIds);
    const prev = compare ? countEmotions(emotionEvents({ checkIns, sessions, from: prevFrom, to: from, inferAlters }), scopeIds) : null;
    return rankCounts(cur, prev);
  }, [checkIns, sessions, from, to, prevFrom, inferAlters, scopeIds, compare]);
  return (
    <LookbackBody
      label={tr("widget.emotionAnalytics.label")}
      rows={rows}
      labelOf={(r) => r.key}
      settings={settings}
      empty={`No feelings logged${scopeIds ? " here" : ""} in the last ${days} days.`}
      openPath="/analytics?tab=wellbeing"
      full={mode === "expanded" && <FullBelow scoped={!!scopeIds}><EmotionAnalytics from={from} to={to} /></FullBelow>}
    />
  );
}

export function SymptomsLookbackWidget({ settings }) {
  const tr = useT();
  const mode = useWidgetMode();
  const scopeIds = useScopeAlterIds(settings);
  const { from, to, prevFrom, days } = useWindows(settings);
  const compare = settings?.compare !== false;
  const { data: checkIns = [] } = useQuery({ queryKey: ["symptomCheckIns"], queryFn: () => base44.entities.SymptomCheckIn.list() });
  const { data: symptoms = [] } = useQuery({ queryKey: ["symptoms"], queryFn: () => base44.entities.Symptom.list() });
  const byId = useMemo(() => Object.fromEntries(symptoms.map((s) => [s.id, s])), [symptoms]);
  const rows = useMemo(() => {
    const cur = countSymptomCheckIns(checkIns, from, to, scopeIds);
    const prev = compare ? countSymptomCheckIns(checkIns, prevFrom, from, scopeIds) : null;
    // Drop ids whose symptom is gone, so no raw id shows as a name.
    return rankCounts(cur, prev).filter((r) => byId[r.key]);
  }, [checkIns, from, to, prevFrom, scopeIds, compare, byId]);
  return (
    <LookbackBody
      label={tr("widget.symptomAnalytics.label")}
      rows={rows}
      labelOf={(r) => byId[r.key]?.label || byId[r.key]?.name || "Symptom"}
      settings={settings}
      empty={`No symptoms logged${scopeIds ? " here" : ""} in the last ${days} days.`}
      openPath="/analytics?tab=wellbeing"
      full={mode === "expanded" && <FullBelow scoped={!!scopeIds}><SymptomAnalytics startDate={from} endDate={to} /></FullBelow>}
    />
  );
}

// Options shared by both: the window, how many, and the comparison.
export const LOOKBACK_FIELDS = [
  { key: "days", type: "number", label: "Days to include", min: 1, max: 365, default: 30 },
  { key: "top", type: "number", label: "How many to show", min: 1, max: 20, default: 5 },
  { key: "compare", type: "toggle", label: "Show the change since the days before", default: true },
];
