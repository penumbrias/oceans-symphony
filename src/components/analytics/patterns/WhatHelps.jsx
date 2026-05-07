import React, { useMemo, useState } from "react";
import { Star, Heart } from "lucide-react";

const CATEGORY_LABELS = {
  grounding: "Grounding",
  breathing: "Breathing",
  sensory: "Sensory",
  cognitive: "Cognitive",
  movement: "Movement",
  creative: "Creative",
  social: "Social",
  self_care: "Self-care",
  mindfulness: "Mindfulness",
};

export default function WhatHelps({ techniques, preferences, alters }) {
  const [selectedAlterId, setSelectedAlterId] = useState("all");

  const techMap = useMemo(() => {
    const map = {};
    techniques.forEach(t => { map[t.id] = t; });
    return map;
  }, [techniques]);

  const filteredPrefs = useMemo(() => {
    if (selectedAlterId === "all") return preferences;
    if (selectedAlterId === "__system__") return preferences.filter(p => !p.alter_id);
    return preferences.filter(p => p.alter_id === selectedAlterId);
  }, [preferences, selectedAlterId]);

  const techStats = useMemo(() => {
    const stats = {};
    filteredPrefs.forEach(p => {
      if (!p.technique_id) return;
      if (!stats[p.technique_id]) stats[p.technique_id] = { ratings: [], favorited: false, notes: [] };
      if (p.rating !== null && p.rating !== undefined) stats[p.technique_id].ratings.push(Number(p.rating));
      if (p.is_favorited) stats[p.technique_id].favorited = true;
      if (p.notes) stats[p.technique_id].notes.push(p.notes);
    });
    return stats;
  }, [filteredPrefs]);

  const ranked = useMemo(() => {
    return Object.entries(techStats)
      .map(([id, stat]) => {
        const tech = techMap[id];
        if (!tech) return null;
        const avgRating = stat.ratings.length
          ? stat.ratings.reduce((a, b) => a + b, 0) / stat.ratings.length
          : null;
        return { tech, avgRating, favorited: stat.favorited, notes: stat.notes, n: stat.ratings.length };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.favorited !== b.favorited) return b.favorited ? 1 : -1;
        return (b.avgRating ?? 0) - (a.avgRating ?? 0);
      });
  }, [techStats, techMap]);

  const altersWithPrefs = useMemo(() => {
    const ids = new Set(preferences.filter(p => p.alter_id).map(p => p.alter_id));
    return alters.filter(a => ids.has(a.id));
  }, [preferences, alters]);

  const hasSystemPrefs = preferences.some(p => !p.alter_id);

  if (!preferences.length) {
    return (
      <div className="py-10 text-center space-y-1">
        <p className="text-sm text-muted-foreground">No grounding preferences recorded yet.</p>
        <p className="text-xs text-muted-foreground">Rate grounding techniques after trying them to see what works best here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Grounding techniques rated and favorited by system members, ranked by effectiveness.
      </p>

      {altersWithPrefs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedAlterId("all")}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              selectedAlterId === "all"
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            All
          </button>
          {altersWithPrefs.map(a => (
            <button
              key={a.id}
              onClick={() => setSelectedAlterId(a.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                selectedAlterId === a.id
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              {a.avatar_url
                ? <img src={a.avatar_url} className="w-4 h-4 rounded-full object-cover" />
                : <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#8b5cf6" }} />
              }
              {a.name}
            </button>
          ))}
          {hasSystemPrefs && (
            <button
              onClick={() => setSelectedAlterId("__system__")}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                selectedAlterId === "__system__"
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              System
            </button>
          )}
        </div>
      )}

      {ranked.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No preferences for this member yet.</p>
      ) : (
        <div className="space-y-2">
          {ranked.map(({ tech, avgRating, favorited, notes, n }) => (
            <div key={tech.id} className="bg-card border border-border/50 rounded-xl p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{tech.name}</span>
                  {favorited && <Heart className="w-3.5 h-3.5 text-pink-500 fill-pink-500 flex-shrink-0" />}
                  {tech.category && (
                    <span className="text-xs text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
                      {CATEGORY_LABELS[tech.category] || tech.category}
                    </span>
                  )}
                </div>
                {notes.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                    "{notes[notes.length - 1]}"
                  </p>
                )}
              </div>
              {avgRating !== null && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                  <span className="text-sm font-semibold">{avgRating.toFixed(1)}</span>
                  {n > 1 && <span className="text-xs text-muted-foreground">({n})</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {ranked.filter(r => r.favorited).length > 0 && (
        <p className="text-xs text-muted-foreground">
          <Heart className="w-3 h-3 text-pink-500 fill-pink-500 inline mr-1" />
          Favorited techniques appear first regardless of rating.
        </p>
      )}
    </div>
  );
}
