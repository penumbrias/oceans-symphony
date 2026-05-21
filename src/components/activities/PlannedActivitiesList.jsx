import React, { useMemo, useState } from "react";
import { format, isToday, isThisWeek, isThisMonth, isThisYear, formatDistanceToNow } from "date-fns";
import { Calendar, Clock, Users, MapPin, Zap } from "lucide-react";
import { parseDate } from "@/lib/dateUtils";
import { statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";

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
  // Upcoming = future-dated SCHEDULED plans. Past = plans that have
  // already resolved (done / partial / skipped / cancelled), regardless
  // of timestamp. Compact callers (dashboard / alter panel) keep the
  // old upcoming-only behaviour.
  const [view, setView] = useState("upcoming");

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
        // Phase 3: use the lifecycle status rather than the bare "ts > now"
        // check. A plan only belongs on the Planned tab while it's still
        // SCHEDULED — once it's done / partial / skipped / cancelled it
        // belongs in the Logged grid. Future-dated plans whose status is
        // still resolved are also excluded (the user explicitly closed
        // them out).
        const status = statusFor(a);
        if (status !== ACTIVITY_STATUSES.SCHEDULED) return false;
        return ts.getTime() > now;
      })
      .sort((a, b) => parseDate(a.timestamp) - parseDate(b.timestamp));
  }, [activities]);

  const past = useMemo(() => {
    return activities
      .filter(a => {
        if (!a) return false;
        const ts = parseDate(a.timestamp);
        if (!ts || isNaN(ts)) return false;
        const status = statusFor(a);
        // Resolved-plan statuses (the user actually marked an outcome).
        return status === ACTIVITY_STATUSES.DONE
          || status === ACTIVITY_STATUSES.PARTIAL
          || status === ACTIVITY_STATUSES.SKIPPED
          || status === ACTIVITY_STATUSES.CANCELLED;
      })
      // Most recent first — when reviewing past plans the user wants
      // the latest outcome at the top.
      .sort((a, b) => parseDate(b.timestamp) - parseDate(a.timestamp));
  }, [activities]);

  const filteredByHorizon = useMemo(() => {
    const source = view === "past" ? past : future;
    if (activeHorizon === "all") return source;
    return source.filter(a => {
      const d = parseDate(a.timestamp);
      switch (activeHorizon) {
        case "today": return isToday(d);
        case "week":  return isThisWeek(d, { weekStartsOn: 0 });
        case "month": return isThisMonth(d);
        case "year":  return isThisYear(d);
        default: return true;
      }
    });
  }, [future, past, view, activeHorizon]);

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

  const viewToggle = (
    <div className="inline-flex rounded-full border border-border/60 bg-muted/20 p-0.5 mb-3">
      <button
        type="button"
        onClick={() => { setView("upcoming"); setActiveHorizon("all"); }}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
          view === "upcoming"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Upcoming{future.length > 0 ? ` · ${future.length}` : ""}
      </button>
      <button
        type="button"
        onClick={() => { setView("past"); setActiveHorizon("all"); }}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
          view === "past"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Past{past.length > 0 ? ` · ${past.length}` : ""}
      </button>
    </div>
  );

  const horizonChips = (
    <div className="flex flex-wrap gap-2 mb-3">
      {[
        { id: "all",   label: view === "past" ? "All past" : "All upcoming" },
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
  );

  if (filteredByHorizon.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          {viewToggle}
        </div>
        {horizonChips}
        <div className="text-center py-12 text-sm text-muted-foreground">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {view === "past"
            ? `Nothing resolved ${activeHorizon === "all" ? "yet" : `for ${horizonLabel(activeHorizon)}`}.`
            : `Nothing planned ${activeHorizon === "all" ? "yet" : `for ${horizonLabel(activeHorizon)}`}.`}
        </div>
      </div>
    );
  }

  const showPastStatus = view === "past";

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        {viewToggle}
      </div>
      {horizonChips}

      {activeHorizon === "all" && view === "upcoming" ? (
        <div className="space-y-4">
          <Group label="Today"      items={grouped.today}  altersById={altersById} onClick={onClick} />
          <Group label="This week"  items={grouped.week}   altersById={altersById} onClick={onClick} />
          <Group label="This month" items={grouped.month}  altersById={altersById} onClick={onClick} />
          <Group label="Later"      items={grouped.later}  altersById={altersById} onClick={onClick} />
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredByHorizon.map(a => (
            <ActivityRow
              key={a.id}
              activity={a}
              altersById={altersById}
              onClick={onClick}
              showPastStatus={showPastStatus}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_LABELS = {
  done:      { label: "Done",      cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40" },
  partial:   { label: "Partial",   cls: "bg-amber-500/15 text-amber-500 border-amber-500/40" },
  skipped:   { label: "Skipped",   cls: "bg-muted text-muted-foreground border-border" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/15 text-destructive border-destructive/40" },
};

function Group({ label, items, altersById, onClick }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">{label}</p>
      <div className="space-y-1.5">
        {items.map(a => <ActivityRow key={a.id} activity={a} altersById={altersById} onClick={onClick} />)}
      </div>
    </div>
  );
}

function ActivityRow({ activity, altersById, onClick, compact, showPastStatus }) {
  const ts = parseDate(activity.timestamp);
  const assigned = (activity.assigned_alter_ids || []).map(id => altersById[id]).filter(Boolean);
  const colorBar = activity.color || "hsl(var(--primary))";
  const status = statusFor(activity);
  const statusMeta = showPastStatus ? STATUS_LABELS[status] : null;

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
          {statusMeta && (
            <span className={`text-[0.625rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border flex-shrink-0 ${statusMeta.cls}`}>
              {statusMeta.label}
            </span>
          )}
        </p>
        {activity.location && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.location)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="truncate hover:underline hover:text-foreground"
              title="Open in Google Maps"
            >
              {activity.location}
            </a>
          </p>
        )}
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
          <Clock className="w-3 h-3" />
          {format(ts, "EEE, MMM d · h:mm a")}
          {showPastStatus
            ? <span className="opacity-70">· {formatDistanceToNow(ts, { addSuffix: true })}</span>
            : <span className="opacity-70">· in {formatDistanceToNow(ts)}</span>}
        </p>
      </div>
      {assigned.length > 0 && (
        <div className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground" title={`For ${assigned.map(a => a.name).join(", ")}`}>
          <Users className="w-3 h-3" />
          {assigned.length}
        </div>
      )}
      {activity.reminder_offset_minutes != null && (
        <span className="text-[0.625rem] text-muted-foreground" title={`Reminder ${activity.reminder_offset_minutes} min before`}>
          🔔
        </span>
      )}
    </button>
  );
}

function horizonLabel(h) {
  return { today: "today", week: "this week", month: "this month", year: "this year" }[h] || h;
}
