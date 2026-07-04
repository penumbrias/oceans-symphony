import React, { useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { AlertTriangle, Eye, EyeOff, X } from "lucide-react";
import CollapsedSection from "@/components/analytics/primitives/CollapsedSection";
import ClassicFrontStats from "@/components/analytics/ClassicFrontStats";
import CoFrontingAnalytics from "@/components/analytics/CoFrontingAnalytics";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { buildRange, priorRange } from "@/lib/analytics/range";
import { frontingRollup } from "@/lib/analytics/rollups";
import { frontShare, frontHistory, switchTimingCells, sessionTexture, reconnectionList, TEXTURE_BUCKETS } from "@/lib/analytics/fronting";
import { formatHoursMs } from "@/lib/analytics/insights";
import { parseSessionNote, parseSessionEmotions, parseSessionSymptoms } from "@/lib/perAlterSessionEntries";
import HBarList from "@/components/analytics/primitives/HBarList";
import Sparkline from "@/components/analytics/primitives/Sparkline";
import TrendArrow from "@/components/analytics/primitives/TrendArrow";
import WeekHourHeatmap from "@/components/analytics/primitives/WeekHourHeatmap";
import UnlockGate from "@/components/analytics/primitives/UnlockGate";

// Rebuilt Fronting analytics (Phase 2). All numbers come from
// src/lib/analytics/fronting.js; this file is presentation only.
//
// Display rules in force here (analytics-rebuild-plan memory):
//   - Front share is descriptive, never a ranking: no medals, no "top
//     fronter" copy, order toggle (by time / A–Z), and a one-tap hide that
//     persists on SystemSettings for systems who find percentages fraught.
//   - Untracked time is always its own honest segment.
//   - Reconnection is opt-in, gently worded, per-alter mutable — never a
//     dormancy alarm.

function Card({ title, sub, right = null, children }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {sub && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function PillToggle({ options, value, onChange }) {
  return (
    <div className="flex gap-1 flex-shrink-0">
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={`px-2 py-0.5 rounded-full text-[0.625rem] font-medium border transition-all ${
            value === o.id
              ? "bg-primary text-primary-foreground border-transparent"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AlterDot({ alter, size = 5 }) {
  const url = useResolvedAvatarUrl(alter?.avatar_url || alter?.image_url || null);
  const initial = (alter?.name || "?").charAt(0).toUpperCase();
  return (
    <span
      className="rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 text-[0.5625rem] font-semibold text-white ring-1 ring-black/10 dark:ring-white/15"
      style={{ backgroundColor: alter?.color || "hsl(var(--primary))", width: size * 4, height: size * 4 }}
    >
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : initial}
    </span>
  );
}

// ── Front share ────────────────────────────────────────────────────────────
function FrontShareCard({ sessions, alters, altersById, range, terms, formatAlter, hidden, onToggleHidden, countUntracked, onToggleCountUntracked }) {
  const [mode, setMode] = useState("flat");
  const [order, setOrder] = useState("time");

  const share = useMemo(() => frontShare({ sessions, range, mode }), [sessions, range, mode]);

  const rows = useMemo(() => {
    // Percentages are of the whole period (untracked counted) or of tracked
    // time only — the user's choice, persisted like the other prefs here.
    const denom = Math.max(countUntracked ? share.windowMs : share.trackedMs, 1);
    const out = [];
    for (const [id, ms] of share.perAlterMs.entries()) {
      const alter = altersById[id];
      if (!alter) continue;
      const pct = (ms / denom) * 100;
      out.push({
        id,
        label: formatAlter(alter),
        value: ms,
        displayValue: `${formatHoursMs(ms)} · ${pct < 1 ? "<1" : Math.round(pct)}%`,
        color: alter.color || undefined,
        leading: <AlterDot alter={alter} />,
        _name: (alter.name || "").toLowerCase(),
      });
    }
    if (order === "az") out.sort((a, b) => a._name.localeCompare(b._name));
    else out.sort((a, b) => b.value - a.value);
    if (countUntracked) {
      // Untracked time as its own honest last row.
      const untrackedPct = (share.untrackedMs / denom) * 100;
      out.push({
        id: "__untracked__",
        label: "Untracked time",
        value: share.untrackedMs,
        displayValue: `${formatHoursMs(share.untrackedMs)} · ${untrackedPct < 1 ? "<1" : Math.round(untrackedPct)}%`,
        color: "hsl(var(--muted-foreground) / 0.35)",
        sub: `No ${terms.fronting} was logged during this time — that's information, not a gap to fix.`,
      });
    }
    return out;
  }, [share, altersById, formatAlter, order, terms, countUntracked]);

  if (hidden) {
    return (
      <Card
        title={`${terms.Front} share`}
        sub="Hidden by your choice."
        right={
          <button type="button" onClick={onToggleHidden}
            className="inline-flex items-center gap-1 text-[0.625rem] text-muted-foreground hover:text-foreground border border-border/60 rounded-full px-2 py-1">
            <Eye className="w-3 h-3" /> Show
          </button>
        }
      />
    );
  }

  return (
    <Card
      title={`${terms.Front} share`}
      sub={countUntracked
        ? `Share of this period's time. Descriptive only — ${terms.fronting} time says nothing about who matters.`
        : `Share of tracked ${terms.fronting} time only. Descriptive only — ${terms.fronting} time says nothing about who matters.`}
      right={
        <button type="button" onClick={onToggleHidden} title="Hide front share (persists)"
          className="inline-flex items-center gap-1 text-[0.625rem] text-muted-foreground hover:text-foreground border border-border/60 rounded-full px-2 py-1 flex-shrink-0">
          <EyeOff className="w-3 h-3" /> Hide
        </button>
      }
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <PillToggle
          value={mode}
          onChange={setMode}
          options={[{ id: "flat", label: "Split co-front time" }, { id: "overlap", label: "Full credit each" }]}
        />
        <PillToggle
          value={order}
          onChange={setOrder}
          options={[{ id: "time", label: "By time" }, { id: "az", label: "A–Z" }]}
        />
        <PillToggle
          value={countUntracked ? "on" : "off"}
          onChange={(v) => { if ((v === "on") !== countUntracked) onToggleCountUntracked(); }}
          options={[{ id: "on", label: "Count untracked" }, { id: "off", label: "Tracked only" }]}
        />
      </div>
      {mode === "overlap" && (
        <p className="text-[0.625rem] text-muted-foreground">
          Full-credit mode counts shared time for everyone in it, so percentages can add up past 100%.
        </p>
      )}
      <HBarList rows={rows} max={Math.max(...rows.map((r) => r.value), 1)} emptyText={`No ${terms.fronting} logged in this period.`} />
    </Card>
  );
}

