import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, X } from "lucide-react";
import SetFrontModal from "@/components/fronting/SetFrontModal";

const MIGRATION_DISMISSED_KEY = "os_session_migration_done";

// Local implementation of the cloud function "migrateSessionsToIndividual".
// Converts legacy sessions (primary_alter_id + co_fronter_ids) into individual
// per-alter sessions (each with a single alter_id field).
async function runLocalMigration(sessions) {
  for (const session of sessions) {
    if (!session.primary_alter_id || session.alter_id) continue;
    const alters = [session.primary_alter_id, ...(session.co_fronter_ids || [])];
    for (const alterId of alters) {
      await base44.entities.FrontingSession.create({
        alter_id: alterId,
        start_time: session.start_time,
        end_time: session.end_time,
        is_active: session.is_active || false,
        notes: session.notes || "",
      });
    }
    await base44.entities.FrontingSession.delete(session.id);
  }
}

function dismiss(setDone) {
  try { localStorage.setItem(MIGRATION_DISMISSED_KEY, "true"); } catch {}
  setDone(true);
}

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

  // Use a dedicated query key so this scan is never served from the
  // 50-session "frontHistory" cache used by AppLayout. No limit so legacy
  // sessions older than slot 50/100 are still detected.
  const { data: sessions = [] } = useQuery({
    queryKey: ["migrationScan"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time"),
    enabled: !done,
  });

  const legacySessions = sessions.filter(s => s.primary_alter_id && !s.alter_id);

  if (done || legacySessions.length === 0) return null;

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      await runLocalMigration(legacySessions);
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      queryClient.invalidateQueries({ queryKey: ["migrationScan"] });
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      dismiss(setDone);
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
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                <RefreshCw className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-base">Data Format Update</h2>
                <p className="text-xs text-muted-foreground">One-time migration required</p>
              </div>
            </div>
            <button
              onClick={() => dismiss(setDone)}
              disabled={migrating}
              className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mt-0.5"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            Oceans Symphony is updating how fronting history is stored. This is a one-time process that will preserve all your data.
            After migration completes, you'll need to re-set who is currently fronting.
          </p>

          <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p>✓ All fronting history is preserved</p>
            <p>✓ Runs entirely on your device — no cloud needed</p>
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
