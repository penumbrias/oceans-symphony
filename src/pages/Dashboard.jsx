import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import CurrentFronters from "@/components/dashboard/CurrentFronters";
import QuickNavMenu from "@/components/dashboard/QuickNavMenu";
import BulletinBoard from "@/components/bulletin/BulletinBoard";

export default function Dashboard() {
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
      <QuickNavMenu />
      <BulletinBoard alters={alters} currentAlterId={currentAlterId} />
    </motion.div>
  );
}