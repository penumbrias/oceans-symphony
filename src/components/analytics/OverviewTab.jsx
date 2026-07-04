import React, { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { lastNDays, priorRange, buildRange, toMs, DAY_MS } from "@/lib/analytics/range";
import { frontingRollup, emotionRollup, sleepRollup, activityRollup, presenceRollup, vsUsual } from "@/lib/analytics/rollups";
import { generateInsights, formatHoursMs } from "@/lib/analytics/insights";
import Sparkline from "@/components/analytics/primitives/Sparkline";
import TrendArrow from "@/components/analytics/primitives/TrendArrow";
import InsightCard from "@/components/analytics/primitives/InsightCard";
import CalendarHeatmap from "@/components/analytics/primitives/CalendarHeatmap";

// Analytics → Overview: "this week vs your usual".
//
// Fixed review window by design (Oura/Exist pattern): the last 7 days
// against a rolling 30-day personal baseline — the page-level date-range
// picker deliberately does NOT apply here (it drives the domain tabs).
// Everything visual follows the honesty rules: sparkline gaps for
// unlogged days, presence framed as showing up (never a streak), and
// insight cards carry confidence + method transparency.

const DISMISSED_KEY = "symphony_insights_dismissed_v1";
const MUTED_KEY = "symphony_insights_muted_kinds_v1";

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    const val = raw ? JSON.parse(raw) : [];
    return Array.isArray(val) ? val : [];
  } catch { return []; }
}
function writeJson(key, arr) {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch { /* private mode */ }
}

function bandLabel(band) {
  if (band === "usual") return "about usual";
  if (band === "above") return "above usual";
  if (band === "below") return "below usual";
  return null;
}
function bandDirection(band) {
  if (band === "usual") return "flat";
  if (band === "above") return "up";
  if (band === "below") return "down";
  return "unknown";
}

