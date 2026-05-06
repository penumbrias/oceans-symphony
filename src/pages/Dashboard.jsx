import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Bell } from "lucide-react";
import { toast } from "sonner";
import QuickActionsMenu from "@/components/dashboard/QuickActionsMenu";
import CurrentFronters from "@/components/dashboard/CurrentFronters";
import CurrentSymptoms from "@/components/symptoms/CurrentSymptoms";
import NotificationPopups from "@/components/dashboard/NotificationPopups";
import NotificationHistoryModal from "@/components/dashboard/NotificationHistoryModal";
import QuickNavMenu from "@/components/dashboard/QuickNavMenu";
import NewFeaturesBar from "@/components/dashboard/NewFeaturesBar";
import BulletinBoard from "@/components/bulletin/BulletinBoard";
import QuickCheckInModal from "@/components/emotions/QuickCheckInModal";
import TourModal from "@/components/onboarding/TourModal";
import TermsSetupModal from "@/components/onboarding/TermsSetupModal";
import { useTerms } from "@/lib/useTerms";

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [showEmotionModal, setShowEmotionModal] = useState(false);
  const [showNotifHistory, setShowNotifHistory] = useState(false);
  const [highlightBulletinId, setHighlightBulletinId] = useState(null);
  const [showTour, setShowTour] = useState(false);
  const { setShowFeatureTour } = useOutletContext() || {};
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

  const handleNotifClick = (mentionLog) => {
    setShowNotifHistory(false);
    const path = mentionLog.navigate_path || "/";
    if (path === "/" && mentionLog.source_id) {
      setHighlightBulletinId(mentionLog.source_id);
      setTimeout(() => setHighlightBulletinId(null), 5000);
    } else {
      navigate(path);
    }
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

  const { data: mentionLogs = [] } = useQuery({
    queryKey: ["mentionLogs"],
    queryFn: () => base44.entities.MentionLog.list("-created_date", 200)
  });

  // Extract currently active alter IDs from active FrontingSession records
  // Support both new individual model (alter_id) and legacy grouped model (primary_alter_id + co_fronter_ids)
  const activeSessions = sessions.filter((s) => s.is_active);
  let frontingAlterIds = [];
  let currentAlterId = null;

  if (activeSessions.length > 0) {
    // New individual model: each session is one alter
    if (activeSessions[0].alter_id) {
      frontingAlterIds = activeSessions.map((s) => s.alter_id).filter(Boolean);
      // First active session's alter is the "primary"
      currentAlterId = frontingAlterIds[0] || null;
    } else {
      // Legacy grouped model: sessions group multiple alters
      const firstSession = activeSessions[0];
      currentAlterId = firstSession.primary_alter_id || null;
      frontingAlterIds = [firstSession.primary_alter_id, ...(firstSession.co_fronter_ids || [])].filter(Boolean);
    }
  }

  const [emotionModalInitialSection, setEmotionModalInitialSection] = useState(null);
  const [pendingSymptomLog, setPendingSymptomLog] = useState(null);

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
  const [holdProgress, setHoldProgress] = useState(0);
  const [showQuickActions, setShowQuickActions] = useState(false);

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

    const tick = () => {
      if (!holdStartRef.current) return;
      const elapsed = Date.now() - holdStartRef.current;
      const progress = Math.min(100, (elapsed / 1500) * 100);
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

  const endHold = () => {
    if (!holdStartRef.current) return;
    clearTimeout(holdTimerRef.current);
    holdStartRef.current = null;
    setHoldProgress(0);
    if (!timerFiredRef.current && !showQuickActionsRef.current) {
      setShowEmotionModal(true);
    }
  };

  const executeQuickAction = async (action) => {
    showQuickActionsRef.current = false;
    setShowQuickActions(false);
    const now = new Date().toISOString();

    if (action.type === "open_checkin") {
      setEmotionModalInitialSection(null);
      setShowEmotionModal(true);
    } else if (action.type === "open_checkin_section") {
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
    } else if (action.type === "log_activity") {
      const { category_id, duration_minutes } = action.config || {};
      if (!category_id) return;
      const cat = activityCategories.find((c) => c.id === category_id);
      await base44.entities.Activity.create({
        activity_name: cat?.name || "",
        activity_category_ids: [category_id],
        duration_minutes: duration_minutes || null,
        fronting_alter_ids: frontingAlterIds,
        timestamp: now,
      });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      toast.success(`${action.label || cat?.name || "Activity"} logged`);
    } else if (action.type === "log_symptom") {
      const { symptom_id } = action.config || {};
      if (!symptom_id) return;
      setPendingSymptomLog({ symptom_id, label: action.label });
    } else if (action.type === "log_emotion") {
      const { emotion_label, intensity } = action.config || {};
      if (!emotion_label) return;
      await base44.entities.EmotionCheckIn.create({
        timestamp: now,
        emotions: [emotion_label],
        fronting_alter_ids: frontingAlterIds,
        ...(intensity ? { note: `Intensity: ${intensity}/10` } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
      toast.success(`${action.label || emotion_label} logged`);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pt-2 sm:pt-0">
      
      
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground">{systemName}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        <div className="flex items-center gap-1">
        <button
            onClick={() => setShowTour(true)}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
            title="Open guide">
          Guide
        </button>
        <button
            onClick={() => setShowFeatureTour(true)}
            className="text-xs text-primary hover:text-primary/80 px-2 py-1.5 rounded-lg hover:bg-primary/10 transition-colors font-medium"
            title="Interactive feature tour">
          Tour ✨
        </button>
        <button
            onClick={() => setShowNotifHistory(true)}
            aria-label="Notifications"
            className="relative mt-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
            
          <Bell className="w-5 h-5" />
          {mentionLogs.length > 0 &&
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" aria-hidden="true" />
            }
        </button>
        </div>
      </div>

      <CurrentFronters alters={alters} />
      <CurrentSymptoms onOpenCheckIn={(section) => { setEmotionModalInitialSection(section); setShowEmotionModal(true); }} />
      <NotificationHistoryModal
  open={showNotifHistory}
  onClose={() => setShowNotifHistory(false)}
  alters={alters}
  frontingAlterIds={frontingAlterIds}
  onNotifClick={handleNotifClick} />
      
      <div className="relative inline-flex mb-2">
        <button
          data-tour="quick-checkin"
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
          onContextMenu={(e) => e.preventDefault()}
          style={{ userSelect: "none", WebkitUserSelect: "none" }}
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

      <NewFeaturesBar />
      <QuickNavMenu />
      <BulletinBoard alters={alters} currentAlterId={currentAlterId} frontingAlterIds={frontingAlterIds} highlightBulletinId={highlightBulletinId} />

      <TermsSetupModal
        open={showTermsSetup}
        onClose={handleTermsDone}
        existingSettingsId={settings[0]?.id || null} />
      
      <TourModal open={showTour} onClose={handleTourClose} />
      <QuickCheckInModal
        isOpen={showEmotionModal}
        onClose={() => { setShowEmotionModal(false); setEmotionModalInitialSection(null); }}
        alters={alters}
        currentFronterIds={frontingAlterIds}
        initialSection={emotionModalInitialSection} />

      {/* Severity prompt for log_symptom quick actions */}
      <AnimatePresence>
        {pendingSymptomLog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setPendingSymptomLog(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm mx-4 mb-8 bg-card border border-border/50 rounded-2xl p-5 shadow-xl"
            >
              <p className="text-sm font-semibold text-foreground mb-1">{pendingSymptomLog.label}</p>
              <p className="text-xs text-muted-foreground mb-4">How severe? Tap a level or skip.</p>
              <div className="flex gap-2 mb-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={async () => {
                      const ts = new Date().toISOString();
                      await base44.entities.SymptomCheckIn.create({
                        symptom_id: pendingSymptomLog.symptom_id,
                        severity: n,
                        timestamp: ts,
                      });
                      queryClient.invalidateQueries({ queryKey: ["symptomCheckIns"] });
                      toast.success(`${pendingSymptomLog.label} logged (severity ${n})`);
                      setPendingSymptomLog(null);
                    }}
                    className="flex-1 h-11 rounded-xl border border-border/50 bg-muted/30 hover:bg-primary/10 hover:border-primary/50 text-sm font-semibold transition-colors"
                  >
                    {n}
                  </button>
                ))}
              </div>
              <button
                onClick={async () => {
                  const ts = new Date().toISOString();
                  await base44.entities.SymptomCheckIn.create({
                    symptom_id: pendingSymptomLog.symptom_id,
                    severity: null,
                    timestamp: ts,
                  });
                  queryClient.invalidateQueries({ queryKey: ["symptomCheckIns"] });
                  toast.success(`${pendingSymptomLog.label} logged`);
                  setPendingSymptomLog(null);
                }}
                className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors"
              >
                Skip severity
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>);

}