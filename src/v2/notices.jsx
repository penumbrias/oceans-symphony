// UI v2 notices — the home board's own banner stack.
//
// Rebuilds the FUNCTIONS of the classic notice surfaces as one in-flow
// stack rendered INSIDE the board's stacking context, where the wallpaper
// (fixed, -z-10 in the same context) can never paint over it:
//
//  • fired reminders     (classic: ReminderToast)
//  • critical plans      (classic: CriticalPinnedPlans)
//  • plan due soon       (classic: AnnouncementBanner)
//  • mentions            (classic: NotificationPopups)
//
// Shared state with the classic surfaces, so acting in one UI settles the
// other: reminder writes go through ReminderInstance.update (same fields),
// critical-plan dismissals through lib/criticalPins, plan-banner acks
// through lib/planBannerAcks, mention dismissals onto the MentionLog row.
//
// Reminder actions that opened modals in the classic toast route through
// the established v2 pathways instead: the Dashboard-hosted
// "open-set-front" / "open-quick-checkin" events (this stack only renders
// on the home board, so the host is always listening).

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { AtSign, Calendar, ChevronDown, MoreHorizontal, X, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { withHighlightParam } from "@/lib/useHighlightScroll";
import { usePendingReminderInstances } from "@/lib/remindersScheduler";
import { shouldShowPin, writeDismissal } from "@/lib/criticalPins";
import { duePlanReminder, ackPlan } from "@/lib/planBannerAcks";
import { isSurfaceEnabled, SURFACE_IN_APP_BANNER } from "@/lib/upcomingPlansSurfaces";
import { statusFor, isPastTimeScheduled, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import { isUnresolvedNagEnabled } from "@/components/dashboard/UnresolvedPlansCard";
import { getActiveActivities, ACTIVE_ACTIVITY_EVENT } from "@/lib/activitySession";
import { resolveOutcome, reschedulePlan, startPlanActive } from "@/lib/planner/resolvePlan";
import BackupHealthNotice, { useBackupHealth } from "@/components/dashboard/BackupHealthNotice";
import { CATEGORY_ICONS } from "@/components/reminders/reminderHelpers";
import { formatSnoozeLabel, snoozeUntilDate } from "@/components/reminders/snoozeHelpers";
import { markMentionAcknowledgedToday } from "@/lib/dailyTaskSystem";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MAX_VISIBLE = 4;
const DEFAULT_SNOOZE = [10, 60, 240, "tomorrow"];

// One visual card shell for every notice type, so the stack reads as one
// system. Chrome colours through the accent variable, geometry through the
// board's radius/border tokens.
function NoticeCard({ children, accent = null, onClick, label }) {
  const style = {
    borderRadius: "var(--v2-radius, 12px)",
    borderWidth: "var(--v2-border-w, 1px)",
    borderStyle: "solid",
    borderColor: accent || "color-mix(in srgb, var(--v2-accent, hsl(var(--primary))) 35%, transparent)",
    ...(accent ? { borderLeftWidth: 3 } : {}),
  };
  if (onClick) {
    return (
      <div role="button" tabIndex={0} aria-label={label} onClick={onClick}
        onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
        className="w-full text-left bg-background/80 backdrop-blur-md px-3 py-2 flex items-start gap-2 cursor-pointer"
        style={style}>
        {children}
      </div>
    );
  }
  return (
    <div className="w-full bg-background/80 backdrop-blur-md px-3 py-2 flex items-start gap-2" style={style}>
      {children}
    </div>
  );
}

function DismissX({ onClick, label }) {
  return (
    <button type="button" aria-label={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="flex-shrink-0 min-w-[28px] min-h-[28px] flex items-center justify-center text-muted-foreground hover:text-foreground -mr-1 -mt-0.5">
      <X className="w-3.5 h-3.5" />
    </button>
  );
}

// ── Fired reminder ──────────────────────────────────────────────────
function ReminderNotice({ reminder, onSettle }) {
  const tr = useT();
  const navigate = useNavigate();
  const icon = CATEGORY_ICONS[reminder.category] || CATEGORY_ICONS.custom;
  const inlineActions = reminder.inline_actions || [];
  const visibleActions = inlineActions.slice(0, 2);
  const moreActions = inlineActions.slice(2);
  const snoozeOptions = reminder.snooze_options || DEFAULT_SNOOZE;

  const act = async (action) => {
    const type = action.action_type;
    if (type === "open_set_front") {
      window.dispatchEvent(new CustomEvent("open-set-front"));
    } else if (type === "open_check_in") {
      window.dispatchEvent(new CustomEvent("open-quick-checkin"));
    } else if (type === "open_grounding") navigate("/grounding");
    else if (type === "open_journal") navigate("/journals");
    else if (type === "open_diary") navigate("/checkin-log");
    else if (type === "open_symptom_check_in") navigate("/checkin-log?openSymptoms=1");
    else if (type === "open_system_map") navigate("/system-map");
    else if (type === "open_timeline") navigate("/timeline");
    else if (type === "open_todo") navigate("/todo");
    else if (type === "open_route") {
      const path = action.payload?.path;
      if (path && path !== "/") navigate(path);
    } else if (type === "log_symptom") {
      await base44.entities.SymptomCheckIn.create({
        symptom_id: action.payload?.symptom_id, timestamp: new Date().toISOString(),
      });
    } else if (type === "dismiss") {
      onSettle({ status: "dismissed" });
      return;
    }
    onSettle({ status: "acted", acted_action: type });
  };

  return (
    <NoticeCard>
      <span className="text-lg flex-shrink-0 mt-0.5" aria-hidden="true">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">{reminder.title}</p>
        {reminder.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{reminder.body}</p>}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {visibleActions.map((action, i) => (
            <button key={i} type="button" onClick={() => act(action)}
              className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted/50">
              {action.label}
            </button>
          ))}
          {moreActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={tr("notices.moreActions")}
                  className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-muted/50">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="z-[80]">
                {moreActions.map((action, i) => (
                  <DropdownMenuItem key={i} onClick={() => act(action)}>{action.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button type="button" onClick={() => onSettle({ status: "acted", acted_action: "done" })}
            className="text-xs px-2.5 py-1 rounded-lg font-medium"
            style={{
              background: "color-mix(in srgb, var(--v2-accent, hsl(var(--primary))) 18%, transparent)",
              color: "var(--v2-accent, hsl(var(--primary)))",
            }}>
            {tr("notices.done")}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-muted/50 flex items-center gap-0.5">
                {tr("notices.snooze")} <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="z-[80]">
              {snoozeOptions.map((opt, i) => (
                <DropdownMenuItem key={i}
                  onClick={() => onSettle({ status: "snoozed", snoozed_until: snoozeUntilDate(opt) })}>
                  {formatSnoozeLabel(opt)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <DismissX label={tr("notices.dismiss")} onClick={() => onSettle({ status: "dismissed" })} />
    </NoticeCard>
  );
}

// ── Mention ─────────────────────────────────────────────────────────
function MentionNotice({ mention, alter, formatAlter, onDismiss, onOpen }) {
  const tr = useT();
  const avatarUrl = useResolvedAvatarUrl(alter?.image_url || "");
  return (
    <NoticeCard onClick={onOpen} label={tr("notices.mentioned", { name: formatAlter(alter) || "?" })}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5" />
      ) : (
        <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5"
          style={{ backgroundColor: alter?.color || "var(--v2-accent, hsl(var(--primary)))" }}>
          {(alter?.name || "?").charAt(0)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <AtSign className="w-3 h-3 flex-shrink-0" style={{ color: "var(--v2-accent, hsl(var(--primary)))" }} />
          <span className="text-xs font-semibold truncate">
            {tr("notices.mentioned", { name: formatAlter(alter) || "?" })}
          </span>
          {mention.source_date && (
            <span className="text-[0.625em] text-muted-foreground ml-auto flex-shrink-0">
              {format(new Date(mention.source_date), "MM/dd")}
            </span>
          )}
        </div>
        {mention.preview_text && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{mention.preview_text}</p>
        )}
        {mention.source_label && (
          <span className="text-[0.625em] mt-0.5 block" style={{ color: "var(--v2-accent, hsl(var(--primary)))" }}>
            {tr("notices.mentionSource", { source: mention.source_label })}
          </span>
        )}
      </div>
      <DismissX label={tr("notices.dismiss")} onClick={onDismiss} />
    </NoticeCard>
  );
}

// ── Unresolved plans — tap to see WHICH, resolve each in place ──────
// The compact card used to just point at the planner, but a plan from a
// past week isn't on the planner's current view — "I get a notif that
// there are unresolved plans but can't see which". Expanding lists every
// one with its own outcome chips (same write path as the planner sheet).
function UnresolvedNotice({ rows, onResolved }) {
  const tr = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  // Reschedule-in-place: tapping the chip opens a day+time row for THAT
  // plan (default tomorrow, same clock time) — resolving by moving it
  // shouldn't require a trip to the planner.
  const [reschedId, setReschedId] = useState(null);
  const [reschedDay, setReschedDay] = useState("");
  const [reschedTime, setReschedTime] = useState("");
  // Start-as-active with a chosen start time ("I started late"): tapping
  // Start expands a small time row (default now) + Go. Details… opens the
  // tracker's full editor for this plan — start/end time, notes, who,
  // category, outcome — the same options as logging any activity.
  const [startId, setStartId] = useState(null);
  const [startTime, setStartTime] = useState("");
  const [startDay, setStartDay] = useState("");
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list() });

  const beginStart = (item) => {
    const now = new Date();
    setStartId(item.id);
    setStartDay(format(now, "yyyy-MM-dd"));
    setStartTime(format(now, "HH:mm"));
  };
  const commitStart = async (item) => {
    const [y, mo, da] = startDay.split("-").map(Number);
    const [h, mi] = startTime.split(":").map(Number);
    if (!y || !mo || !da) return;
    setBusyId(item.id);
    try {
      await startPlanActive(item, { startedAt: new Date(y, mo - 1, da, h || 0, mi || 0, 0, 0), categories });
      setStartId(null);
      onResolved();
    } finally { setBusyId(null); }
  };

  const resolve = async (item, status) => {
    setBusyId(item.id);
    try {
      await resolveOutcome(item, status);
      onResolved();
    } finally { setBusyId(null); }
  };

  const startResched = (item) => {
    const base = item.timestamp ? new Date(item.timestamp) : new Date();
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    setReschedId(item.id);
    setReschedDay(format(tomorrow, "yyyy-MM-dd"));
    setReschedTime(format(base, "HH:mm"));
  };

  const commitResched = async (item) => {
    const [y, mo, da] = reschedDay.split("-").map(Number);
    const [h, mi] = reschedTime.split(":").map(Number);
    if (!y || !mo || !da) return;
    const when = new Date(y, mo - 1, da, h || 0, mi || 0, 0, 0);
    setBusyId(item.id);
    try {
      await reschedulePlan(item, when);
      setReschedId(null);
      onResolved();
    } finally { setBusyId(null); }
  };

  return (
    <NoticeCard onClick={open ? undefined : () => setOpen(true)}
      label={tr("notices.unresolved", { count: rows.length })}>
      <Calendar className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          {rows.length === 1
            ? tr("notices.unresolvedOne", { name: rows[0].activity_name || tr("planner.untitled") })
            : tr("notices.unresolved", { count: rows.length })}
        </p>
        {open && (
          <div className="mt-1.5 space-y-1.5">
            {rows.map((item) => (
              <div key={item.id} className="border-t border-border/30 pt-1.5">
                <div className="flex items-baseline gap-2">
                  <button type="button" className="text-xs font-medium truncate text-left hover:underline"
                    onClick={() => navigate("/planner")}>
                    {item.activity_name || tr("planner.untitled")}
                  </button>
                  <span className="text-[0.625em] text-muted-foreground flex-shrink-0 ml-auto tabular-nums">
                    {item.timestamp ? format(new Date(item.timestamp), "EEE d MMM, HH:mm") : ""}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {[["done", tr("planner.done")], ["partial", tr("planner.partial")],
                    ["skipped", tr("planner.skipped")], ["cancelled", tr("planner.cancelled")]].map(([id, label]) => (
                    <button key={id} type="button" disabled={busyId === item.id}
                      onClick={(e) => { e.stopPropagation(); resolve(item, id); }}
                      className="text-[0.6875em] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground disabled:opacity-40">
                      {label}
                    </button>
                  ))}
                  <button type="button" disabled={busyId === item.id}
                    onClick={(e) => { e.stopPropagation(); reschedId === item.id ? setReschedId(null) : startResched(item); }}
                    className={`text-[0.6875em] px-2 py-0.5 rounded-full border disabled:opacity-40 ${
                      reschedId === item.id
                        ? "text-[var(--v2-accent)] border-[var(--v2-accent)]"
                        : "border-border/50 text-muted-foreground hover:text-foreground"
                    }`}>
                    {tr("planner.reschedule")}
                  </button>
                  <button type="button" disabled={busyId === item.id}
                    onClick={(e) => { e.stopPropagation(); startId === item.id ? setStartId(null) : beginStart(item); }}
                    className={`text-[0.6875em] px-2 py-0.5 rounded-full border disabled:opacity-40 ${
                      startId === item.id
                        ? "text-[var(--v2-accent)] border-[var(--v2-accent)]"
                        : "border-border/50 text-muted-foreground hover:text-foreground"
                    }`}>
                    {tr("notices.startPlan")}
                  </button>
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); navigate(`/activities?activityId=${encodeURIComponent(item.id)}`); }}
                    className="text-[0.6875em] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground">
                    {tr("notices.planDetails")}
                  </button>
                </div>
                {startId === item.id && (
                  <div className="flex items-center gap-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[0.6875em] text-muted-foreground whitespace-nowrap">{tr("notices.startedAt")}</span>
                    <input type="date" value={startDay} onChange={(e) => setStartDay(e.target.value)}
                      aria-label={tr("planner.date")}
                      className="h-7 px-1.5 rounded-lg border border-input bg-background text-[0.6875em] min-w-0" />
                    <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                      aria-label={tr("notices.startedAt")}
                      className="h-7 px-1.5 rounded-lg border border-input bg-background text-[0.6875em] min-w-0" />
                    <button type="button" disabled={busyId === item.id}
                      onClick={() => commitStart(item)}
                      className="text-[0.6875em] px-2 py-1 rounded-lg border border-[var(--v2-accent)] text-[var(--v2-accent)] disabled:opacity-40 flex-shrink-0">
                      {tr("notices.startGo")}
                    </button>
                  </div>
                )}
                {reschedId === item.id && (
                  <div className="flex items-center gap-1.5 mt-1.5" onClick={(e) => e.stopPropagation()}>
                    <input type="date" value={reschedDay} onChange={(e) => setReschedDay(e.target.value)}
                      aria-label={tr("planner.date")}
                      className="h-7 px-1.5 rounded-lg border border-input bg-background text-[0.6875em] min-w-0" />
                    <input type="time" value={reschedTime} onChange={(e) => setReschedTime(e.target.value)}
                      aria-label={tr("planner.giveTime")}
                      className="h-7 px-1.5 rounded-lg border border-input bg-background text-[0.6875em] min-w-0" />
                    <button type="button" disabled={busyId === item.id}
                      onClick={() => commitResched(item)}
                      className="text-[0.6875em] px-2 py-1 rounded-lg border border-[var(--v2-accent)] text-[var(--v2-accent)] disabled:opacity-40 flex-shrink-0">
                      {tr("planner.reschedule")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {open && (
        <DismissX label={tr("notices.collapse")} onClick={() => setOpen(false)} />
      )}
    </NoticeCard>
  );
}

// ── The stack ───────────────────────────────────────────────────────
export default function V2Notices() {
  const tr = useT();
  const backupHealth = useBackupHealth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const formatAlter = useAlterLabel();

  // Re-check every minute so time windows (plan reminders, critical lead
  // steps) open and close while the board sits on screen.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const [dismissNonce, setDismissNonce] = useState(0);

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list(),
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"], queryFn: () => base44.entities.Activity.list(),
  });
  const { data: pendingInstances = [] } = usePendingReminderInstances();
  const { data: reminders = [] } = useQuery({
    queryKey: ["reminders", "all"], queryFn: () => base44.entities.Reminder.list(),
  });
  const { data: mentionLogs = [] } = useQuery({
    queryKey: ["mentionLogs"], queryFn: () => base44.entities.MentionLog.list("-created_date", 200),
  });
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"], queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(),
  });

  const settings = settingsList[0] || null;
  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const remindersById = useMemo(() => Object.fromEntries(reminders.map((r) => [r.id, r])), [reminders]);
  const frontingAlterIds = useMemo(
    () => activeSessions.map((s) => s.alter_id || s.primary_alter_id).filter(Boolean),
    [activeSessions]
  );

  // Fired reminders with in-app delivery (or none set, for older rows).
  const firedNotices = useMemo(() => {
    const seenReminders = new Set();
    const out = [];
    for (const inst of pendingInstances) {
      if (inst.status !== "fired") continue;
      const reminder = remindersById[inst.reminder_id];
      if (!reminder) continue;
      const ch = reminder.delivery_channels;
      if (ch?.length && !ch.includes("in_app")) continue;
      // One card per REMINDER — two fired instances of the same reminder
      // must not stack (same rule as the classic toast).
      if (seenReminders.has(reminder.id)) continue;
      seenReminders.add(reminder.id);
      out.push({ key: `rem-${inst.id}`, type: "reminder", instance: inst, reminder });
    }
    return out;
  }, [pendingInstances, remindersById]);

  // Critical plans inside an open lead-step window, still scheduled.
  const criticalNotices = useMemo(() => {
    void dismissNonce;
    return activities
      .filter((a) => a.is_critical && statusFor(a) === ACTIVITY_STATUSES.SCHEDULED)
      .filter((a) => {
        const start = new Date(a.timestamp).getTime();
        const end = start + ((a.duration_minutes || 0) * 60_000);
        return end + 10 * 60_000 > now;
      })
      .map((a) => ({ plan: a, openStep: shouldShowPin(a, now) }))
      .filter((x) => x.openStep)
      .sort((a, b) => new Date(a.plan.timestamp) - new Date(b.plan.timestamp))
      .map((x) => ({ key: `crit-${x.plan.id}`, type: "critical", ...x }));
  }, [activities, now, dismissNonce]);

  // The soonest non-critical plan whose reminder window is open.
  const planNotice = useMemo(() => {
    void dismissNonce;
    if (!isSurfaceEnabled(settings, SURFACE_IN_APP_BANNER)) return null;
    const plan = duePlanReminder(activities, now);
    if (!plan) return null;
    // A critical card for the same plan outranks the plain banner.
    if (criticalNotices.some((c) => c.plan.id === plan.id)) return null;
    return { key: `plan-${plan.id}`, type: "plan", plan };
  }, [settings, activities, now, criticalNotices, dismissNonce]);

  // Past-time plans still sitting in "scheduled" — the resolve nag. One
  // compact card for however many there are; resolving happens in the
  // planner's own entry sheet (Outcome chips), so the card just points
  // there. Same toggle and grace window as the classic card.
  const [activeActs, setActiveActs] = useState(() => getActiveActivities());
  useEffect(() => {
    const refresh = () => setActiveActs(getActiveActivities());
    window.addEventListener(ACTIVE_ACTIVITY_EVENT, refresh);
    return () => window.removeEventListener(ACTIVE_ACTIVITY_EVENT, refresh);
  }, []);
  const unresolvedNotice = useMemo(() => {
    void now;
    if (!isUnresolvedNagEnabled()) return null;
    const activeIds = new Set(activeActs.map((a) => a.planActivityId).filter(Boolean));
    const rows = activities.filter(isPastTimeScheduled).filter((a) => !activeIds.has(a.id));
    if (!rows.length) return null;
    return { key: "unresolved", type: "unresolved", rows };
  }, [activities, activeActs, now]);

  // Mentions of whoever is fronting, not yet dismissed by them.
  const mentionNotices = useMemo(() => {
    return mentionLogs
      .filter((m) => {
        if (m.log_type === "authored") return false;
        if (!frontingAlterIds.includes(m.mentioned_alter_id)) return false;
        return !(m.dismissed_by_alter_ids || []).includes(m.mentioned_alter_id);
      })
      .map((m) => ({ key: `men-${m.id}`, type: "mention", mention: m }));
  }, [mentionLogs, frontingAlterIds]);

  // Urgency order: time-critical first, then fired reminders, then the
  // plan window, then mentions — the evergreen resolve-nag always last so
  // it can never crowd out something time-sensitive.
  const all = [
    ...criticalNotices,
    // Data safety outranks every plan/reminder nag — but only takes a
    // slot when backups actually need attention.
    ...(backupHealth.level !== "ok" && !backupHealth.snoozed ? [{ key: "backup-health", type: "backup" }] : []),
    ...firedNotices,
    ...(planNotice ? [planNotice] : []),
    ...mentionNotices,
    ...(unresolvedNotice ? [unresolvedNotice] : []),
  ];
  if (all.length === 0) return null;
  const shown = all.slice(0, MAX_VISIBLE);
  const overflow = all.length - shown.length;

  const settleInstance = async (instanceId, data) => {
    try {
      await base44.entities.ReminderInstance.update(instanceId, data);
      qc.invalidateQueries({ queryKey: ["reminderInstances"] });
    } catch { /* the card stays; next tap retries */ }
  };

  const dismissMention = async (m) => {
    const dismissedBy = m.dismissed_by_alter_ids || [];
    if (dismissedBy.includes(m.mentioned_alter_id)) return;
    await base44.entities.MentionLog.update(m.id, {
      dismissed_by_alter_ids: [...dismissedBy, m.mentioned_alter_id],
    });
    markMentionAcknowledgedToday();
    qc.invalidateQueries({ queryKey: ["mentionLogs"] });
  };

  return (
    <div className="space-y-1.5 mb-2" role="status" aria-live="polite" aria-atomic="false">
      {shown.map((n) => {
        if (n.type === "reminder") {
          return (
            <ReminderNotice key={n.key} reminder={n.reminder}
              onSettle={(data) => settleInstance(n.instance.id, data)} />
          );
        }
        if (n.type === "critical") {
          const ts = new Date(n.plan.timestamp);
          return (
            <NoticeCard key={n.key} accent="rgb(245 158 11)"
              label={n.plan.activity_name || tr("planner.untitled")}
              onClick={() => navigate("/planner")}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-[0.625em] uppercase tracking-wider font-semibold text-amber-500">
                  <Zap className="w-3 h-3 fill-amber-500" />
                  {tr("notices.critical")} · {n.openStep.label.toLowerCase()}
                </div>
                <p className="text-sm font-semibold truncate mt-0.5">
                  {n.plan.activity_name || tr("planner.untitled")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(ts, "EEE p")} · {ts.getTime() > now
                    ? tr("notices.inTime", { when: formatDistanceToNow(ts) })
                    : tr("notices.now")}
                </p>
              </div>
              <DismissX label={tr("notices.dismissStep")}
                onClick={() => { writeDismissal(n.plan.id, n.openStep.key); setDismissNonce((x) => x + 1); }} />
            </NoticeCard>
          );
        }
        if (n.type === "backup") {
          return <BackupHealthNotice key={n.key} variant="v2" />;
        }
        if (n.type === "unresolved") {
          return (
            <UnresolvedNotice key={n.key} rows={n.rows}
              onResolved={() => {
                qc.invalidateQueries({ queryKey: ["activities"] });
                qc.invalidateQueries({ queryKey: ["tasks"] });
              }} />
          );
        }
        if (n.type === "plan") {
          return (
            <NoticeCard key={n.key}
              label={n.plan.activity_name || tr("planner.untitled")}
              onClick={() => navigate("/planner")}>
              <Calendar className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "var(--v2-accent, hsl(var(--primary)))" }} />
              <p className="flex-1 min-w-0 text-sm">
                {tr("notices.planSoon", {
                  name: n.plan.activity_name || tr("planner.untitled"),
                  when: formatDistanceToNow(new Date(n.plan.timestamp)),
                })}
              </p>
              <DismissX label={tr("notices.dismiss")}
                onClick={() => { ackPlan(n.plan.id); setDismissNonce((x) => x + 1); }} />
            </NoticeCard>
          );
        }
        const m = n.mention;
        return (
          <MentionNotice key={n.key} mention={m} alter={altersById[m.mentioned_alter_id]}
            formatAlter={formatAlter}
            onDismiss={() => dismissMention(m)}
            onOpen={async () => {
              await dismissMention(m);
              const path = m.navigate_path || "/";
              if (path !== "/") navigate(withHighlightParam(path, m.source_id));
            }} />
        );
      })}
      {overflow > 0 && (
        <button type="button" onClick={() => navigate("/reminders")}
          className="w-full text-xs text-muted-foreground hover:text-foreground py-1 text-center bg-background/60 backdrop-blur-md"
          style={{ borderRadius: "var(--v2-radius, 12px)" }}>
          {tr("notices.more", { count: overflow })}
        </button>
      )}
    </div>
  );
}