function HeadlineCard({ title, value, sub, series, band }) {
  const label = bandLabel(band);
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-3.5 space-y-1.5">
      <p className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-xl font-semibold text-foreground leading-none tabular-nums">{value}</p>
        {series && <Sparkline series={series} width={72} height={24} ariaLabel={`${title} daily trend`} />}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap min-h-[1rem]">
        {label && <TrendArrow direction={bandDirection(band)} label={label} />}
        {sub && <span className="text-[0.625rem] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

export default function OverviewTab({
  sessions = [],
  alters = [],
  altersById = {},
  emotionCheckIns = [],
  symptomCheckIns = [],
  activities = [],
  sleepRecords = [],
  journals = [],
  diaryCards = [],
  bulletins = [],
  systemCheckIns = [],
  tasks = [],
  statusNotes = [],
  onNavigateTab = null,
}) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const navigate = useNavigate();

  const [dismissedIds, setDismissedIds] = useState(() => readJson(DISMISSED_KEY));
  const [mutedKinds, setMutedKinds] = useState(() => readJson(MUTED_KEY));

  // ---- Windows (computed once per mount-ish; `now` drift within a view is fine)
  const windows = useMemo(() => {
    const week = lastNDays(7);
    const prior = priorRange(week);
    const baselineWin = buildRange(new Date(week.fromMs - 30 * DAY_MS), new Date(week.fromMs - 1), week.now);
    const days30 = lastNDays(30);
    const days84 = lastNDays(84);
    return { week, prior, baselineWin, days30, days84 };
  }, []);

  // ---- Rollups
  const fronting = useMemo(
    () => frontingRollup({ sessions, range: windows.week, priorRangeObj: windows.prior, baselineRange: windows.baselineWin }),
    [sessions, windows],
  );
  const fronting30 = useMemo(
    () => frontingRollup({ sessions, range: windows.days30 }),
    [sessions, windows],
  );
  const emotions = useMemo(
    () => emotionRollup({ emotionCheckIns, range: windows.week, priorRangeObj: windows.prior, baselineRange: windows.baselineWin }),
    [emotionCheckIns, windows],
  );
  const sleep = useMemo(
    () => sleepRollup({ sleepRecords, range: windows.week, baselineRange: windows.baselineWin }),
    [sleepRecords, windows],
  );
  const activity = useMemo(
    () => activityRollup({ activities, range: windows.week, baselineRange: windows.baselineWin }),
    [activities, windows],
  );

  const presenceFamilies = useMemo(() => ([
    { items: sessions, getMs: (s) => toMs(s.start_time) },
    { items: emotionCheckIns, getMs: (c) => toMs(c.timestamp || c.created_date) },
    { items: symptomCheckIns, getMs: (c) => toMs(c.timestamp || c.created_date) },
    { items: activities, getMs: (a) => toMs(a.timestamp || a.created_date) },
    { items: sleepRecords, getMs: (r) => toMs(r.start_time || r.bedtime || (r.date ? `${r.date}T12:00:00` : null) || r.created_date) },
    { items: journals, getMs: (j) => toMs(j.created_date) },
    { items: diaryCards, getMs: (c) => toMs(c.created_date || (c.date ? `${c.date}T12:00:00` : null)) },
    { items: bulletins, getMs: (b) => toMs(b.created_date) },
    { items: systemCheckIns, getMs: (c) => toMs(c.created_date) },
    { items: (tasks || []).filter((t) => t.completed_date), getMs: (t) => toMs(t.completed_date) },
    { items: statusNotes, getMs: (n) => toMs(n.timestamp || n.created_date) },
  ]), [sessions, emotionCheckIns, symptomCheckIns, activities, sleepRecords, journals, diaryCards, bulletins, systemCheckIns, tasks, statusNotes]);

  const presence30 = useMemo(() => presenceRollup({ families: presenceFamilies, range: windows.days30 }), [presenceFamilies, windows]);
  const presence84 = useMemo(() => presenceRollup({ families: presenceFamilies, range: windows.days84 }), [presenceFamilies, windows]);

  // ---- Insights feed
  const feed = useMemo(() => generateInsights({
    terms,
    formatAlter,
    altersById,
    rollups: {
      fronting: { ...fronting, coFrontPairs: fronting30.coFrontPairs },
      emotions,
      sleep,
      presence: presence30,
    },
    weekLabel: "this week",
    mutedKinds,
    dismissedIds,
    max: 5,
  }), [terms, formatAlter, altersById, fronting, fronting30, emotions, sleep, presence30, mutedKinds, dismissedIds]);

  const handleDismiss = useCallback((insight) => {
    setDismissedIds((prev) => {
      const next = [...prev.filter((id) => id !== insight.id), insight.id].slice(-50);
      writeJson(DISMISSED_KEY, next);
      return next;
    });
  }, []);

  const handleMute = useCallback((insight) => {
    setMutedKinds((prev) => {
      const next = [...new Set([...prev, insight.kind])];
      writeJson(MUTED_KEY, next);
      return next;
    });
    toast.success("Muted — insights like that won't show again.");
  }, []);

  const handleUnmuteAll = useCallback(() => {
    setMutedKinds(() => { writeJson(MUTED_KEY, []); return []; });
  }, []);

  const handleDrill = useCallback((insight) => {
    if (insight.drillTab && insight.drillTab !== "overview" && onNavigateTab) onNavigateTab(insight.drillTab);
  }, [onNavigateTab]);

  const frontersCount = fronting.distinctFronters;

  return (
    <div className="space-y-5">
      {/* Headline cards — this week vs your usual */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">The last 7 days, compared with your own usual — never anyone else's.</p>
        <div className="grid grid-cols-2 gap-2.5">
          <HeadlineCard
            title={`${terms.Fronting} time`}
            value={fronting.frontedMs > 0 ? formatHoursMs(fronting.frontedMs) : "—"}
            sub={frontersCount > 0 ? `${frontersCount} ${frontersCount === 1 ? terms.fronter : terms.fronters}` : `No ${terms.fronting} logged`}
            series={null}
            band={null}
          />
          <HeadlineCard
            title={terms.Switches}
            value={String(fronting.switchesTotal)}
            sub={null}
            series={fronting.switchesSeries}
            band={fronting.switchesBaseline?.sufficient ? vsUsual(
              fronting.switchesSeries.reduce((a, p) => a + (p.value || 0), 0) / Math.max(1, fronting.switchesSeries.length),
              fronting.switchesBaseline,
            ).band : null}
          />
          <HeadlineCard
            title="Check-ins"
            value={String(emotions.checkInsTotal)}
            sub={emotions.distressCount > 0 ? `${emotions.distressCount} marked distress` : null}
            series={emotions.countSeries}
            band={emotions.countBaseline?.sufficient ? vsUsual(
              emotions.countSeries.reduce((a, p) => a + (p.value || 0), 0) / Math.max(1, emotions.countSeries.length),
              emotions.countBaseline,
            ).band : null}
          />
          <HeadlineCard
            title="Sleep"
            value={sleep.avgHours != null ? `${sleep.avgHours.toFixed(1)}h` : "—"}
            sub={sleep.nightsLogged > 0 ? `${sleep.nightsLogged} night${sleep.nightsLogged === 1 ? "" : "s"} logged` : "No sleep logged"}
            series={sleep.hoursSeries}
            band={sleep.hoursBaseline?.sufficient ? vsUsual(sleep.avgHours, sleep.hoursBaseline).band : null}
          />
        </div>
      </div>

      {/* Insights feed */}
      <div className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Insights</h2>
          {mutedKinds.length > 0 && (
            <button type="button" onClick={handleUnmuteAll} className="text-[0.625rem] text-muted-foreground underline decoration-dotted hover:text-foreground">
              Unmute all ({mutedKinds.length})
            </button>
          )}
        </div>
        {feed.length === 0 ? (
          <p className="text-xs text-muted-foreground rounded-2xl border border-border/50 bg-card p-3.5">
            Nothing stands out right now — that's fine. Insights appear here as patterns emerge from what you log.
          </p>
        ) : (
          feed.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onDismiss={handleDismiss}
              onMute={insight.unlock ? null : handleMute}
              onDrill={insight.drillTab && insight.drillTab !== "overview" ? handleDrill : null}
            />
          ))
        )}
      </div>

      {/* Showing up — presence calendar (NOT a streak) */}
      <div className="rounded-2xl border border-border/50 bg-card p-3.5 space-y-2.5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Showing up</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            You showed up {presence30.daysPresent} of the last 30 days. Gaps are just gaps — unlogged days don't mean nothing happened.
          </p>
        </div>
        <CalendarHeatmap
          presentByDay={presence84.presentByDay}
          weeks={12}
          onDayClick={(key) => navigate(`/timeline?date=${key}`)}
        />
        <p className="text-[0.625rem] text-muted-foreground">Tap a day to open its timeline — handy for "what happened on the 12th?".</p>
      </div>
    </div>
  );
}
