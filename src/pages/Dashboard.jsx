import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { base44, localEntities } from "@/api/base44Client";
import { LOCATION_CATEGORIES } from "@/lib/locationCategories";
import { withHighlightParam } from "@/lib/useHighlightScroll";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Inbox, CheckSquare, HelpCircle, Sparkles, Compass } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import QuickActionsMenu from "@/components/dashboard/QuickActionsMenu";
import QuickCheckinButtons from "@/components/dashboard/QuickCheckinButtons";
import ExperimentalDashboard from "@/pages/ExperimentalDashboard";
import BackupHealthNotice from "@/components/dashboard/BackupHealthNotice";
import { EXPERIMENTAL_HOME_ENABLED, UI_V2_ENABLED } from "@/lib/featureFlags";
import HomeV2 from "@/v2/pages/HomeV2";
import SetFrontSheet from "@/components/fronting/SetFrontSheet";
import ClassicHomeCanvas from "@/components/dashboard/ClassicHomeCanvas";
import { Grid2x2 } from "lucide-react";
import CriticalPinnedPlans from "@/components/dashboard/CriticalPinnedPlans";
import UnresolvedPlansCard from "@/components/dashboard/UnresolvedPlansCard";
import StartActivityModal from "@/components/activities/StartActivityModal";
import NotificationHistoryModal from "@/components/dashboard/NotificationHistoryModal";
import NewUiBanner from "@/components/dashboard/NewUiBanner";
import { markQuickActionUsedToday } from "@/lib/dailyTaskSystem";
import QuickTaskComposer from "@/components/bulletin/QuickTaskComposer";
const LazyActivityPlanModal = React.lazy(() => import("@/components/activities/ActivityPlanModal"));
import QuickCheckInModal from "@/components/emotions/QuickCheckInModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SystemSwitcherPanel from "@/components/systems/SystemSwitcherPanel";
import { hasMultipleSystems } from "@/lib/systems";
import DashboardLayoutSettings from "@/components/settings/DashboardLayoutSettings";
import TourModal from "@/components/onboarding/TourModal";
import { loadChecklist, checklistComplete, checklistProgress } from "@/components/onboarding/SetupChecklist";
import { ClipboardList, X } from "lucide-react";

// v0.84.9: terminology moved INTO the Guide (page 2 of the Welcome phase)
// so there's no more blocking pre-Guide modal — first-run is: Guide opens
// with welcome+disclaimer, terms, choose what to track, checklist hub,
// then the rest of the Guide.
// Per-system-scoped since v0.85.6 — this key MUST be read/written through
// psGetItem/psSetItem so a newly-created system starts fresh instead of
// inheriting the first system's "onboarding done" flag.
export const ONBOARDING_DONE_KEY = "symphony_onboarding_done_v1";
export const SETUP_CHIP_DISMISSED_KEY = "symphony_setup_chip_dismissed_v1";
import { psGetItem, psSetItem, psRemoveItem } from "@/lib/perSystemStorage";
import { useTerms } from "@/lib/useTerms";
import { addActiveActivity } from "@/lib/activitySession";
import { startEncounter, endEncounterForContact } from "@/lib/contactEncounters";
import { contactDisplayName } from "@/lib/contacts";
import { ALL_PAGES } from "@/utils/navigationConfig";
import { startSymptomSession } from "@/lib/symptomSessions";

