import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Users, Sparkles, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import AlterGrid from "@/components/alters/AlterGrid";
import FrontingBar from "@/components/fronting/FrontingBar";
import AlterEditModal from "@/components/alters/AlterEditModal";

export default function Home() {
  const { data: alters = [], isLoading: altersLoading } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });

  const systemSettings = settings[0] || null;
  const isConnected = !!systemSettings?.sp_token;

  const { data: fronters, isLoading: frontersLoading } = useFronters(
    systemSettings?.sp_token,
    systemSettings?.sp_system_id
  );

  const activeAlters = alters.filter((a) => !a.is_archived);
  const archivedAlters = alters.filter((a) => a.is_archived);

  if (altersLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!isConnected && activeAlters.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-24 text-center"
      >
        <div className="w-20 h-20 rounded-3xl bg-primary/5 flex items-center justify-center mb-6">
          <Sparkles className="w-9 h-9 text-primary/40" />
        </div>
        <h1 className="font-display text-3xl font-semibold text-foreground mb-2">
          Welcome to Innerworld
        </h1>
        <p className="text-muted-foreground max-w-md leading-relaxed mb-8">
          Connect your Simply Plural account to import your system members and get started.
        </p>
        <Link to="/settings">
          <Button className="bg-primary hover:bg-primary/90 rounded-xl px-6">
            Connect Simply Plural
          </Button>
        </Link>
      </motion.div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="font-display text-3xl font-semibold text-foreground">
          {systemSettings?.system_name ? `${systemSettings.system_name}` : "Your System"}
        </h1>
        <p className="text-muted-foreground mt-1 flex items-center gap-2">
          <Users className="w-4 h-4" />
          {activeAlters.length} active member{activeAlters.length !== 1 && "s"}
          {archivedAlters.length > 0 && (
            <span className="text-muted-foreground/60">· {archivedAlters.length} archived</span>
          )}
        </p>
      </motion.div>

      {isConnected && (
        <FrontersSection
          fronters={fronters}
          alters={activeAlters}
          isLoading={frontersLoading}
        />
      )}

      <AlterGrid alters={activeAlters} />
    </div>
  );
}