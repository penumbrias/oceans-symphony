import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import CurrentFronters from "@/components/dashboard/CurrentFronters";
import QuickNavMenu from "@/components/dashboard/QuickNavMenu";
import BulletinBoard from "@/components/bulletin/BulletinBoard";
import TaskWidget from "@/components/dashboard/TaskWidget";
import EmotionCheckInModal from "@/components/emotions/EmotionCheckInModal";

export default function Dashboard() {
  const [showEmotionModal, setShowEmotionModal] = useState(false);

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 50),
  });

  const activeSession = sessions.find((s) => s.is_active);
  const currentAlterId = activeSession?.primary_alter_id || null;

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const systemName = settings[0]?.system_name || "Your System";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="mb-5">
        <h1 className="font-display text-3xl font-semibold text-foreground">{systemName}</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Welcome home 💜</p>
      </div>

      <CurrentFronters alters={alters} />
      
      <button
        onClick={() => setShowEmotionModal(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors font-medium text-sm mb-4"
      >
        <Heart className="w-4 h-4" />
        Quick Emotion Check-In
      </button>

      <QuickNavMenu />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2">
          <BulletinBoard alters={alters} currentAlterId={currentAlterId} />
        </div>
        <TaskWidget />
      </div>

      <EmotionCheckInModal 
        isOpen={showEmotionModal} 
        onClose={() => setShowEmotionModal(false)} 
        alters={alters}
        currentFronterIds={activeSession ? [activeSession.primary_alter_id, ...(activeSession.co_fronter_ids || [])] : []}
      />
    </motion.div>
  );
}