import React, { useMemo, useState } from "react";
import { format, isToday, isThisWeek, isThisMonth, isThisYear, formatDistanceToNow } from "date-fns";
import { Calendar, Clock, Users, MapPin, Zap } from "lucide-react";
import { parseDate } from "@/lib/dateUtils";

/**
 * Future-planned activities, grouped by horizon. Used on the Activity
 * Tracker's "Planned" tab and (by composition) by UpcomingPlans on
 * other surfaces.
 *
 * Props:
 *   activities  — full list (this component filters to future ones)
 *   alters      — alter list, for assignment lookups
 *   onClick     — invoked with the activity record when a row is tapped
 *   limit       — max number of items to render (across groups). null = no limit.
 *   horizon     — "today" | "week" | "month" | "year" | "all" (default "all")
 *   compact     — render a tighter, single-section list with no headings
 *                 (for dashboard / alter panel surfaces)
 */
export default function PlannedActivitiesList({ activities = [], alters = [], onClick, limit = null, horizon = "all", compact = false }) {
  const [activeHorizon, setActiveHorizon] = useState(horizon);

  const altersById = useMemo(
    () => Object.fromEntries(alters.map(a => [a.id, a])),
    [alters]
  );

  const future = useMemo(() => {
    const now = Date.now();
    return activities
      .filter(a => {
        if (!a) return false;
        const ts = parseDate(a.timestamp);
        if (!ts || isNaN(ts)) return false;
        return ts.getTime() > now;
      })
      .sort((a, b) => parseDate(a.timestamp) - parseDate(b.timestamp));
  }, [activities]);

  const filteredByHorizon = useMemo(() => {
    if (activeHorizon === "all") return future;
    return future.filter(a => {
      const d = parseDate(a.timestamp);
      switch (activeHorizon) {
        case "today": return isToday(d);
        case "week":  return isThisWeek(d, { weekStartsOn: 0 });
        case "month": return isThisMonth(d);
        case "year":  return isThisYear(d);
        default: return true;
      }
    });
  }, [future, activeHorizon]);

  const items = limit ? filteredByHorizon.slice(0, limit) : filteredByHorizon;

  const grouped = useMemo(() => {
    const today = [], week = [], month = [], later = [];
    for (const a of items) {
      const d = parseDate(a.timestamp);
      if (isToday(d)) today.push(a);
      else if (isThisWeek(d, { weekStartsOn: 0 })) week.push(a);
      else if (isThisMonth(d)) month.push(a);
      else later.push(a);
    }
    return { today, week, month, later };
  }, [items]);

  if (compact) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1.5">
        {items.map(a => <ActivityRow key={a.id} activity={a} altersById={altersById} onClick={onClick} compact />)}
      </div>
    );
  }

  if (filteredByHorizon.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
        Nothing planned {activeHorizon === "all" ? "yet" : `for ${horizonLabel(activeHorizon)}`}.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {[
          { id: "all",   label: "All upcoming" },
          { id: "today", label: "Today" },
          { id: "week",  label: "This week" },
          { id: "month", label: "This month" },
          { id: "year",  label: "This year" },
        ].map(h => (
          <button
            key={h.id}
            type="button"
            onClick={() => setActiveHorizon(h.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              activeHorizon === h.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/40"
            }`}
          >{h.label}</button>
        ))}
      </div>

      {activeHorizon === "all" ? (
        <div className="space-y-4">
          <Group label="Today"      items={grouped.today}  altersById={altersById} onClick={onClick} />
          <Group label="This week"  items={grouped.week}   altersById={altersById} onClick={onClick} />
          <Group label="This month" items={grouped.month}  altersById={altersById} onClick={onClick} />
          <Group label="Later"      items={grouped.later}  altersById={altersById} onClick={onClick} />
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredByHorizon.map(a => <ActivityRow key={a.id} activity={a} altersById={altersById} onClick={onClick} />)}
        </div>
      )}
    </div>
  );
}

function Group({ label, items, altersById, onClick }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">{label}</p>
      <div className="space-y-1.5">
        {items.map(a => <ActivityRow key={a.id} activity={a} altersById={altersById} onClick={onClick} />)}
      </div>
    </div>
  );
}

function ActivityRow({ activity, altersById, onClick, compact }) {
  const ts = parseDate(activity.timestamp);
  const assigned = (activity.assigned_alter_ids || []).map(id => altersById[id]).filter(Boolean);
  const colorBar = activity.color || "hsl(var(--primary))";

  return (
    <button
      type="button"
      onClick={() => onClick?.(activity)}
      className={`w-full flex items-center gap-3 ${compact ? "px-2 py-1.5" : "px-3 py-2"} rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-colors text-left`}
      style={{ borderLeftColor: colorBar, borderLeftWidth: 3 }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate flex items-center gap-1.5">
          {activity.is_critical && (
            <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500 flex-shrink-0" title="Critical plan" />
          )}
          <span className="truncate">{activity.activity_name || "Untitled activity"}</span>
        </p>
        {activity.location && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
            <MapPin className="w-3 h-3 flex-shrink-0" /> <span className="truncate">{activity.location}</span>
          </p>
        )}
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
          <Clock className="w-3 h-3" />
          {format(ts, "EEE, MMM d · h:mm a")} <span className="opacity-70">· in {formatDistanceToNow(ts)}</span>
        </p>
      </div>
      {assigned.length > 0 && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground" title={`For ${assigned.map(a => a.name).join(", ")}`}>
          <Users className="w-3 h-3" />
          {assigned.length}
        </div>
      )}
      {activity.reminder_offset_minutes != null && (
        <span className="text-[10px] text-muted-foreground" title={`Reminder ${activity.reminder_offset_minutes} min before`}>
          🔔
        </span>
      )}
    </button>
  );
}

function horizonLabel(h) {
  return { today: "today", week: "this week", month: "this month", year: "this year" }[h] || h;
}
