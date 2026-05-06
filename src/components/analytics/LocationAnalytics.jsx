import React, { useMemo } from "react";
import { localEntities } from "@/api/base44Client";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { startOfDay, endOfDay, format } from "date-fns";
import { MapPin } from "lucide-react";
import { LOCATION_CATEGORIES, getCategoryMeta } from "@/lib/locationCategories";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function LocationAnalytics({ from, to }) {
  const fromMs = startOfDay(from).getTime();
  const toMs = endOfDay(to).getTime();

  const { data: allLocations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => localEntities.Location.list(),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 2000),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const locations = useMemo(
    () => allLocations.filter(loc => {
      const t = new Date(loc.timestamp).getTime();
      return t >= fromMs && t <= toMs;
    }),
    [allLocations, fromMs, toMs]
  );

  const altersById = useMemo(() => {
    const m = {};
    alters.forEach(a => { m[a.id] = a; });
    return m;
  }, [alters]);

  const catCounts = useMemo(() => {
    const c = {};
    for (const loc of locations) {
      c[loc.category] = (c[loc.category] || 0) + 1;
    }
    return c;
  }, [locations]);

  const topPlaces = useMemo(() => {
    const counts = {};
    for (const loc of locations) {
      const key = loc.name || getCategoryMeta(loc.category).label;
      if (!counts[key]) counts[key] = { name: key, category: loc.category, count: 0 };
      counts[key].count++;
    }
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [locations]);

  const hourDist = useMemo(() => {
    const h = Array(24).fill(0);
    for (const loc of locations) h[new Date(loc.timestamp).getHours()]++;
    return h;
  }, [locations]);

  const dayDist = useMemo(() => {
    const d = Array(7).fill(0);
    for (const loc of locations) d[new Date(loc.timestamp).getDay()]++;
    return d;
  }, [locations]);

  const alterLocationCounts = useMemo(() => {
    const counts = {};
    for (const loc of locations) {
      const locTime = new Date(loc.timestamp).getTime();
      const buffer = 30 * 60 * 1000;
      for (const s of sessions) {
        const sStart = new Date(s.start_time).getTime();
        const sEnd = s.end_time ? new Date(s.end_time).getTime() : Date.now();
        if (sStart <= locTime + buffer && sEnd >= locTime - buffer) {
          const ids = s.alter_id
            ? [s.alter_id]
            : [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean);
          for (const id of ids) {
            if (!counts[id]) counts[id] = {};
            const catKey = loc.category || "other";
            counts[id][catKey] = (counts[id][catKey] || 0) + 1;
          }
        }
      }
    }
    return counts;
  }, [locations, sessions]);

  const topAlterLocations = useMemo(() => {
    return Object.entries(alterLocationCounts)
      .map(([alterId, cats]) => ({
        alter: altersById[alterId],
        cats,
        total: Object.values(cats).reduce((a, b) => a + b, 0),
      }))
      .filter(x => x.alter)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [alterLocationCounts, altersById]);

  const maxHour = Math.max(...hourDist, 1);
  const maxDay = Math.max(...dayDist, 1);
  const maxCatCount = Math.max(...Object.values(catCounts), 1);
  const maxPlaceCount = topPlaces.length > 0 ? topPlaces[0].count : 1;

  if (locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <MapPin className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground text-sm">No location data in this date range.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Log locations via check-in or the Location History page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Category breakdown */}
      <div className="bg-card border border-border/50 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">By Category</h3>
        <div className="space-y-2">
          {LOCATION_CATEGORIES.filter(cat => catCounts[cat.id]).map(cat => (
            <div key={cat.id} className="flex items-center gap-3">
              <span className="text-base w-6 flex-shrink-0">{cat.emoji}</span>
              <span className="text-xs w-16 text-muted-foreground flex-shrink-0">{cat.label}</span>
              <div className="flex-1 h-4 bg-muted/40 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(catCounts[cat.id] / maxCatCount) * 100}%`,
                    backgroundColor: cat.color,
                  }}
                />
              </div>
              <span className="text-xs font-semibold text-foreground w-6 text-right flex-shrink-0">
                {catCounts[cat.id]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top places */}
      {topPlaces.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Most Visited Places</h3>
          <div className="space-y-2">
            {topPlaces.map((place, i) => {
              const cat = getCategoryMeta(place.category);
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm w-5">{cat.emoji}</span>
                  <span className="text-xs flex-1 truncate">{place.name}</span>
                  <div className="w-24 h-2.5 bg-muted/40 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(place.count / maxPlaceCount) * 100}%`, backgroundColor: cat.color }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-4 text-right">{place.count}×</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Time of day */}
      <div className="bg-card border border-border/50 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Time of Day</h3>
        <div className="flex items-end gap-px h-20">
          {hourDist.map((count, h) => (
            <div key={h} className="flex-1 flex flex-col items-center gap-0.5" title={`${h}:00 — ${count} check-ins`}>
              <div
                className="w-full rounded-sm bg-primary/60 transition-all"
                style={{ height: count ? `${(count / maxHour) * 64}px` : "2px", opacity: count ? 1 : 0.2 }}
              />
              {h % 6 === 0 && (
                <span className="text-muted-foreground" style={{ fontSize: 8 }}>
                  {h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Day of week */}
      <div className="bg-card border border-border/50 rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Day of Week</h3>
        <div className="flex items-end gap-2 h-16">
          {DAYS.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-sm bg-primary/60 transition-all"
                style={{ height: dayDist[i] ? `${(dayDist[i] / maxDay) * 44}px` : "2px", opacity: dayDist[i] ? 1 : 0.2 }}
                title={`${day}: ${dayDist[i]} check-ins`}
              />
              <span className="text-xs text-muted-foreground">{day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Alter-location correlation */}
      {topAlterLocations.length > 0 && (
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-1">Alters by Location</h3>
          <p className="text-xs text-muted-foreground mb-3">Fronting sessions overlapping logged locations (±30 min)</p>
          <div className="space-y-3">
            {topAlterLocations.map(({ alter, cats }) => (
              <div key={alter.id} className="flex items-start gap-2">
                <div
                  className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white mt-0.5"
                  style={{ backgroundColor: alter.color || "#9333ea" }}
                >
                  {alter.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{alter.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(cats)
                      .sort((a, b) => b[1] - a[1])
                      .map(([catId, count]) => {
                        const cat = getCategoryMeta(catId);
                        return (
                          <span
                            key={catId}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border"
                            style={{ backgroundColor: cat.color + "20", borderColor: cat.color + "40", color: cat.color }}
                          >
                            {cat.emoji} {cat.label} ×{count}
                          </span>
                        );
                      })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
