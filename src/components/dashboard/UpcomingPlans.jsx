import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Calendar, Settings as SettingsIcon } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PlannedActivitiesList from "@/components/activities/PlannedActivitiesList";
import { isSurfaceEnabled } from "@/lib/upcomingPlansSurfaces";
import { statusFor, ACTIVITY_STATUSES } from "@/lib/activityStatus";
import {
  getActiveLimit,
  getLimitMode,
  setLimitMode,
  getLimitCount,
  setLimitCount,
  getLimitWindowId,
  setLimitWindowId,
  MODE_COUNT,
  MODE_WINDOW,
  WINDOW_MODE_HARD_CAP,
  WINDOW_OPTIONS,
  COUNT_MIN,
  COUNT_MAX,
} from "@/lib/upcomingPlansLimit";

/**
 * Shared widget: a compact list of upcoming planned activities, surfaced
 * on whichever places the user has enabled in Settings → Appearance →
 * Upcoming plans visibility.
 *
 * Props:
 *   placement   — surface id (must match an entry in upcomingPlansSurfaces).
 *                 If the user hasn't enabled this placement, renders null.
 *   limit       — max items to show. Pass an explicit number to force a
 *                 cap (e.g. the alter panel uses 3 to stay compact); leave
 *                 undefined to honour the user's Settings → Upcoming Plans
 *                 Visibility "limit" preference (count or time window).
 *   filterByAlterId — optional; when set, only plans assigned to this alter
 *                     show. Used by the per-alter panel.
 *   title       — heading text. Default "📅 Coming up".
 */
