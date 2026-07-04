import React, { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import { buildRange } from "@/lib/analytics/range";
import { alterFingerprint } from "@/lib/analytics/fingerprint";
import { TEXTURE_BUCKETS } from "@/lib/analytics/fronting";
import { formatHoursMs } from "@/lib/analytics/insights";
import HBarList from "@/components/analytics/primitives/HBarList";
import WeekHourHeatmap from "@/components/analytics/primitives/WeekHourHeatmap";

// Analytics → Alters: per-alter fingerprint (Phase 4). One alter at a time,
// picked via the standard searchable selector (never a bare list — systems
// can have dozens of members). Everything shown is explicit attribution:
// what this alter logged or was tagged in. Descriptive, never comparative —
// there is no "vs the others" framing anywhere on this page.

function Card({ title, sub, children }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-3.5 space-y-2.5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function BigAvatar({ alter }) {
  const url = useResolvedAvatarUrl(alter?.avatar_url || alter?.image_url || null);
  return (
    <span
      className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 text-lg font-semibold text-white ring-2 ring-black/10 dark:ring-white/15"
      style={{ backgroundColor: alter?.color || "hsl(var(--primary))" }}
    >
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : (alter?.name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

export default function AltersTab({
  alters = [],
  altersById = {},
  sessions = [],
  emotionCheckIns = [],
  symptomCheckIns = [],
  symptoms = [],
  journals = [],
  bulletins = [],
  chatMessages = [],
  activities = [],
  from,
  to,
  selectedAlterId = null,
  onSelectAlter,
}) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const range = useMemo(() => buildRange(from, to), [from, to]);

  const activeAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);
  const alter = selectedAlterId ? altersById[selectedAlterId] : null;

  const fp = useMemo(() => {
    if (!alter) return null;
    return alterFingerprint({
      alterId: alter.id,
      sessions, emotionCheckIns, symptomCheckIns, journals, bulletins, chatMessages, activities,
      range,
    });
  }, [alter, sessions, emotionCheckIns, symptomCheckIns, journals, bulletins, chatMessages, activities, range]);

  const symptomsById = useMemo(() => {
    const map = {};
    for (const s of symptoms) map[s.id] = s;
    return map;
  }, [symptoms]);

  const maxBucket = fp ? Math.max(...fp.fronting.buckets, 1) : 1;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border/50 bg-card p-3.5 space-y-2">
        <p className="text-xs text-muted-foreground">
          Pick {terms.alter === "alter" ? "an" : "a"} {terms.alter} to see their own footprint for this period — what they logged and were tagged in. Nothing here compares {terms.alters} against each other.
        </p>
        <AlterSearchSelect
          alters={activeAlters}
          value={selectedAlterId}
          onChange={(id) => onSelectAlter?.(id)}
          terms={terms}
          placeholder={`Choose ${terms.alter === "alter" ? "an" : "a"} ${terms.alter}…`}
          showNone={false}
        />
      </div>

      {!alter && (
        <p className="text-xs text-muted-foreground text-center py-8">
          No {terms.alter} selected yet.
        </p>
      )}

      {alter && fp && (
        <>
          {/* Header */}
          <div className="rounded-2xl border border-border/50 bg-card p-3.5 flex items-center gap-3">
            <BigAvatar alter={alter} />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-foreground truncate">{formatAlter(alter)}</p>
              <p className="text-xs text-muted-foreground truncate">
                {[alter.pronouns, alter.role].filter(Boolean).join(" · ") || " "}
              </p>
              {fp.fronting.lastFrontedMs != null && (
                <p className="text-[0.625rem] text-muted-foreground mt-0.5">
                  Last {terms.fronted ?? terms.fronting}: {formatDistanceToNow(new Date(fp.fronting.lastFrontedMs), { addSuffix: true })}
                </p>
              )}
            </div>
          </div>

          {/* Fronting */}
          <Card title={terms.Fronting} sub={`Their tracked ${terms.fronting} in this period.`}>
            {fp.fronting.count > 0 ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{formatHoursMs(fp.fronting.totalMs)}</p>
                    <p className="text-[0.625rem] text-muted-foreground">total</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{fp.fronting.count}</p>
                    <p className="text-[0.625rem] text-muted-foreground">sessions</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{fp.fronting.medianMs != null ? formatHoursMs(fp.fronting.medianMs) : "—"}</p>
                    <p className="text-[0.625rem] text-muted-foreground">typical</p>
                  </div>
                </div>
                <div>
                  <p className="text-[0.625rem] text-muted-foreground mb-1">Session lengths (longest {formatHoursMs(fp.fronting.longestMs)}):</p>
                  <div className="flex items-end gap-1 h-6" role="img" aria-label="Session length distribution">
                    {fp.fronting.buckets.map((count, i) => (
                      <div key={i} className="flex-1">
                        <div
                          className="w-full rounded-sm"
                          style={{
                            height: `${Math.max(8, (count / maxBucket) * 100)}%`,
                            backgroundColor: alter.color || "hsl(var(--primary))",
                            opacity: count > 0 ? 0.8 : 0.15,
                          }}
                          title={`${TEXTURE_BUCKETS[i].label}: ${count}`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1 mt-0.5">
                    {TEXTURE_BUCKETS.map((b) => (
                      <span key={b.label} className="flex-1 text-center text-[0.5rem] text-muted-foreground">{b.label}</span>
                    ))}
                  </div>
                </div>
                {fp.fronting.startCells.size > 0 && (
                  <div>
                    <p className="text-[0.625rem] text-muted-foreground mb-1">When their {terms.fronts ?? terms.fronting} tend to start:</p>
                    <WeekHourHeatmap cells={fp.fronting.startCells} thingLabel={`${terms.front} starts`} />
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No tracked {terms.fronting} in this period.</p>
            )}
          </Card>

          {/* Emotions */}
          <Card title="Emotions" sub={`Check-ins tagged to ${formatAlter(alter)} in this period.`}>
            {fp.emotions.checkInsN > 0 ? (
              <>
                <HBarList
                  rows={fp.emotions.topEmotions.map((e) => ({
                    id: e.label, label: e.label, value: e.count, displayValue: `${e.count}×`,
                    color: alter.color || undefined,
                  }))}
                />
                <p className="text-[0.625rem] text-muted-foreground">
                  {fp.emotions.checkInsN} check-ins{fp.emotions.distressCount > 0 ? ` · ${fp.emotions.distressCount} marked distress` : ""}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No check-ins tagged to them in this period.</p>
            )}
          </Card>

          {/* Symptoms */}
          {fp.symptoms.length > 0 && (
            <Card title="Symptoms" sub="Symptom logs attributed to them.">
              <HBarList
                rows={fp.symptoms.map((r) => {
                  const sym = symptomsById[r.symptomId];
                  return {
                    id: r.symptomId,
                    label: sym?.label || sym?.name || "Symptom",
                    value: r.count,
                    displayValue: `${r.count}×${r.avgSeverity != null ? ` · avg ${r.avgSeverity.toFixed(1)}` : ""}`,
                    color: sym?.color || undefined,
                  };
                })}
              />
            </Card>
          )}

          {/* Footprint */}
          <Card title="Around the app" sub="What carries their name in this period.">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Journal entries", value: fp.footprint.journals },
                { label: "Bulletins", value: fp.footprint.bulletins },
                { label: "Chat messages", value: fp.footprint.chatMessages },
                { label: "Activities", value: fp.footprint.activities },
              ].map((r) => (
                <div key={r.label} className="rounded-xl bg-muted/25 p-2.5">
                  <p className="text-lg font-semibold tabular-nums leading-none">{r.value}</p>
                  <p className="text-[0.625rem] text-muted-foreground mt-1">{r.label}</p>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