// THE host for the "open-set-front" event — the only listener, whichever
// UI is on. (It used to be v2-only while CurrentFronters also listened;
// with the fronting panel placed on a v2 board both fired, and two sheets
// opened stacked.)
function V2SetFrontHost({ alters }) {
  const [open, setOpen] = useState(false);
  const { data: sessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
    enabled: open,
  });
  useEffect(() => {
    const show = () => setOpen(true);
    const hide = () => setOpen(false);
    window.addEventListener("open-set-front", show);
    window.addEventListener("open-set-front-close", hide);
    return () => {
      window.removeEventListener("open-set-front", show);
      window.removeEventListener("open-set-front-close", hide);
    };
  }, []);
  if (!open) return null;
  return (
    <SetFrontSheet open onClose={() => setOpen(false)} alters={alters}
      currentSession={sessions.find((x) => x.is_primary) || sessions[0] || null} />
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [showEmotionModal, setShowEmotionModal] = useState(false);
  const [showStartActivity, setShowStartActivity] = useState(false);
  // One composer for anything you intend to do. The old quick-task and
  // quick-plan links both land here.
  const [showQuickTask, setShowQuickTask] = useState(false);
  // "More options" on the quick composer: the same thing, continued in the
  // full plan form (repeats, reminders, location, who it's for) with what
  // you already typed carried over.
  const [planDraft, setPlanDraft] = useState(null);
  const [showNotifHistory, setShowNotifHistory] = useState(false);
  const [highlightBulletinId, setHighlightBulletinId] = useState(null);
  const [showTour, setShowTour] = useState(false);
  const [tourOpenAt, setTourOpenAt] = useState(null); // "checklist" when jumped from the setup chip
  const { setShowFeatureTour } = useOutletContext() || {};
  // Setup is now single-flow (v0.84.9): Guide (TourModal) auto-opens
  // for anyone who hasn't finished it, terms+disclaimer live as steps
  // inside it. `pendingFromNewSystem` is a one-shot set by "create new
  // system" — a fresh system's catalogue is empty even though the
  // device-wide gate keys may be satisfied, so it gets the Guide too.
  const [pendingFromNewSystem] = useState(() => {
    try {
      if (localStorage.getItem("symphony_onboarding_pending_v1")) {
        localStorage.removeItem("symphony_onboarding_pending_v1");
        return true;
      }
    } catch { /* storage off */ }
    return false;
  });
  const [checklistState, setChecklistState] = useState(() => loadChecklist());
  const [checklistDismissed, setChecklistDismissed] = useState(() => {
    try { return !!psGetItem(SETUP_CHIP_DISMISSED_KEY); } catch { return false; }
  });
  // Refresh checklist state on tab focus so returning from a sub-flow
  // (e.g. added an alter on /Home) updates the dashboard chip.
  useEffect(() => {
    const refresh = () => setChecklistState(loadChecklist());
    window.addEventListener("focus", refresh);
    window.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  useEffect(() => {
    try {
      const guidedDone = !!psGetItem(ONBOARDING_DONE_KEY);
      const termsDone = !!localStorage.getItem("terms_setup_done");
      // Auto-open the Guide on first-run (nothing set yet) or after a
      // new-system creation. Legacy users (terms already done + guide
      // marked done) never see it — they'll open it via the Guide button.
      if ((!guidedDone && !termsDone) || pendingFromNewSystem) setShowTour(true);
    } catch { /* storage off */ }
  }, [pendingFromNewSystem]);
  const checklistIncomplete = !checklistComplete(checklistState);
  const showSetupChip = checklistIncomplete && !checklistDismissed && !showTour;
  const checklistPct = checklistProgress(checklistState);
  const [showPreview, setShowPreview] = useState(() => localStorage.getItem("preview_open") === "true");



  const handleTogglePreview = () => {
    const newState = !showPreview;
    setShowPreview(newState);
    localStorage.setItem("preview_open", newState ? "true" : "false");
  };

  const handleTourClose = () => {
    // The Guide now IS the setup, so finishing it (or skipping) records
    // that setup is complete. Otherwise closing and re-opening the app
    // would auto-reopen the Guide every time.
    try {
      localStorage.setItem("tour_seen", "1");
      psSetItem(ONBOARDING_DONE_KEY, "1");
    } catch { /* storage off */ }
    setShowTour(false);
    setTourOpenAt(null);
    // Refresh checklist state — user may have marked items done in the guide.
    setChecklistState(loadChecklist());
  };
  const location = useLocation();
  const navigate = useNavigate();
  const [showDashLayout, setShowDashLayout] = useState(false);

  useEffect(() => {
    const open = (e) => {
      // Widgets can ask for a specific section (diary, symptoms, …).
      setEmotionModalInitialSection(e?.detail?.section || null);
      setShowEmotionModal(true);
    };
    const close = () => setShowEmotionModal(false);
    const openLayout = () => setShowDashLayout(true);
    // The UI-v2 status line's notification LED opens the inbox from any
    // register — the modal is hosted here.
    const openNotif = () => setShowNotifHistory(true);
    // The v2 cog menu's "Setup guide" — jumps straight to the checklist
    // step, not the welcome/terms pages (those are for first runs).
    const openGuide = () => { setTourOpenAt("checklist"); setShowTour(true); };
    window.addEventListener("open-quick-checkin", open);
    window.addEventListener("open-quick-checkin-close", close);
    window.addEventListener("symphony-open-dashboard-layout", openLayout);
    window.addEventListener("open-notification-history", openNotif);
    window.addEventListener("open-setup-guide", openGuide);
    return () => {
      window.removeEventListener("open-quick-checkin", open);
      window.removeEventListener("open-quick-checkin-close", close);
      window.removeEventListener("symphony-open-dashboard-layout", openLayout);
      window.removeEventListener("open-notification-history", openNotif);
      window.removeEventListener("open-setup-guide", openGuide);
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
    const onboardingParam = params.get("onboarding");
    if (!action && !onboardingParam) return;
    if (action === "quick-checkin") {
      setShowEmotionModal(true);
    } else if (action === "set-front") {
      window.dispatchEvent(new CustomEvent("open-set-front"));
    } else if (action === "start-activity") {
      // The UI-v2 command strip's capture keys arrive via these params —
      // capture modals are hosted here, so keys navigate-with-param.
      setShowStartActivity(true);
    } else if (action === "start-symptom") {
      setEmotionModalInitialSection("symptoms");
      setShowEmotionModal(true);
    } else if (action === "quick-task" || action === "quick-plan" || action === "quick-thing") {
      setShowQuickTask(true);
    } else if (action === "notifications") {
      setShowNotifHistory(true);
    } else if (action === "setup-guide") {
      setTourOpenAt("checklist");
      setShowTour(true);
    }
    // Settings → About → "Re-run setup" replays the guided onboarding
    // (different alters may want to re-do it — it never overwrites data).
    if (onboardingParam === "replay") {
      // "Re-run setup" reopens the Guide (which is now also the setup
      // flow). The blocking terms wizard only ever runs on a genuinely
      // fresh system, so replay skips it and just reopens the Guide.
      try { psRemoveItem(ONBOARDING_DONE_KEY); } catch { /* storage off */ }
      setShowTour(true);
    }
    params.delete("action");
    params.delete("onboarding");
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
    queryKey: ["frontHistory", "recent50"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 50)
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list()
  });
  const terms = useTerms();
  const systemName = settings[0]?.system_name || `Your ${terms.system}`;
  // Tap the dashboard title to switch systems — only when more than one exists,
  // so single-system users see no change.
  const multiSystem = hasMultipleSystems();
  const [showSystemSwitcher, setShowSystemSwitcher] = useState(false);

  // (dashboard_layout used to be resolved here for the classic column
  // render; ClassicHomeCanvas owns the home layout now via classic_home,
  // with dashboard_layout kept as its seed source.)

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
      // Dedup — a stale/duplicate active session per alter must not list the
      // same fronter twice (drives the "Kane, Kane" authorship glitch).
      frontingAlterIds = [...new Set(activeSessions.map((s) => s.alter_id).filter(Boolean))];
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

  // The v2 frame (apps button / any quick-action key, held) asks for the
  // saved Quick Actions menu through this event — same menu the classic
  // long-press opens.
  useEffect(() => {
    const open = () => { showQuickActionsRef.current = true; setShowQuickActions(true); };
    window.addEventListener("open-quick-actions", open);
    return () => window.removeEventListener("open-quick-actions", open);
  }, []);

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
      // Refetch-before-write: creating unconditionally gave an already-
      // fronting alter a SECOND active row — and the next boot sweep would
      // end the original (older) row, silently dropping their primary flag
      // and resetting "fronting since".
      const activeNow = await base44.entities.FrontingSession.filter({ is_active: true });
      const already = activeNow.find((s) => (s.alter_id || s.primary_alter_id) === alterId);
      if (already) {
        const alterObj = alters.find((a) => a.id === alterId);
        toast.info(`${alterObj?.name || "Alter"} is already ${terms.fronting}`);
        return;
      }
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

      // ONE session write path (lib/symptomSessions) — reuses an active
      // session and folds any pre-fix duplicates instead of stacking more.
      await startSymptomSession(symptom_id, { startTime: now, severity });
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
      // Per-task checkoff time so the Timeline places it at the moment it was
      // ticked (mirrors DailyTasks.toggleManual) — without this, a task checked
      // from the dashboard shortcut stays in the grouped "N done" marker.
      const completion_times = { ...((currentRecord && currentRecord.completion_times) || {}) };
      if (nowCompleted) completion_times[taskId] = new Date().toISOString();
      else delete completion_times[taskId];
      const currentXP = currentRecord?.xp_earned || 0;
      const newXP = nowCompleted
        ? currentXP + (tpl.points || 0)
        : Math.max(0, currentXP - (tpl.points || 0));
      if (currentRecord) {
        await base44.entities.DailyProgress.update(currentRecord.id, {
          completed_task_ids: [...completedIds],
          completion_times,
          xp_earned: newXP,
        });
      } else {
        await base44.entities.DailyProgress.create({
          date: today,
          period_key: today,
          frequency: "daily",
          completed_task_ids: [...completedIds],
          completion_times,
          xp_earned: newXP,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["dailyProgress"] });
      toast.success(
        nowCompleted
          ? (tpl.points > 0 ? `+${tpl.points} XP — ${tpl.title} done! 🎉` : `${tpl.title} done!`)
          : `${tpl.title} unchecked`
      );
    } else if (action.type === "start_activity") {
      // Minimal "start now" flow — no fronting/contact picker, mirrors
      // StartActivityModal's own minimal path via the same primitive.
      const { category_id } = action.config || {};
      if (!category_id) return;
      const cat = activityCategories.find((c) => c.id === category_id);
      addActiveActivity({
        categoryId: category_id,
        name: cat?.name || "Activity",
        color: cat?.color || null,
        startTime: now,
        alterIds: [],
        contactIds: [],
        notes: "",
      });
      toast.success(`▶ Started ${cat?.name || "activity"}`);
    } else if (action.type === "mark_contact_with") {
      const { contact_id } = action.config || {};
      if (!contact_id) return;
      const [activeEncounters, contacts] = await Promise.all([
        base44.entities.ContactEncounter.filter({ is_active: true }),
        base44.entities.Contact.list(),
      ]);
      const contact = contacts.find((c) => c.id === contact_id);
      const name = contact ? contactDisplayName(contact) : "contact";
      const existing = activeEncounters.find((e) => e.contact_id === contact_id);
      if (existing) {
        await endEncounterForContact(contact_id);
        toast.success(`Ended time with ${name}`);
      } else {
        await startEncounter(contact_id);
        toast.success(`Marked with ${name}`);
      }
      queryClient.invalidateQueries({ queryKey: ["contactEncounters"] });
    } else if (action.type === "toggle_sleep") {
      const sleepRecords = await base44.entities.Sleep.list();
      const inProgress = [...sleepRecords]
        .filter((s) => s.bedtime && !s.wake_time)
        .sort((a, b) => new Date(b.bedtime) - new Date(a.bedtime))[0] || null;
      if (inProgress) {
        // Minimal end — no quality/notes prompt (that's what SleepEndModal
        // is for). Matches the "no picker, one tap" spirit of quick actions.
        await base44.entities.Sleep.update(inProgress.id, { wake_time: now });
        toast.success("😴 Sleep ended");
      } else {
        await base44.entities.Sleep.create({
          date: format(new Date(), "yyyy-MM-dd"),
          bedtime: now,
        });
        toast.success("💤 Sleep started");
      }
      queryClient.invalidateQueries({ queryKey: ["sleep"] });
    } else if (action.type === "set_status_note") {
      // OS-launcher shortcut path has no extraData to prompt with — pop the
      // in-app sheet instead, same fallback log_location already uses.
      if (!extraData || extraData.text === undefined) {
        showQuickActionsRef.current = true;
        setShowQuickActions(true);
        return;
      }
      const text = (extraData.text || "").trim();
      if (!text) return;
      // StatusNote is an immutable log — always create, never update.
      await localEntities.StatusNote.create({ timestamp: now, note: text });
      queryClient.invalidateQueries({ queryKey: ["statusNotes"] });
      toast.success("Status posted");
    } else if (action.type === "add_task") {
      if (!extraData || extraData.title === undefined) {
        showQuickActionsRef.current = true;
        setShowQuickActions(true);
        return;
      }
      const title = (extraData.title || "").trim();
      if (!title) return;
      await base44.entities.Task.create({ title, completed: false, priority: "medium" });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("To-do added");
    } else if (action.type === "navigate_to_page") {
      const page = ALL_PAGES.find((p) => p.id === action.config?.page_id);
      if (page) navigate(page.path);
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

  // ── Experimental homescreen (v0.90.0, Phase 1) ──────────────────
  // The flag lives on SystemSettings.experimental_home so it's synced,
  // backed up, and preset-able. This component's hooks all run in both
  // modes (branching happens in JSX only), so deep links / quick actions
  // keep working regardless of which homescreen is active.
  // EXPERIMENTAL_HOME_ENABLED gates the whole feature at build time. When
  // false, anyone who previously enabled it falls back to the classic
  // dashboard (their saved layout is untouched and returns if re-enabled).
  const uiV2On = UI_V2_ENABLED && settings[0]?.ui_v2?.enabled === true;
  const experimentalOn = !uiV2On && EXPERIMENTAL_HOME_ENABLED && settings[0]?.experimental_home?.enabled === true;

  // ── The widget board as a swipe-left page of the CLASSIC home ──
  // Classic home is the leftmost "page"; swiping left (or the board
  // button in the header) opens the SAME v2 board (ui_v2_home fields —
  // nothing is migrated or duplicated). Swiping right past the board's
  // first page comes back. ui_v2.homeDefault === "board" opens on the
  // board instead, so board-as-homescreen stays one setting away.
  const classicBoardAvailable = UI_V2_ENABLED && !uiV2On && !experimentalOn && !!settings[0];
  const [boardOpen, setBoardOpen] = useState(false);
  // Which way the last classic↔board move went (1 = into the board,
  // -1 = back out, 0 = no move yet) — drives the same slide-in the board
  // uses between its own pages, so the transition feels like paging, not
  // a hard cut. A ref: it's read at the mount the state flip causes.
  const boardAnimDir = useRef(0);
  const openBoard = () => { boardAnimDir.current = 1; setBoardOpen(true); };
  const closeBoard = () => { boardAnimDir.current = -1; setBoardOpen(false); };
  // The classic home renders ON the board canvas (ClassicHomeCanvas):
  // its edit mode, drawer and gestures ARE the widget board's, scoped to
  // the "os-classic" events — no separate editor lives here any more.
  // The HOME button means the CLASSIC home (owner call) — unless a board
  // page has "overwrite as homescreen" on (ui_v2.homeDefault === "board"),
  // in which case Home lands on the board. Every navigation gets a fresh
  // location.key, including same-path ones, so this catches a Home tap
  // while already on "/" without touching each button.
  const lastLocKey = useRef(location.key);
  useEffect(() => {
    if (location.key === lastLocKey.current) return;
    lastLocKey.current = location.key;
    if (settings[0]?.ui_v2?.homeDefault === "board") {
      if (!boardOpen && classicBoardAvailable) openBoard();
    } else if (boardOpen) {
      closeBoard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);
  const boardShowing = classicBoardAvailable && boardOpen;
  const showClassic = !uiV2On && !experimentalOn && !boardShowing;
  const bootedBoardDefault = useRef(false);
  useEffect(() => {
    if (bootedBoardDefault.current || !classicBoardAvailable) return;
    bootedBoardDefault.current = true;
    if (settings[0]?.ui_v2?.homeDefault === "board") setBoardOpen(true);
  }, [classicBoardAvailable, settings]);
  // The swipe-left-to-board gesture lives on the canvas now (the classic
  // home is an ExperimentalDashboard with onExitRight={openBoard}), so
  // it tracks and animates exactly like paging between board pages.
  // The board's own header/menu actions can be requested while CLASSIC is
  // showing (the hosted top bar's "Edit widget board", the promo banner,
  // a pending key set on another page). Bridge them: park the action as
  // the board's pending key, open the board, and it picks the action up
  // on mount — exactly as if it had been open all along.
  useEffect(() => {
    if (!classicBoardAvailable || boardOpen) return undefined;
    try {
      const pending = ["edit-home", "open-apps", "home-settings", "bar-options"]
        .some((a) => sessionStorage.getItem(`symphony_v2_${a}`) === "1");
      if (pending) { openBoard(); return undefined; }
    } catch { /* storage off */ }
    const mk = (action) => () => {
      try { sessionStorage.setItem(`symphony_v2_${action}`, "1"); } catch { /* storage off */ }
      openBoard();
    };
    const onEdit = mk("edit-home");
    const onApps = mk("open-apps");
    const onHomeSettings = mk("home-settings");
    const onOpenBoard = () => { openBoard(); };
    window.addEventListener("os-v2-edit-home", onEdit);
    window.addEventListener("os-v2-open-apps", onApps);
    window.addEventListener("os-v2-home-settings", onHomeSettings);
    window.addEventListener("os-open-widget-board", onOpenBoard);
    return () => {
      window.removeEventListener("os-v2-edit-home", onEdit);
      window.removeEventListener("os-v2-open-apps", onApps);
      window.removeEventListener("os-v2-home-settings", onHomeSettings);
      window.removeEventListener("os-open-widget-board", onOpenBoard);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classicBoardAvailable, boardOpen]);
  const hasUnreadMentions = mentionLogs.some(m =>
    m.log_type !== "authored" &&
    (m.mentioned_alter_id || m.alter_id) &&
    frontingAlterIds.includes(m.mentioned_alter_id || m.alter_id) &&
    !(m.dismissed_by_alter_ids || []).includes(m.mentioned_alter_id || m.alter_id) &&
    m.is_read !== true
  );

  // Handler/data bundle handed to the experimental view + its widgets, so
  // chrome widgets and the action bar reuse Dashboard's plumbing (the
  // modals they open are all hosted below in this component).
  const homeApi = {
    systemName,
    multiSystem,
    openSystemSwitcher: () => setShowSystemSwitcher(true),
    openTour: () => setShowTour(true),
    openNotifHistory: () => setShowNotifHistory(true),
    checklistIncomplete,
    hasUnreadMentions,
    alters,
    currentAlterId,
    frontingAlterIds,
    highlightBulletinId,
    hold: { onPointerDown: startHold, onPointerMove: moveHold, onPointerUp: endHold },
    holdProgress,
    holdActive: showQuickActions,
    quickOn: {
      startActivity: () => setShowStartActivity(true),
      startSymptom: () => { setEmotionModalInitialSection("symptoms"); setShowEmotionModal(true); },
      quickTask: () => setShowQuickTask(true),
      quickPlan: () => setShowQuickTask(true),
      quickThing: () => setShowQuickTask(true),
    },
    // In v2 the menu is hosted at page level (below) instead of inside the
    // quick-checkin widget — that widget may not be on the board at all,
    // which is why the new UI had no way to reach saved quick actions.
    quickActionsSlot: uiV2On ? null : (
      <AnimatePresence>
        {showQuickActions && (
          <QuickActionsMenu
            actions={sortedQuickActions}
            onAction={executeQuickAction}
            onClose={() => { showQuickActionsRef.current = false; setShowQuickActions(false); }}
          />
        )}
      </AnimatePresence>
    ),
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pt-0 sm:pt-0">

      {/* Saved Quick Actions in the new UI — opened by holding the apps
          button or any quick-action key. The menu anchors below this
          zero-height rail; the rail itself lets taps through so tapping
          away still closes it and still reaches the page. */}
      {uiV2On && (
        <AnimatePresence>
          {showQuickActions && (
            <div className="fixed inset-x-0 z-[120] pointer-events-none"
              style={{ top: "calc(var(--v2-status-h, 40px) + env(safe-area-inset-top, 0px) + 8px)" }}>
              <div className="relative mx-auto w-[min(20rem,calc(100vw-1.5rem))] pointer-events-auto">
                <QuickActionsMenu
                  actions={sortedQuickActions}
                  onAction={executeQuickAction}
                  onClose={() => { showQuickActionsRef.current = false; setShowQuickActions(false); }}
                />
              </div>
            </div>
          )}
        </AnimatePresence>
      )}

      {/* The system heading (name + date/time) is a WIDGET on the canvas
          now (system_header — seeded first, configurable like any other
          card); this row keeps only the page chrome buttons. The system
          switcher dialog stays mounted here — the widget opens it via
          api.openSystemSwitcher. */}
      <Dialog open={showSystemSwitcher} onOpenChange={setShowSystemSwitcher}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{terms.Systems}</DialogTitle>
          </DialogHeader>
          <SystemSwitcherPanel />
        </DialogContent>
      </Dialog>
      {showClassic && (
      <div className="mb-1 flex items-start justify-end">
        <div className="flex items-center gap-1">
        {/* The widget board lives one swipe left of here — this button is
            the mouse/desktop way in (and the discoverable one). */}
        {classicBoardAvailable && (
          <button
            type="button"
            onClick={openBoard}
            title="Open the widget board (or swipe left)"
            aria-label="Open the widget board"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <Grid2x2 className="w-4 h-4" />
          </button>
        )}
        {/* v0.86.8: unified "help" button — the old side-by-side Setup /
            Tour pills were too close together and touch-crowded (tester
            report). One minimal icon opens a dropdown with the two
            options; the small primary dot at top-right signals that
            setup is still incomplete without needing a second visible
            surface. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Guide & tour"
              title="Guide & tour"
              className="relative min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              <HelpCircle className="w-5 h-5" />
              {checklistIncomplete && (
                <span
                  aria-hidden="true"
                  title="Setup isn't finished"
                  className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary"
                />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => setShowTour(true)} className="gap-2 cursor-pointer">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="flex-1">Setup guide</span>
              {checklistIncomplete && (
                <span className="text-[0.6875rem] text-primary font-medium">In progress</span>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowFeatureTour(true)} className="gap-2 cursor-pointer">
              <Compass className="w-4 h-4 text-muted-foreground" />
              <span className="flex-1">Feature tour</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
      )}

      {/* Critical/unresolved plans + the notification modal are SHARED
          between the classic and experimental views — safety surfaces
          shouldn't depend on which homescreen is active. Under v2 the
          board's own notice stack (V2Notices) carries both, inside the
          board's stacking context where the wallpaper can't cover them —
          these classic cards sit outside it and would render invisibly
          under the wallpaper. */}
      {/* The v2 board carries these in its own V2Notices stack — hide the
          classic overlays while the board page is showing too. */}
      {!uiV2On && !boardShowing && <BackupHealthNotice className="mb-3" />}
      {!uiV2On && !boardShowing && <CriticalPinnedPlans />}
      {!uiV2On && !boardShowing && <UnresolvedPlansCard />}
      <NotificationHistoryModal
        open={showNotifHistory}
        onClose={() => setShowNotifHistory(false)}
        alters={alters}
        frontingAlterIds={frontingAlterIds}
        onNotifClick={handleNotifClick}
      />

      {/* ── UI v2 Home (rebuilt from the function tree) ── */}
      {uiV2On && <HomeV2 settingsRow={settings[0] || null} api={homeApi} />}

      {/* The widget board as the classic home's swipe-left page — the
          SAME board, same saved layout; swiping right past its first
          page (or a board's own exit) returns to classic. */}
      {boardShowing && (
        <motion.div
          key="classic-board"
          // The SAME slide the board uses between its own pages, so
          // entering it from classic feels like paging, not a hard cut.
          initial={boardAnimDir.current === 0 ? false : { x: 72, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <HomeV2 settingsRow={settings[0] || null} api={homeApi} onExitLeft={closeBoard} />
        </motion.div>
      )}
      <V2SetFrontHost alters={alters} />

      {/* ── Experimental phone-like homescreen (opt-in) ── */}
      {experimentalOn && (
        <ExperimentalDashboard settingsRow={settings[0] || null} api={homeApi} />
      )}

      {/* The classic home ON the board canvas — same component, edit
          mode, drawer and gestures as the widget board, editing its own
          classic_home layout (seeded once from dashboard_layout). Swiping
          left past its last page slides onto the widget board. */}
      {showClassic && (
      <motion.div
        // Sliding back FROM the board mirrors the board's own page slide;
        // a plain first load (dir 0) doesn't animate.
        initial={boardAnimDir.current === -1 ? { x: -72, opacity: 0 } : false}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}>
        <div className="mb-3">
          <NewUiBanner onOpenBoard={classicBoardAvailable ? openBoard : null} />
        </div>
        <ClassicHomeCanvas
          settingsRow={settings[0] || null}
          api={homeApi}
          onOpenBoard={classicBoardAvailable ? openBoard : null}
        />
      </motion.div>
      )}

      {/* v0.84.9: no more blocking terms modal — the Guide (below)
          includes terms as an inline step. A small "Continue setup"
          chip appears here when the checklist is incomplete, so the
          user can jump back into the Guide's checklist hub any time. */}
      {showSetupChip && createPortal(
        <div
          // Clears the bottom tab bar. Two fixes (v0.96.1): the calc needs
          // Tailwind underscores — without them it emits `calc(56px+16px)`,
          // which is invalid CSS and drops the rule — and the desktop
          // override must be `lg:`, not `sm:`: the tab bar is `lg:hidden`,
          // so between 640–1023px it is still on screen and a `sm:bottom-4`
          // chip lands underneath it.
          className="os-setup-chip fixed z-[85] bottom-[calc(var(--bottom-nav-height,56px)_+_16px_+_var(--os-sab))] left-3 right-3 sm:left-auto sm:right-4 sm:max-w-xs lg:bottom-4"
          // v2 chrome: the measured bottom bar + the floating quick-action
          // card publish their heights — the chip sits ABOVE both instead
          // of covering them (owner report). Inline so it wins the class.
          style={uiV2On ? { bottom: "calc(var(--v2-bottom-chrome-h, 56px) + var(--v2-qa-float-bottom-h, 0px) + 16px + var(--os-sab))" } : undefined}
          role="status"
          aria-label="Continue setup"
        >
          <div className="bg-card border border-primary/40 rounded-xl shadow-2xl p-3 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold">Continue setup</p>
              <p className="text-[0.6875rem] text-muted-foreground">{checklistPct.done} of {checklistPct.total} items done</p>
            </div>
            <button
              type="button"
              onClick={() => { setTourOpenAt("checklist"); setShowTour(true); }}
              className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
            >
              Open
            </button>
            <button
              type="button"
              onClick={() => {
                try { psSetItem(SETUP_CHIP_DISMISSED_KEY, "1"); } catch { /* storage off */ }
                setChecklistDismissed(true);
              }}
              aria-label="Dismiss"
              className="p-1 rounded-lg text-muted-foreground hover:bg-muted/50"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>,
        document.body
      )}

      <TourModal open={showTour} onClose={handleTourClose} openAt={tourOpenAt} />
      <QuickCheckInModal
        isOpen={showEmotionModal}
        onClose={() => { setShowEmotionModal(false); setEmotionModalInitialSection(null); }}
        alters={alters}
        currentFronterIds={frontingAlterIds}
        initialSection={emotionModalInitialSection} />

      {showStartActivity && (
        <StartActivityModal
          isOpen
          onClose={() => setShowStartActivity(false)}
          alters={alters}
        />
      )}
      <Dialog open={showQuickTask} onOpenChange={(v) => !v && setShowQuickTask(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <CheckSquare className="w-4 h-4" /> Add something to do
            </DialogTitle>
          </DialogHeader>
          <QuickTaskComposer
            frontingAlterIds={frontingAlterIds}
            onSaved={() => setShowQuickTask(false)}
            hideCancelButton
            moreOptions={(draft) => { setShowQuickTask(false); setPlanDraft(draft); }}
          />
        </DialogContent>
      </Dialog>


      {planDraft && (
        <React.Suspense fallback={null}>
          <LazyActivityPlanModal
            isOpen
            onClose={() => setPlanDraft(null)}
            startDate={planDraft.date ? new Date(`${planDraft.date}T00:00:00`) : new Date()}
            endDate={planDraft.date ? new Date(`${planDraft.date}T00:00:00`) : new Date()}
            startHour={planDraft.time ? parseInt(planDraft.time.split(":")[0], 10) : undefined}
            startMinute={planDraft.time ? parseInt(planDraft.time.split(":")[1], 10) : 0}
            endHour={planDraft.time && planDraft.durationMinutes
              ? parseInt(planDraft.time.split(":")[0], 10) + Math.floor(planDraft.durationMinutes / 60)
              : undefined}
            endMinute={0}
            initialTitle={planDraft.title || ""}
            initialNotes={planDraft.note || ""}
            alters={alters}
            onSave={() => setPlanDraft(null)}
          />
        </React.Suspense>
      )}

      {/* "Customize dashboard" (header cog) → the section drag/drop layout
          editor in a popup. Reuses the exact component from Settings →
          Appearance → Layout → Dashboard. */}
      <Dialog open={showDashLayout} onOpenChange={setShowDashLayout}>
        <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customize dashboard</DialogTitle>
          </DialogHeader>
          <DashboardLayoutSettings />
        </DialogContent>
      </Dialog>

    </motion.div>);

}