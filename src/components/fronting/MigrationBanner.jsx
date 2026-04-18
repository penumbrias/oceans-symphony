import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";
import SetFrontModal from "@/components/fronting/SetFrontModal";

const MIGRATION_DISMISSED_KEY = "os_session_migration_done";

export default function MigrationBanner() {
  const queryClient = useQueryClient();
  const [migrating, setMigrating] = useState(false);
  const [done, setDone] = useState(() => {
    try { return localStorage.getItem(MIGRATION_DISMISSED_KEY) === "true"; } catch { return false; }
  });
  const [showSetFront, setShowSetFront] = useState(false);

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
    enabled: !done,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 100),
    enabled: !done,
  });

  // Check if any legacy sessions exist
  const hasLegacy = sessions.some(s => s.primary_alter_id && !s.alter_id);

  if (done || !hasLegacy) return null;

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      await base44.functions.invoke("migrateSessionsToIndividual", {});
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      localStorage.setItem(MIGRATION_DISMISSED_KEY, "true");
      setDone(true);
      setShowSetFront(true);
    } catch (e) {
      alert("Migration failed: " + (e.message || "Unknown error. Please try again."));
    } finally {
      setMigrating(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4">
        <div className="bg-background border-2 border-border rounded-2xl p-6 space-y-4 max-w-md w-full shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Data Format Update</h2>
              <p className="text-xs text-muted-foreground">One-time migration required</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            Oceans-Symphony is updating how fronting history is stored. This is a one-time process that will preserve all your data.
            After migration completes, you'll need to re-set who is currently fronting.
          </p>

          <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p>✓ All fronting history is preserved</p>
            <p>✓ Notes are migrated to Emotion Check-Ins</p>
            <p>✓ This takes only a moment</p>
          </div>

          <Button
            onClick={handleMigrate}
            disabled={migrating}
            className="w-full bg-primary hover:bg-primary/90"
          >
            {migrating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Migrating data...</>
            ) : (
              "Update & Continue"
            )}
          </Button>
        </div>
      </div>

      {showSetFront && (
        <SetFrontModal
          open={showSetFront}
          onClose={() => setShowSetFront(false)}
          alters={alters}
          currentSession={null}
        />
      )}
    </>
  );
}