export default function UpcomingPlans({ placement, limit, filterByAlterId = null, title = "📅 Coming up" }) {
  const navigate = useNavigate();
  const [showSettings, setShowSettings] = useState(false);

  // Surfaces that pass an explicit numeric `limit` (e.g. the alter panel
  // forces 3) are ignoring the user's preference, so the inline cog
  // shouldn't appear there — it'd let the user change something they
  // can't see take effect.
  const allowInlineSettings = typeof limit !== "number";

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = settingsList[0] || null;

  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list(),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  // Track the user's limit preference; re-read when the storage key changes
  // (e.g. when the setting is edited in Settings). The window-event
  // listener fires on cross-tab updates; we also re-read on mount.
  // Each panel keeps its OWN limit config, keyed by its placement, so two
  // dashboard panels can show different things (e.g. "today" up top, "this
  // week" lower down). Falls back to the global Settings default until the
  // panel is individually configured via its cog.
  const [limitConfig, setLimitConfig] = useState(() => getActiveLimit(placement));
  useEffect(() => {
    const reread = () => setLimitConfig(getActiveLimit(placement));
    reread();
    window.addEventListener("storage", reread);
    window.addEventListener("upcoming-plans-limit-changed", reread);
    return () => {
      window.removeEventListener("storage", reread);
      window.removeEventListener("upcoming-plans-limit-changed", reread);
    };
  }, [placement]);

  // Per-alter panel ignores the surface gate (it's the contextual default
  // and the per-alter panel itself controls when it renders).
  if (placement !== "alter_panel" && !isSurfaceEnabled(settings, placement)) return null;

  // Filter for assigned alter if needed
  const visibleActivities = filterByAlterId
    ? activities.filter(a => (a.assigned_alter_ids || []).includes(filterByAlterId))
    : activities;

  // Decide the limit + any pre-filter to apply.
  //
  // If the caller passed an explicit `limit` prop (e.g. the alter panel
  // forces 3), respect it — those surfaces have a tighter context that
  // shouldn't pick up the user's dashboard preference. Otherwise consult
  // the user setting: count mode is a plain slice cap, window mode
  // pre-filters by timestamp and applies a sanity cap.
  let effectiveLimit;
  let prefilteredActivities = visibleActivities;
  if (typeof limit === "number") {
    effectiveLimit = limit;
  } else if (limitConfig.mode === MODE_WINDOW) {
    const cutoff = Date.now() + limitConfig.windowMs;
    prefilteredActivities = visibleActivities.filter(a => {
      if (statusFor(a) !== ACTIVITY_STATUSES.SCHEDULED) return false;
      const ts = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
      return ts > 0 && ts <= cutoff;
    });
    effectiveLimit = WINDOW_MODE_HARD_CAP;
  } else {
    effectiveLimit = limitConfig.count;
  }

  // Compose the list — but only render the wrapper if there's at least one
  // upcoming item, so empty surfaces stay hidden.
  const now = Date.now();
  // Only count still-SCHEDULED future plans, matching what
  // PlannedActivitiesList actually renders — otherwise a future plan
  // already marked done/skipped/cancelled would show the header with an
  // empty list under it (and eat window-mode slots).
  const upcomingCount = prefilteredActivities.filter(a => {
    if (statusFor(a) !== ACTIVITY_STATUSES.SCHEDULED) return false;
    const ts = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    return ts > now;
  }).length;
  if (upcomingCount === 0) return null;

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between px-1 mb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Calendar className="w-3 h-3" /> {title}
          {allowInlineSettings && limitConfig.mode === MODE_WINDOW && (
            <span className="normal-case font-normal text-muted-foreground/60">· {limitConfig.windowLabel}</span>
          )}
        </p>
        <div className="flex items-center gap-3">
          {allowInlineSettings && (
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              aria-label="Upcoming plans settings"
              title="Adjust how many plans show"
              className="text-muted-foreground hover:text-foreground"
            >
              <SettingsIcon className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate("/activities")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >See all</button>
        </div>
      </div>
      <PlannedActivitiesList
        activities={prefilteredActivities}
        alters={alters}
        compact
        limit={effectiveLimit}
        onClick={(activity) => navigate(activity?.id ? `/activities?activityId=${activity.id}` : "/activities")}
      />
      {allowInlineSettings && (
        <UpcomingPlansSettingsDialog
          open={showSettings}
          scope={placement}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// Inline settings dialog — mirrors the pattern used by
// PinnedDailyTasksWidget so users can adjust how many upcoming plans
// surface without navigating to Settings → Appearance.
function UpcomingPlansSettingsDialog({ open, scope, onClose }) {
  const [mode, setMode] = useState(MODE_COUNT);
  const [count, setCount] = useState(5);
  const [windowId, setWindowId] = useState(WINDOW_OPTIONS[0].id);

  useEffect(() => {
    if (!open) return;
    // Reload current values every time the dialog opens so the form
    // doesn't carry over a half-edited draft from a previous open.
    setMode(getLimitMode(scope));
    setCount(getLimitCount(scope));
    setWindowId(getLimitWindowId(scope));
  }, [open, scope]);

  const handleSave = () => {
    // Write to THIS panel's scope only — other panels keep their own config.
    setLimitMode(mode, scope);
    if (mode === MODE_COUNT) setLimitCount(count, scope);
    else setLimitWindowId(windowId, scope);
    // Every UpcomingPlans instance listens and re-reads its own scope.
    window.dispatchEvent(new Event("upcoming-plans-limit-changed"));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Upcoming plans settings</DialogTitle>
          <DialogDescription>
            Choose whether to show a fixed number of plans or everything inside a time window.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="upcoming-plans-mode"
                value={MODE_COUNT}
                checked={mode === MODE_COUNT}
                onChange={() => setMode(MODE_COUNT)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Show next N plans</p>
                <p className="text-xs text-muted-foreground">A fixed cap regardless of how far out they are.</p>
                {mode === MODE_COUNT && (
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type="number"
                      min={COUNT_MIN}
                      max={COUNT_MAX}
                      value={count}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") { setCount(""); return; }
                        const n = parseInt(raw, 10);
                        if (Number.isFinite(n)) setCount(n);
                      }}
                      onBlur={() => {
                        const n = parseInt(count, 10);
                        if (!Number.isFinite(n)) setCount(COUNT_MIN);
                        else setCount(Math.max(COUNT_MIN, Math.min(COUNT_MAX, n)));
                      }}
                      className="w-20 h-8 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">plans ({COUNT_MIN}–{COUNT_MAX})</span>
                  </div>
                )}
              </div>
            </label>
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="upcoming-plans-mode"
                value={MODE_WINDOW}
                checked={mode === MODE_WINDOW}
                onChange={() => setMode(MODE_WINDOW)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Show plans in a time window</p>
                <p className="text-xs text-muted-foreground">Everything coming up inside this range (capped at {WINDOW_MODE_HARD_CAP}).</p>
                {mode === MODE_WINDOW && (
                  <select
                    value={windowId}
                    onChange={(e) => setWindowId(e.target.value)}
                    className="mt-2 w-full h-8 text-sm rounded-md border border-border bg-background px-2"
                  >
                    {WINDOW_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                )}
              </div>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