// ── Switch rhythm ──────────────────────────────────────────────────────────
function SwitchRhythmCard({ sessions, range, prior, terms }) {
  const rollup = useMemo(
    () => frontingRollup({ sessions, range, priorRangeObj: prior }),
    [sessions, range, prior],
  );
  const t = rollup.switchesTrend;
  const dirLabel = t?.sufficient
    ? t.direction === "flat" ? "about the same as the period before"
      : t.direction === "up" ? "more than the period before"
      : "less than the period before"
    : null;
  return (
    <Card title={`${terms.Switch} rhythm`} sub={`Tracked ${terms.switches} per day across this period.`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tabular-nums leading-none">{rollup.switchesTotal}</p>
          <p className="text-[0.625rem] text-muted-foreground mt-1">{terms.switches} in this period</p>
        </div>
        <Sparkline series={rollup.switchesSeries} width={140} height={36} ariaLabel={`${terms.switches} per day`} />
      </div>
      {dirLabel && (
        <div className="flex items-center gap-1.5">
          <TrendArrow direction={t.direction} label={dirLabel} />
        </div>
      )}
      <p className="text-[0.625rem] text-muted-foreground">
        More or fewer {terms.switches} isn't better or worse — rhythms shift for lots of reasons.
      </p>
    </Card>
  );
}

// ── Front history strip ────────────────────────────────────────────────────
function FrontHistoryStrip({ sessions, range, altersById, terms, formatAlter }) {
  const [expandedId, setExpandedId] = useState(null);
  const history = useMemo(() => frontHistory({ sessions, range, limit: 40 }), [sessions, range]);
  const maxDur = useMemo(() => Math.max(...history.rows.map((r) => r.clippedDurMs), 1), [history]);

  if (!history.rows.length) {
    return (
      <Card title={`${terms.Front} history`} sub={`Each bar's length is how long the ${terms.front} lasted.`}>
        <p className="text-xs text-muted-foreground py-3 text-center">No {terms.fronting} logged in this period.</p>
      </Card>
    );
  }

  return (
    <Card title={`${terms.Front} history`} sub={`Each bar's length is how long the ${terms.front} lasted. Tap one for its notes, feelings and symptoms.`}>
      <div className="space-y-1">
        {history.rows.map((row) => {
          const primary = altersById[row.primaryAlterId] || altersById[row.alterIds[0]];
          const others = row.alterIds.filter((id) => id !== (primary?.id)).map((id) => altersById[id]).filter(Boolean);
          const widthPct = Math.max(3, Math.sqrt(row.clippedDurMs / maxDur) * 100); // sqrt keeps short sessions visible
          const expanded = expandedId === row.id;
          const note = parseSessionNote(row.raw?.note);
          const emotions = parseSessionEmotions(row.raw?.session_emotions);
          const symptoms = parseSessionSymptoms(row.raw?.session_symptoms);
          return (
            <div key={row.id}>
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : row.id)}
                aria-expanded={expanded}
                className="w-full text-left group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[0.625rem] text-muted-foreground tabular-nums w-24 flex-shrink-0">
                    {format(new Date(row.startMs), "MMM d, HH:mm")}
                  </span>
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <div
                      className="h-4 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/10 flex-shrink-0 group-hover:ring-primary/50"
                      style={{ width: `${widthPct}%`, backgroundColor: primary?.color || "hsl(var(--primary))", opacity: 0.85 }}
                      title={`${primary ? formatAlter(primary) : "?"} — ${formatHoursMs(row.clippedDurMs)}`}
                    />
                    {row.isOpen && (
                      <span className="text-[0.5625rem] font-semibold text-emerald-500 flex-shrink-0">now</span>
                    )}
                  </div>
                  <span className="text-[0.625rem] text-muted-foreground tabular-nums flex-shrink-0">{formatHoursMs(row.clippedDurMs)}</span>
                </div>
                <div className="flex items-center gap-1 ml-24 mt-0.5">
                  {primary && <AlterDot alter={primary} size={4} />}
                  <span className="text-[0.6875rem] text-foreground truncate">
                    {primary ? formatAlter(primary) : "Unknown"}
                    {others.length > 0 && <span className="text-muted-foreground"> + {others.map((o) => formatAlter(o)).join(", ")}</span>}
                  </span>
                </div>
              </button>
              {expanded && (
                <div className="ml-24 mt-1.5 mb-2 rounded-xl bg-muted/30 p-2.5 space-y-1.5 text-xs">
                  <p className="text-[0.625rem] text-muted-foreground tabular-nums">
                    {format(new Date(row.startMs), "MMM d HH:mm")} → {row.endMs ? format(new Date(row.endMs), "MMM d HH:mm") : "still open"}
                  </p>
                  {emotions.length > 0 && (
                    <p><span className="text-muted-foreground">Feelings:</span> {emotions.join(", ")}</p>
                  )}
                  {symptoms.length > 0 && (
                    <p><span className="text-muted-foreground">Symptoms:</span> {symptoms.map((s) => s.label || s.id).join(", ")}</p>
                  )}
                  {note.length > 0 && (
                    <div className="space-y-1">
                      {note.map((n, i) => <p key={i} className="leading-relaxed">“{n.text}”</p>)}
                    </div>
                  )}
                  {emotions.length === 0 && symptoms.length === 0 && note.length === 0 && (
                    <p className="text-muted-foreground">Nothing extra was logged with this session.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {history.total > history.rows.length && (
        <p className="text-[0.625rem] text-muted-foreground">Showing the {history.rows.length} most recent of {history.total} sessions in this period.</p>
      )}
    </Card>
  );
}

// ── Switch timing heatmap ──────────────────────────────────────────────────
function SwitchTimingCard({ sessions, range, terms }) {
  const timing = useMemo(() => switchTimingCells({ sessions, range }), [sessions, range]);
  return (
    <Card title={`When ${terms.switches} happen`} sub="Darker cells mean more tracked switch starts at that weekday + hour.">
      {timing.total >= 5 ? (
        <WeekHourHeatmap cells={timing.cells} thingLabel={terms.switches} />
      ) : (
        <div>
          <p className="text-xs text-muted-foreground mb-2">This map appears once there are at least 5 tracked {terms.switches} in the period.</p>
          <UnlockGate have={timing.total} need={5} />
        </div>
      )}
    </Card>
  );
}

// ── Often front together ───────────────────────────────────────────────────
function OftenTogetherCard({ sessions, range, altersById, terms, formatAlter }) {
  const rollup = useMemo(() => frontingRollup({ sessions, range }), [sessions, range]);
  const pairs = (rollup.coFrontPairs || []).filter((p) => altersById[p.a] && altersById[p.b]);
  const shown = pairs.filter((p) => p.days >= 5).slice(0, 6);
  const best = pairs[0];

  return (
    <Card title={`Often ${terms.front} together`} sub={`Pairs who shared ${terms.fronting} time on 5+ days in this period.`}>
      {shown.length > 0 ? (
        <div className="space-y-2">
          {shown.map((p) => {
            const a = altersById[p.a]; const b = altersById[p.b];
            return (
              <div key={`${p.a}|${p.b}`} className="flex items-center gap-2">
                <div className="flex -space-x-1.5 flex-shrink-0">
                  <AlterDot alter={a} /><AlterDot alter={b} />
                </div>
                <span className="text-xs font-medium text-foreground truncate flex-1">
                  {formatAlter(a)} & {formatAlter(b)}
                </span>
                <span className="text-[0.625rem] text-muted-foreground tabular-nums flex-shrink-0">{p.days} shared days</span>
              </div>
            );
          })}
        </div>
      ) : best ? (
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Closest so far: {formatAlter(altersById[best.a])} & {formatAlter(altersById[best.b])} — appears at 5 shared days.
          </p>
          <UnlockGate have={best.days} need={5} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground py-2 text-center">No shared {terms.fronting} time logged in this period.</p>
      )}
    </Card>
  );
}

// ── Session texture ────────────────────────────────────────────────────────
function TextureCard({ sessions, range, altersById, terms, formatAlter }) {
  const texture = useMemo(() => sessionTexture({ sessions, range }), [sessions, range]);
  const shown = texture.filter((t) => altersById[t.alterId]).slice(0, 8);
  if (!shown.length) return null;
  return (
    <Card title="Session texture" sub={`Short bursts vs long stretches — how each ${terms.alter}'s ${terms.fronting} tends to run.`}>
      <div className="space-y-3">
        {shown.map((t) => {
          const alter = altersById[t.alterId];
          const maxBucket = Math.max(...t.buckets, 1);
          return (
            <div key={t.alterId}>
              <div className="flex items-center gap-2">
                <AlterDot alter={alter} size={4} />
                <span className="text-xs font-medium text-foreground truncate flex-1">{formatAlter(alter)}</span>
                <span className="text-[0.625rem] text-muted-foreground tabular-nums">
                  typical {formatHoursMs(t.medianMs)} · longest {formatHoursMs(t.longestMs)} · {t.count}×
                </span>
              </div>
              <div className="flex items-end gap-1 mt-1 ml-6 h-6" role="img"
                aria-label={`Session length distribution for ${formatAlter(alter)}`}>
                {t.buckets.map((count, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
                    <div
                      className="w-full rounded-sm"
                      style={{
                        height: `${Math.max(8, (count / maxBucket) * 100)}%`,
                        backgroundColor: alter?.color || "hsl(var(--primary))",
                        opacity: count > 0 ? 0.8 : 0.15,
                      }}
                      title={`${TEXTURE_BUCKETS[i].label}: ${count}`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-1 ml-6 mt-0.5">
                {TEXTURE_BUCKETS.map((b) => (
                  <span key={b.label} className="flex-1 text-center text-[0.5rem] text-muted-foreground">{b.label}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Reconnection (opt-in) ──────────────────────────────────────────────────
function ReconnectionCard({ sessions, alters, altersById, terms, formatAlter, prefs, onSavePrefs }) {
  const navigate = useNavigate();
  const optIn = !!prefs.analytics_reconnect_opt_in;
  const muted = new Set(prefs.analytics_reconnect_muted || []);

  const list = useMemo(
    () => (optIn ? reconnectionList({ sessions, alters }).filter((r) => !muted.has(r.alterId)) : []),
    [optIn, sessions, alters, prefs.analytics_reconnect_muted], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <Card
      title="Reconnection"
      sub={optIn
        ? `${terms.Alters} whose last tracked ${terms.front} was a while ago. Quietness is normal — this is just an invitation, never a problem.`
        : `Optionally list ${terms.alters} who haven't been ${terms.fronting} in a while, as gentle reconnection invitations. Off unless you want it.`}
      right={
        <button type="button" onClick={() => onSavePrefs({ analytics_reconnect_opt_in: !optIn })}
          className={`text-[0.625rem] border rounded-full px-2 py-1 flex-shrink-0 transition-colors ${
            optIn ? "border-primary/50 text-primary bg-primary/10" : "border-border/60 text-muted-foreground hover:text-foreground"
          }`}>
          {optIn ? "On" : "Turn on"}
        </button>
      }
    >
      {optIn && (
        list.length > 0 ? (
          <div className="space-y-2">
            {list.slice(0, 8).map((r) => {
              const alter = altersById[r.alterId];
              if (!alter) return null;
              return (
                <div key={r.alterId} className="flex items-center gap-2">
                  <AlterDot alter={alter} size={4} />
                  <button type="button" onClick={() => navigate(`/alter/${r.alterId}?tab=board`)}
                    className="text-xs font-medium text-foreground truncate flex-1 text-left hover:underline">
                    {formatAlter(alter)}
                  </button>
                  <span className="text-[0.625rem] text-muted-foreground tabular-nums">~{r.daysSince}d</span>
                  <button type="button" onClick={() => navigate(`/alter/${r.alterId}?tab=board`)}
                    className="text-[0.625rem] text-primary hover:underline flex-shrink-0">say hi →</button>
                  <button type="button" aria-label={`Stop showing ${formatAlter(alter)} here`} title="Don't show here"
                    onClick={() => onSavePrefs({ analytics_reconnect_muted: [...muted, r.alterId] })}
                    className="p-0.5 text-muted-foreground/60 hover:text-foreground flex-shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
            {list.length > 8 && <p className="text-[0.625rem] text-muted-foreground">…and {list.length - 8} more.</p>}
            {muted.size > 0 && (
              <button type="button" onClick={() => onSavePrefs({ analytics_reconnect_muted: [] })}
                className="text-[0.625rem] text-muted-foreground underline decoration-dotted hover:text-foreground">
                Unhide {muted.size} hidden
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Everyone with {terms.fronting} history has been around in the last 30 days. 💜</p>
        )
      )}
    </Card>
  );
}

// ── Main tab ───────────────────────────────────────────────────────────────
export default function FrontingTab({
  sessions = [],
  alters = [],
  altersById = {},
  from,
  to,
  stale = [],
  onReviewStale = null,
  timeOfDayNode = null,   // legacy TimeOfDayFronters, kept collapsed
  switchLogNode = null,   // legacy SwitchLogAnalytics (triggers), kept collapsed
}) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const queryClient = useQueryClient();

  const range = useMemo(() => buildRange(from, to), [from, to]);
  const prior = useMemo(() => priorRange(range), [range]);

  // Persistent sensitivity prefs live on SystemSettings (survive backup).
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = pickPrimarySystemSettings(settingsList);
  const prefs = {
    analytics_hide_front_share: !!settings?.analytics_hide_front_share,
    analytics_reconnect_opt_in: !!settings?.analytics_reconnect_opt_in,
    analytics_reconnect_muted: Array.isArray(settings?.analytics_reconnect_muted) ? settings.analytics_reconnect_muted : [],
    // Default ON (count untracked time) — matches the original behaviour.
    analytics_count_untracked: settings?.analytics_count_untracked !== false,
  };

  const savePrefs = useCallback(async (patch) => {
    try {
      if (settings?.id) await base44.entities.SystemSettings.update(settings.id, patch);
      else await base44.entities.SystemSettings.create(patch);
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch { /* non-fatal — UI simply doesn't persist */ }
  }, [settings?.id, queryClient]);

  return (
    <div className="space-y-3">
      {stale && stale.length > 0 && onReviewStale && (
        <button
          type="button"
          onClick={onReviewStale}
          className="w-full text-left flex items-start gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs hover:bg-amber-500/10 transition-colors"
        >
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <p className="text-foreground/90 flex-1">
            {stale.length} {`${terms.fronting} session${stale.length === 1 ? " has" : "s have"}`} been open for over 48 hours — their full time is counted here. <span className="font-medium text-primary">Tap to review →</span>
          </p>
        </button>
      )}

      <FrontShareCard
        sessions={sessions} alters={alters} altersById={altersById} range={range}
        terms={terms} formatAlter={formatAlter}
        hidden={prefs.analytics_hide_front_share}
        onToggleHidden={() => savePrefs({ analytics_hide_front_share: !prefs.analytics_hide_front_share })}
        countUntracked={prefs.analytics_count_untracked}
        onToggleCountUntracked={() => savePrefs({ analytics_count_untracked: !prefs.analytics_count_untracked })}
      />
      <SwitchRhythmCard sessions={sessions} range={range} prior={prior} terms={terms} />
      <FrontHistoryStrip sessions={sessions} range={range} altersById={altersById} terms={terms} formatAlter={formatAlter} />
      <SwitchTimingCard sessions={sessions} range={range} terms={terms} />
      <OftenTogetherCard sessions={sessions} range={range} altersById={altersById} terms={terms} formatAlter={formatAlter} />
      <TextureCard sessions={sessions} range={range} altersById={altersById} terms={terms} formatAlter={formatAlter} />
      <ReconnectionCard
        sessions={sessions} alters={alters} altersById={altersById}
        terms={terms} formatAlter={formatAlter}
        prefs={prefs} onSavePrefs={savePrefs}
      />

      {timeOfDayNode && <CollapsedSection title={`Time of day (per-${terms.alter})`}>{timeOfDayNode}</CollapsedSection>}
      {switchLogNode && <CollapsedSection title={`${terms.Switch} triggers`}>{switchLogNode}</CollapsedSection>}

      {/* The classic pre-rebuild views, restored by request: the per-alter
          stat bars (total/solo/primary/co-front/average/max/min/count) with
          the stacked daily timeline, and the co-fronting pair deep dive. */}
      <CollapsedSection title="Classic front stats (solo / primary / co-front)">
        <ClassicFrontStats sessions={sessions} alters={alters} from={from} to={to} />
      </CollapsedSection>
      <CollapsedSection title={`${terms.Cofronting} deep dive (classic)`}>
        <CoFrontingAnalytics sessions={sessions} alters={alters} altersById={altersById} from={from} to={to} />
      </CollapsedSection>
    </div>
  );
}
