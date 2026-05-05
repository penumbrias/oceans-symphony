import React, { useMemo, useState } from "react";
import { computeAlterEmotionProfiles } from "@/lib/analyticsEngine";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Rough emotion → valence mapping for coloring
const VALENCE = {
  happy: 1, joy: 1, excited: 1, content: 1, grateful: 1, calm: 1, peaceful: 1,
  hopeful: 1, proud: 1, loved: 1, safe: 1, playful: 1, curious: 1,
  sad: -1, angry: -1, anxious: -1, fearful: -1, overwhelmed: -1, ashamed: -1,
  guilty: -1, lonely: -1, frustrated: -1, numb: -1, dissociated: -1,
  confused: 0, mixed: 0, tired: 0, flat: 0,
};

function emotionColor(emotion) {
  const v = VALENCE[emotion?.toLowerCase()] ?? 0;
  if (v > 0) return "bg-green-400/20 text-green-700 dark:text-green-400 border-green-400/30";
  if (v < 0) return "bg-orange-400/20 text-orange-700 dark:text-orange-400 border-orange-400/30";
  return "bg-muted/40 text-muted-foreground border-border/50";
}

export default function AlterEmotionProfiles({ alters, emotionCheckIns }) {
  const profiles = useMemo(
    () => computeAlterEmotionProfiles(emotionCheckIns, alters),
    [emotionCheckIns, alters]
  );

  const [selectedId, setSelectedId] = useState(null);

  const altersWithData = alters.filter(a => profiles[a.id]);
  const hasSystemData = !!profiles.__system__;

  if (!altersWithData.length && !hasSystemData) {
    return (
      <div className="py-10 text-center space-y-1">
        <p className="text-sm text-muted-foreground">No emotion check-in data yet.</p>
        <p className="text-xs text-muted-foreground">Log emotions via Quick Check-In to see per-member profiles.</p>
      </div>
    );
  }

  const activeId = selectedId || (altersWithData[0]?.id ?? "__system__");
  const activeAlter = activeId === "__system__" ? null : alters.find(a => a.id === activeId);
  const activeProfile = profiles[activeId];

  // Compute emotion shift over time: compare first half vs second half of check-ins
  const computeShift = (alterId) => {
    const ciForAlter = emotionCheckIns
      .filter(ci => alterId === "__system__"
        ? (!ci.fronting_alter_ids?.length)
        : ci.fronting_alter_ids?.includes(alterId)
      )
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (ciForAlter.length < 6) return null;
    const half = Math.floor(ciForAlter.length / 2);
    const first = ciForAlter.slice(0, half);
    const second = ciForAlter.slice(half);

    const countEmotions = (cis) => {
      const counts = {};
      cis.forEach(ci => (ci.emotions || []).forEach(e => { counts[e] = (counts[e] || 0) + 1; }));
      return counts;
    };

    const firstCounts = countEmotions(first);
    const secondCounts = countEmotions(second);

    // Positive valence ratio
    const positiveRatio = (counts) => {
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      const pos = Object.entries(counts).filter(([e]) => (VALENCE[e?.toLowerCase()] ?? 0) > 0)
        .reduce((a, [, n]) => a + n, 0);
      return total ? pos / total : 0;
    };

    return {
      firstRatio: positiveRatio(firstCounts),
      secondRatio: positiveRatio(secondCounts),
      delta: positiveRatio(secondCounts) - positiveRatio(firstCounts),
    };
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Emotion frequency distribution for each system member, based on which emotions are logged during their fronting sessions.
      </p>

      {/* Member selector */}
      <div className="flex flex-wrap gap-2">
        {altersWithData.map(a => (
          <button
            key={a.id}
            onClick={() => setSelectedId(a.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              a.id === activeId
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30"
            }`}
          >
            {a.avatar_url
              ? <img src={a.avatar_url} className="w-4 h-4 rounded-full object-cover" />
              : <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#8b5cf6" }} />
            }
            {a.name}
          </button>
        ))}
        {hasSystemData && (
          <button
            onClick={() => setSelectedId("__system__")}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              activeId === "__system__"
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            System (unattributed)
          </button>
        )}
      </div>

      {activeProfile && (
        <div className="space-y-3">
          {/* Emotion chips */}
          <div className="bg-card border border-border/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">
                {activeAlter ? activeAlter.name : "System"} — top emotions
              </h3>
              <span className="text-xs text-muted-foreground">{activeProfile.total} check-ins</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeProfile.topEmotions.map(({ emotion, count, pct }) => (
                <div
                  key={emotion}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${emotionColor(emotion)}`}
                >
                  <span>{emotion}</span>
                  <span className="opacity-60">{pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Trend over time */}
          {(() => {
            const shift = computeShift(activeId);
            if (!shift) return null;
            const direction = shift.delta > 0.05 ? "more positive" : shift.delta < -0.05 ? "more negative" : "stable";
            const color = shift.delta > 0.05 ? "text-green-600" : shift.delta < -0.05 ? "text-orange-500" : "text-muted-foreground";
            return (
              <div className="bg-card border border-border/50 rounded-xl p-3 flex items-center gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Emotional trend over time</p>
                  <p className={`text-sm font-semibold ${color}`}>
                    {direction === "more positive" ? "↑ Trending more positive" :
                     direction === "more negative" ? "↓ Trending more negative" :
                     "→ Emotionally stable"}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-muted-foreground">Earlier</p>
                  <p className="text-sm font-medium">{Math.round(shift.firstRatio * 100)}% positive</p>
                  <p className="text-xs text-muted-foreground mt-1">Recent</p>
                  <p className="text-sm font-medium">{Math.round(shift.secondRatio * 100)}% positive</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* System overview: compare alter profiles */}
      {altersWithData.length > 1 && (
        <div className="bg-card border border-border/50 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-semibold">Positive emotion rate by member</h3>
          {[...altersWithData, hasSystemData ? { id: "__system__", name: "System (unattributed)" } : null]
            .filter(Boolean)
            .map(a => {
              const profile = profiles[a.id];
              if (!profile) return null;
              const total = profile.topEmotions.reduce((s, e) => s + e.count, 0);
              const posCount = profile.topEmotions
                .filter(e => (VALENCE[e.emotion?.toLowerCase()] ?? 0) > 0)
                .reduce((s, e) => s + e.count, 0);
              const posRate = total ? Math.round((posCount / total) * 100) : 0;
              return (
                <div key={a.id} className="flex items-center gap-3">
                  <span className="text-xs font-medium w-24 truncate">{a.name}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-green-400/60 rounded-full" style={{ width: `${posRate}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-10 text-right">{posRate}%</span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
