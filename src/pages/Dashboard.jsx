import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { Heart, Bell } from "lucide-react";
import CurrentFronters from "@/components/dashboard/CurrentFronters";
import CurrentSymptoms from "@/components/symptoms/CurrentSymptoms";
import NotificationPopups from "@/components/dashboard/NotificationPopups";
import NotificationHistoryModal from "@/components/dashboard/NotificationHistoryModal";
import QuickNavMenu from "@/components/dashboard/QuickNavMenu";
import NewFeaturesBar from "@/components/dashboard/NewFeaturesBar";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
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
    const bid = location.state?.highlightBulletinId;
    if (bid) {
      setHighlightBulletinId(bid);
      setTimeout(() => setHighlightBulletinId(null), 3000);
      window.history.replaceState({}, "");
    }
  }, [location.state]);

  const handleNotifClick = (mentionLog) => {
    setShowNotifHistory(false);
    const path = mentionLog.navigate_path || "/";
    if (path === "/" && mentionLog.source_id) {
      setHighlightBulletinId(mentionLog.source_id);
      setTimeout(() => setHighlightBulletinId(null), 3000);
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

  const activeSession = sessions.find((s) => s.is_active);
  const currentAlterId = activeSession?.primary_alter_id || null;

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list()
  });
  const terms = useTerms();
  const systemName = settings[0]?.system_name || `Your ${terms.system}`;
  const dashboardGridItems = settings[0]?.navigation_config?.dashboardGrid || ["alters", "checkin", "activities", "analytics", "therapy-report", "support"];

  const { data: mentionLogs = [] } = useQuery({
    queryKey: ["mentionLogs"],
    queryFn: () => base44.entities.MentionLog.list("-created_date", 200)
  });

  const frontingAlterIds = activeSession ?
  [activeSession.primary_alter_id, ...(activeSession.co_fronter_ids || [])].filter(Boolean) :
  [];

  const [emotionModalInitialSection, setEmotionModalInitialSection] = useState(null);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      
      
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground">{systemName}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm text-center">Welcome home 💜</p>
        </div>
        <div className="flex items-center gap-1">
        <button
            onClick={() => setShowTour(true)}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors"
            title="Open guide">
            
          Guide
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
      
      
      <button
        onClick={() => setShowEmotionModal(true)}
        aria-label="Quick emotional check-in" className="bg-destructive/10 text-destructive mb-2 px-5 text-sm font-medium text-center rounded-lg inline-flex items-center gap-2 min-h-[44px] hover:bg-destructive/20 transition-colors">
        
        
        <Heart className="w-4 h-4" />
        Quick Check-In
      </button>

      <DashboardGrid visibleItems={dashboardGridItems} />

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
        currentFronterIds={activeSession ? [activeSession.primary_alter_id, ...(activeSession.co_fronter_ids || [])] : []}
        initialSection={emotionModalInitialSection} />
      
    </motion.div>);

}