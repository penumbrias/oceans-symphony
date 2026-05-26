import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { base44, localEntities } from "@/api/base44Client";
import { LOCATION_CATEGORIES } from "@/lib/locationCategories";
import { withHighlightParam } from "@/lib/useHighlightScroll";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Inbox } from "lucide-react";
import { toast } from "sonner";
import QuickActionsMenu from "@/components/dashboard/QuickActionsMenu";
import CurrentFronters from "@/components/dashboard/CurrentFronters";
import UpcomingPlans from "@/components/dashboard/UpcomingPlans";
import CriticalPinnedPlans from "@/components/dashboard/CriticalPinnedPlans";
import UnresolvedPlansCard from "@/components/dashboard/UnresolvedPlansCard";
import DashboardPins from "@/components/dashboard/DashboardPins";
import PinnedDailyTasksWidget from "@/components/dashboard/PinnedDailyTasksWidget";
import CurrentSymptoms from "@/components/symptoms/CurrentSymptoms";
import NotificationPopups from "@/components/dashboard/NotificationPopups";
import NotificationHistoryModal from "@/components/dashboard/NotificationHistoryModal";
import QuickNavMenu from "@/components/dashboard/QuickNavMenu";
import NewFeaturesBar from "@/components/dashboard/NewFeaturesBar";
import { markQuickActionUsedToday } from "@/lib/dailyTaskSystem";
import BulletinBoard from "@/components/bulletin/BulletinBoard";
import QuickCheckInModal from "@/components/emotions/QuickCheckInModal";
import TourModal from "@/components/onboarding/TourModal";
import TermsSetupModal from "@/components/onboarding/TermsSetupModal";
import DisclaimerModal, { DISCLAIMER_ACK_KEY } from "@/components/onboarding/DisclaimerModal";
import { useTerms } from "@/lib/useTerms";
import StatusNoteCard from "@/components/dashboard/StatusNoteCard";
import { resolveLayout, isElementEnabled } from "@/lib/dashboardLayout";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [showEmotionModal, setShowEmotionModal] = useState(false);
  const [showNotifHistory, setShowNotifHistory] = useState(false);
  const [highlightBulletinId, setHighlightBulletinId] = useState(null);
  const [showTour, setShowTour] = useState(false);
  const { setShowFeatureTour } = useOutletContext() || {};
  const [showDisclaimer, setShowDisclaimer] = useState(() => !localStorage.getItem(DISCLAIMER_ACK_KEY));
  const [showTermsSetup, setShowTermsSetup] = useState(() => !localStorage.getItem("terms_setup_done"));
  const [showPreview, setShowPreview] = useState(() => localStorage.getItem("preview_open") === "true");



  const handleTogglePreview = () => {
    const newState = !showPreview;
    setShowPreview(newState);
    localStorage.setItem("preview_open", newState ? "true" : "false");
  };

  const handleTourClose = () => {
    localStorage.setItem("tour_seen", "1");
    setShowTour(false);
  };

  const handleTermsDone = () => {
    setShowTermsSetup(false);
    if (!localStorage.getItem("tour_seen")) setShowTour(true);
  };
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const open = () => setShowEmotionModal(true);
    const close = () => setShowEmotionModal(false);
    window.addEventListener("open-quick-checkin", open);
    window.addEventListener("open-quick-checkin-close", close);
    return () => {
      window.removeEventListener("open-quick-checkin", open);
      window.removeEventListener("open-quick-checkin-close", close);
    };
  }, []);

  useEffect(() => {
    const bid = location.state?.highlightBulletinId;
    if (bid) {
      setHighlightBulletinId(bid);
      setTimeout(() => setHighlightBulletinId(null), 5000);
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  // PWA home-screen shortcuts launch the dashboard with ?action=… so the
  // user lands directly in the relevant modal. Strip the param after firing
  // so a refresh doesn't keep re-opening the modal.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get("action");
    if (!action) return;
    if (action === "quick-checkin") {
      setShowEmotionModal(true);
    } else if (action === "set-front") {
      window.dispatchEvent(new CustomEvent("open-set-front"));
    }
    params.delete("action");
    const newSearch = params.toString();
    navigate({ pathname: location.pathname, search: newSearch ? `?${newSearch}` : "" }, { replace: true });
  }, [location.search]);

  const handleNotifClick = (mentionLog) => {
    setShowNotifHistory(false);
    const path = mentionLog.navigate_path || "/";
    // Local highlight stays as-is for dashboard bulletins — the
    // BulletinBoard already reads highlightBulletinId from state and
    // pulses the matching card.
    if (path === "/" && mentionLog.source_id) {
      setHighlightBulletinId(mentionLog.source_id);
      setTimeout(() => setHighlightBulletinId(null), 5000);
      return;
    }
    // Cross-page navigation — append `?highlight=<source_id>` so the
    // destination page's useHighlightScroll hook can scroll-to +
    // pulse the matching `[data-highlight-id="…"]` element for 3s.
    // Falls back to plain navigation if the notification has no
    // source_id (rare; e.g. system-wide announcements).
    navigate(withHighlightParam(path, mentionLog.source_id));
  };

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list()
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 50)
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list()
  });
  const terms = useTerms();
  const systemName = settings[0]?.system_name || `Your ${terms.system}`;

  // Resolved dashboard element ordering + per-element toggles. The
  // settings panel writes these to SystemSettings.dashboard_layout and
  // dispatches a `dashboard-layout-changed` event; we just re-derive
  // from the react-query cache each render, so the layout updates
  // immediately when the user changes it in Settings without needing
  // a manual page reload.
  const dashboardLayout = useMemo(
    () => resolveLayout(settings[0]?.dashboard_layout),
    [settings]
  );
  const layoutEnabled = useMemo(() => {
    const map = {};
    for (const e of dashboardLayout) map[e.id] = isElementEnabled(dashboardLayout, e.id);
    return map;
  }, [dashboardLayout]);

  const { data: mentionLogs = [] } = useQuery({
    queryKey: ["mentionLogs"],
    queryFn: () => base44.entities.MentionLog.list("-created_date", 200)
  });

  // Extract currently active alter IDs from active FrontingSession records.
  // Supports both new individual model (alter_id per row, is_primary flag)
  // and legacy grouped model (primary_alter_id + co_fronter_ids). For the
  // new model, the primary session is whichever row has is_primary === true
  // — not just the first one in `-start_time` order, since that can put a
  // co-fronter (the most recent join) ahead of the actual primary.
  const activeSessions = sessions.filter((s) => s.is_active);
  let frontingAlterIds = [];
  let currentAlterId = null;

  if (activeSessions.length > 0) {
    // New individual model: each session is one alter
    if (activeSessions.some(s => s.alter_id)) {
      frontingAlterIds = activeSessions.map((s) => s.alter_id).filter(Boolean);
      const primarySess = activeSessions.find(s => s.alter_id && s.is_primary);
      currentAlterId = primarySess?.alter_id || frontingAlterIds[0] || null;
    } else {
      // Legacy grouped model: sessions group multiple alters
      const firstSession = activeSessions[0];
      currentAlterId = firstSession.primary_alter_id || null;
      frontingAlterIds = [firstSession.primary_alter_id, ...(firstSession.co_fronter_ids || [])].filter(Boolean);
    }
  }

  const [emotionModalInitialSection, setEmotionModalInitialSection] = useState(null);

  // Live clock — updates every minute
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  // ── Quick Actions (long press) ────────────────────────────────────────────
  const holdTimerRef = useRef(null);
  const holdStartRef = useRef(null);
  const timerFiredRef = useRef(false);
  const showQuickActionsRef = useRef(false);
  // Pointer-origin tracking so the hold cancels if the user's finger moves
  // (e.g. they start to scroll mid-press) — see onPointerMove handler on
  // the button.
  const holdOriginRef = useRef({ x: 0, y: 0 });
  const [holdProgress, setHoldProgress] = useState(0);
  const [showQuickActions, setShowQuickActions] = useState(false);

  // Native home-screen shortcut deep-links here with ?openQuickActions=1.
  // Auto-trigger the in-app Quick Actions overlay so the long-press is
  // unnecessary — same UI, OS-level entry point.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("openQuickActions") === "1") {
        showQuickActionsRef.current = true;
        setShowQuickActions(true);
        // Clean the URL so a refresh doesn't keep re-opening the menu.
        params.delete("openQuickActions");
        const qs = params.toString();
        const newUrl = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
        window.history.replaceState(null, "", newUrl);
      }
    } catch { /* non-fatal */ }
  }, []);

  const { data: quickActionsRaw = [] } = useQuery({
    queryKey: ["quickActions"],
    queryFn: () => base44.entities.QuickAction.list("order"),
  });
  const sortedQuickActions = [...quickActionsRaw].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const startHold = (e) => {
    // If menu already open, close it instead
    if (showQuickActionsRef.current) {
      showQuickActionsRef.current = false;
      setShowQuickActions(false);
      return;
    }
    timerFiredRef.current = false;
    holdStartRef.current = Date.now();
    holdOriginRef.current = { x: e.clientX ?? 0, y: e.clientY ?? 0 };

    const tick = () => {
      if (!holdStartRef.current) return;
      const elapsed = Date.now() - holdStartRef.current;
      const progress = Math.min(100, (elapsed / 500) * 100);
      setHoldProgress(progress);
      if (progress < 100) {
        holdTimerRef.current = setTimeout(tick, 50);
      } else {
        timerFiredRef.current = true;
        holdStartRef.current = null;
        setHoldProgress(0);
        if (navigator.vibrate) navigator.vibrate(50);
        showQuickActionsRef.current = true;
        setShowQuickActions(true);
      }
    };
    holdTimerRef.current = setTimeout(tick, 50);
  };

  const endHold = (e) => {
    // Prevent the synthetic click event mobile browsers fire after pointerup —
    // without this, the click lands on the modal's date field which is now
    // positioned where the button was.
    e?.preventDefault?.();
    if (!holdStartRef.current) return;
    clearTimeout(holdTimerRef.current);
    holdStartRef.current = null;
    setHoldProgress(0);
    if (!timerFiredRef.current && !showQuickActionsRef.current) {
      setShowEmotionModal(true);
    }
  };

  // Cancel an in-progress hold if the finger moves more than a few pixels —
  // a real scroll gesture starts with a press and then moves, and we don't
  // want that to count as "the user is holding here". 12px of slop allows
  // for natural finger jitter.
  const moveHold = (e) => {
    if (!holdStartRef.current || timerFiredRef.current) return;
    const SLOP = 12;
    const dx = (e.clientX ?? 0) - holdOriginRef.current.x;
    const dy = (e.clientY ?? 0) - holdOriginRef.current.y;
    if (dx * dx + dy * dy > SLOP * SLOP) {
      clearTimeout(holdTimerRef.current);
      holdStartRef.current = null;
      setHoldProgress(0);
    }
  };

  const executeQuickAction = async (action, extraData = {}) => {
    showQuickActionsRef.current = false;
    setShowQuickActions(false);
    markQuickActionUsedToday();
    const now = new Date().toISOString();

    if (action.type === "open_checkin_section") {
      setEmotionModalInitialSection(action.config?.section || null);
      setShowEmotionModal(true);
    } else if (action.type === "open_set_front") {
      window.dispatchEvent(new CustomEvent("open-set-front"));
    } else if (action.type === "set_front_alter") {
      const alterId = action.config?.alter_id;
      if (!alterId) return;
      const active = await base44.entities.FrontingSession.filter({ is_active: true });
      await Promise.all(active.map((s) =>
        base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now })
      ));
      await base44.entities.FrontingSession.create({ alter_id: alterId, is_primary: true, start_time: now, is_active: true });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      const alterObj = alters.find((a) => a.id === alterId);
      toast.success(`${alterObj?.name || "Alter"} set as ${terms.fronting}`);
    } else if (action.type === "add_to_front_alter") {
      const alterId = action.config?.alter_id;
      if (!alterId) return;
      await base44.entities.FrontingSession.create({ alter_id: alterId, is_primary: false, start_time: now, is_active: true });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      const alterObj = alters.find((a) => a.id === alterId);
      toast.success(`${alterObj?.name || "Alter"} added as co-${terms.fronter}`);
    } else if (action.type === "log_activity") {
      const { category_id, duration_minutes } = action.config || {};
      if (!category_id) return;
      const cat = activityCategories.find((c) => c.id === category_id);
      await base44.entities.Activity.create({
        activity_name: cat?.name || "",
        activity_category_ids: [category_id],
        duration_minutes: duration_minutes || null,
        fronting_alter_ids: frontingAlterIds,
        emotions: [],
        notes: null,
        timestamp: now,
      });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      toast.success(`${cat?.name || "Activity"} logged`);
    } else if (action.type === "log_symptom") {
      const { symptom_id } = action.config || {};
      if (!symptom_id) return;
      const severity = extraData.severity ?? null;

      // Mirror SymptomsSection: create/update a SymptomSession so it shows on the dashboard
      const activeSessions = await base44.entities.SymptomSession.filter({ is_active: true });
      const existing = activeSessions.find(s => s.symptom_id === symptom_id);
      if (existing) {
        if (severity !== null) {
          const snaps = existing.severity_snapshots || [];
          await base44.entities.SymptomSession.update(existing.id, {
            severity_snapshots: [...snaps, { severity, timestamp: now }],
          });
        }
      } else {
        await base44.entities.SymptomSession.create({
          symptom_id,
          start_time: now,
          is_active: true,
          severity_snapshots: severity !== null ? [{ severity, timestamp: now }] : [],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });

      // Create a parent check-in to tie the symptom to fronting alters (mirrors QuickCheckInModal)
      let checkInId = null;
      if (frontingAlterIds.length > 0) {
        const parent = await base44.entities.EmotionCheckIn.create({
          timestamp: now,
          emotions: [],
          fronting_alter_ids: frontingAlterIds,
        }).catch(() => null);
        checkInId = parent?.id || null;
        if (checkInId) queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
      }
      await base44.entities.SymptomCheckIn.create({ symptom_id, severity, timestamp: now, check_in_id: checkInId });
      queryClient.invalidateQueries({ queryKey: ["symptomCheckIns"] });
      toast.success("Logged");
    } else if (action.type === "log_emotion") {
      const { emotion_label } = action.config || {};
      if (!emotion_label) return;
      await base44.entities.EmotionCheckIn.create({
        timestamp: now,
        emotions: [emotion_label],
        fronting_alter_ids: frontingAlterIds,
      });
      queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
      toast.success(`${emotion_label} logged`);
    } else if (action.type === "log_diary") {
      const { value } = extraData;
      const { group_id, field_data_key, field_label } = action.config || {};
      if (!group_id || !field_data_key || value === undefined || value === null) return;
      const cardData = {};
      if (group_id === "urges") {
        cardData.urges = { [field_data_key]: value };
      } else if (group_id === "body_mind") {
        cardData.body_mind = { [field_data_key]: value };
      } else if (group_id === "skills") {
        if (field_data_key === "skills_practiced") {
          cardData.skills_practiced = value;
        } else {
          cardData.medication_safety = { [field_data_key]: value };
        }
      }
      await base44.entities.DiaryCard.create({
        card_type: "daily",
        date: format(new Date(), "yyyy-MM-dd"),
        name: `Daily — ${format(new Date(), "MMM d, yyyy")}`,
        fronting_alter_ids: frontingAlterIds,
        emotions: [],
        ...cardData,
      });
      queryClient.invalidateQueries({ queryKey: ["diaryCards"] });
      toast.success(`${field_label || "Diary"} logged`);
    } else if (action.type === "log_location") {
      // OS-launcher shortcut path: executeQuickAction(qa) was called
      // with no extraData. The in-app LocationRow normally collects
      // category/name/coords first, but the OS shortcut bypasses it,
      // which previously produced a record literally named "Location"
      // with no GPS data. Pop the in-app quick actions sheet so the
      // user gets the pills + Get-GPS button before we save.
      if (!extraData || (extraData.category === undefined && extraData.name === undefined && extraData.coords === undefined)) {
        showQuickActionsRef.current = true;
        setShowQuickActions(true);
        return;
      }
      const { category, name, coords } = extraData;
      const catMeta = LOCATION_CATEGORIES.find(c => c.id === category);
      await localEntities.Location.create({
        timestamp: now,
        name: name?.trim() || catMeta?.label || "Location",
        category: category || "other",
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        source: coords ? "gps" : "manual",
      });
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast.success("Location logged");
    } else if (action.type === "view_grocery_list") {
      window.dispatchEvent(new CustomEvent("open-grocery-list"));
    } else if (action.type === "add_grocery_item") {
      window.dispatchEvent(new CustomEvent("open-grocery-list", { detail: { focusInput: true } }));
    } else if (action.type === "toggle_daily_task") {
      // Mirrors handleToggle in DailyTaskRow (components/dashboard/QuickActionsMenu.jsx)
      // — the in-app quick-actions menu renders DailyTaskRow with its
      // own toggle button, but the OS-launcher shortcut path goes
      // through executeQuickAction directly and needs to do the same
      // work here. Without this case the shortcut tap appeared to do
      // nothing.
      const taskId = action.config?.task_id;
      if (!taskId) return;
      const today = format(new Date(), "yyyy-MM-dd");
      const templates = await base44.entities.DailyTaskTemplate.list("sort_order", 200);
      const tpl = templates.find(t => t.id === taskId);
      if (!tpl || tpl.mode !== "MANUAL") {
        toast.error("That daily task can't be toggled from a shortcut");
        return;
      }
      const allProgress = await base44.entities.DailyProgress.list("-date", 100);
      const currentRecord = allProgress.find(p =>
        (p.frequency === "daily" || !p.frequency) &&
        (p.period_key === today || p.date === today)
      );
      const completedIds = new Set(currentRecord?.completed_task_ids || []);
      const nowCompleted = !completedIds.has(taskId);
      if (nowCompleted) completedIds.add(taskId);
      else completedIds.delete(taskId);
      const currentXP = currentRecord?.xp_earned || 0;
      const newXP = nowCompleted
        ? currentXP + (tpl.points || 0)
        : Math.max(0, currentXP - (tpl.points || 0));
      if (currentRecord) {
        await base44.entities.DailyProgress.update(currentRecord.id, {
          completed_task_ids: [...completedIds],
          xp_earned: newXP,
        });
      } else {
        await base44.entities.DailyProgress.create({
          date: today,
          period_key: today,
          frequency: "daily",
          completed_task_ids: [...completedIds],
          xp_earned: newXP,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["dailyProgress"] });
      toast.success(
        nowCompleted
          ? (tpl.points > 0 ? `+${tpl.points} XP — ${tpl.title} done! 🎉` : `${tpl.title} done!`)
          : `${tpl.title} unchecked`
      );
    }
  };

  // Deep-link from the native OS launcher shortcut. nativeQuickActions
  // pushes each QuickAction as an Android home-screen shortcut whose
  // intent URL is /?quickAction=<id>. When the user taps one of those
  // shortcuts, the Dashboard mounts (cold launch) or react-router
  // navigates here with the new query (warm launch via appUrlOpen).
  //
  // We watch location.search rather than using a one-shot ref so a
  // second shortcut tap in the same session re-triggers — the old
  // ref-based guard meant only the FIRST shortcut after launch did
  // anything (the user reported this: "stoned symptom triggers but
  // daily tasks and other things will not"). The URL itself is the
  // lock now: we clear `?quickAction=…` from history before running
  // the action so a refresh / re-render won't repeat it.
  useEffect(() => {
    if (!quickActionsRaw || quickActionsRaw.length === 0) return; // wait for data
    let qaId;
    try {
      qaId = new URLSearchParams(location.search).get("quickAction");
    } catch { return; }
    if (!qaId) return;
    const qa = quickActionsRaw.find(a => a.id === qaId);
    // Clean the URL whether or not we found a matching record — a
    // stale id shouldn't keep retrying. Use navigate(replace:true) so
    // react-router's location.search updates too (window.history
    // alone wouldn't, which would make tapping the same shortcut
    // twice in a row look like a no-op the second time).
    try {
      const params = new URLSearchParams(location.search);
      params.delete("quickAction");
      const qs = params.toString();
      navigate(location.pathname + (qs ? `?${qs}` : "") + location.hash, { replace: true });
    } catch { /* non-fatal */ }
    if (!qa) return;
    executeQuickAction(qa);
  }, [quickActionsRaw, location.search]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pt-0 sm:pt-0">
      
      
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground">{systemName}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex items-center gap-1">
        <div className="flex flex-col items-end gap-0.5">
        <button
            onClick={() => setShowTour(true)}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted/50 transition-colors whitespace-nowrap"
            title="Open guide">
          Guide
        </button>
        <button
            onClick={() => setShowFeatureTour(true)}
            className="text-xs text-primary hover:text-primary/80 px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors font-medium whitespace-nowrap"
            title="Interactive feature tour">
          Tour
        </button>
        </div>
        <button
            onClick={() => setShowNotifHistory(true)}
            aria-label="Notification history"
            title="Notification history"
            className="relative mt-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">

          <Inbox className="w-5 h-5" />
          {mentionLogs.some(m =>
            m.log_type !== "authored" &&
            (m.mentioned_alter_id || m.alter_id) &&
            frontingAlterIds.includes(m.mentioned_alter_id || m.alter_id) &&
            !(m.dismissed_by_alter_ids || []).includes(m.mentioned_alter_id || m.alter_id) &&
            m.is_read !== true
          ) && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" aria-hidden="true" />
          )}
        </button>
        </div>
      </div>

      <CriticalPinnedPlans />
      <UnresolvedPlansCard />
      <NotificationHistoryModal
        open={showNotifHistory}
        onClose={() => setShowNotifHistory(false)}
        alters={alters}
        frontingAlterIds={frontingAlterIds}
        onNotifClick={handleNotifClick}
      />

      {/* Layout-driven element rendering. Order + enabled state come
          from SystemSettings.dashboard_layout via the Appearance
          settings panel. New elements that ship later get backfilled
          at their default position by resolveLayout. */}
      {dashboardLayout.map((entry) => {
        if (!layoutEnabled[entry.id]) return null;
        switch (entry.id) {
          case "upcoming_top":
            return <UpcomingPlans key="upcoming_top" placement="home_top" />;
          case "current_fronters":
            return (
              <CurrentFronters
                key="current_fronters"
                alters={alters}
                hideStatusNote={layoutEnabled.status_note}
              />
            );
          case "status_note":
            return <StatusNoteCard key="status_note" />;
          case "dashboard_pins":
            return <DashboardPins key="dashboard_pins" />;
          case "pinned_daily_tasks":
            return <PinnedDailyTasksWidget key="pinned_daily_tasks" />;
          case "current_symptoms":
            return (
              <CurrentSymptoms
                key="current_symptoms"
                onOpenCheckIn={(section) => {
                  setEmotionModalInitialSection(section);
                  setShowEmotionModal(true);
                }}
              />
            );
          case "quick_checkin":
            return (
              <div key="quick_checkin" className="relative inline-flex mb-2">
                <button
                  data-tour="quick-checkin"
                  onPointerDown={startHold}
                  onPointerMove={moveHold}
                  onPointerUp={endHold}
                  onPointerLeave={endHold}
                  onPointerCancel={endHold}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{ userSelect: "none", WebkitUserSelect: "none", touchAction: "manipulation" }}
                  aria-label="Quick emotional check-in"
                  className={`bg-destructive/10 text-destructive px-5 text-sm font-medium text-center rounded-lg inline-flex items-center gap-2 min-h-[44px] hover:bg-destructive/20 transition-colors relative overflow-hidden${showQuickActions ? " ring-2 ring-destructive/30" : ""}`}
                >
                  <Heart className="w-4 h-4 relative z-10" />
                  <span className="relative z-10">Quick Check-In</span>
                  {holdProgress > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 bg-destructive/20 pointer-events-none"
                      style={{ width: `${holdProgress}%` }}
                    />
                  )}
                </button>
                <AnimatePresence>
                  {showQuickActions && (
                    <QuickActionsMenu
                      actions={sortedQuickActions}
                      onAction={executeQuickAction}
                      onClose={() => { showQuickActionsRef.current = false; setShowQuickActions(false); }}
                    />
                  )}
                </AnimatePresence>
              </div>
            );
          case "new_features_bar":
            return <NewFeaturesBar key="new_features_bar" />;
          case "quick_nav_menu":
            return <QuickNavMenu key="quick_nav_menu" />;
          case "bulletin_board":
            return (
              <BulletinBoard
                key="bulletin_board"
                alters={alters}
                currentAlterId={currentAlterId}
                frontingAlterIds={frontingAlterIds}
                highlightBulletinId={highlightBulletinId}
              />
            );
          case "upcoming_bottom":
            return <UpcomingPlans key="upcoming_bottom" placement="home_bottom" />;
          default:
            return null;
        }
      })}

      {/* Legal/scope disclaimer — gates everything else on first run.
          TermsSetup waits until the disclaimer is acknowledged. */}
      {showDisclaimer && (
        <DisclaimerModal onAcknowledge={() => setShowDisclaimer(false)} />
      )}

      <TermsSetupModal
        open={showTermsSetup && !showDisclaimer}
        onClose={handleTermsDone}
        existingSettingsId={settings[0]?.id || null} />
      
      <TourModal open={showTour} onClose={handleTourClose} />
      <QuickCheckInModal
        isOpen={showEmotionModal}
        onClose={() => { setShowEmotionModal(false); setEmotionModalInitialSection(null); }}
        alters={alters}
        currentFronterIds={frontingAlterIds}
        initialSection={emotionModalInitialSection} />

    </motion.div>);

}