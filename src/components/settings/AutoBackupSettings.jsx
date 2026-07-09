import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download, ShieldAlert, Bell, Zap } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AUTO_BACKUP_INTERVALS,
  getAutoBackupInterval,
  setAutoBackupInterval,
  getAutoBackupLastAt,
  getAutoBackupMode,
  setAutoBackupMode,
  BACKUP_MODES,
  getBackupDestination,
  setBackupDestination,
  BACKUP_DESTINATIONS,
  runAutoBackupNow,
} from "@/lib/autoBackup";
import { reconcileNativeBackupReminder } from "@/lib/nativeBackupScheduler";
import { isNative } from "@/lib/platform";
import PersistentStorageStatus from "./PersistentStorageStatus";

const NATIVE = isNative();

/**
 * Auto-Backup settings panel. Three pieces:
 *   1. Interval picker (Off / Daily / Weekly / Every 2 weeks / Monthly).
 *      On app boot, if "now − last >= interval" the app silently writes
 *      a JSON dump to the device's Downloads folder.
 *   2. "Back up now" button for an immediate manual write.
 *   3. Storage persistence status — surfaces the browser's verdict on
 *      whether our data is eviction-resistant and offers a re-request
 *      button when it isn't.
 */
export default function AutoBackupSettings() {
  const [interval, setIntervalState] = useState(0);
  const [mode, setModeState] = useState(BACKUP_MODES.OFF);
  const [destination, setDestinationState] = useState(BACKUP_DESTINATIONS.ASK);
  const [lastAt, setLastAt] = useState(null);
  const [running, setRunning] = useState(false);

  // Initial read of state from localStorage + browser.
  useEffect(() => {
    setIntervalState(getAutoBackupInterval());
    setModeState(getAutoBackupMode());
    setDestinationState(getBackupDestination());
    setLastAt(getAutoBackupLastAt());
  }, []);

  const handleDestinationChange = (next) => {
    if (![BACKUP_DESTINATIONS.DOCUMENTS, BACKUP_DESTINATIONS.ASK].includes(next)) return;
    setDestinationState(next);
    setBackupDestination(next);
  };

  const handleIntervalChange = (val) => {
    const v = parseInt(val, 10);
    setIntervalState(v);
    setAutoBackupInterval(v);
    // If switching to 0 (Off), force the mode off so we stop nagging.
    if (v === 0) {
      setModeState(BACKUP_MODES.OFF);
      setAutoBackupMode(BACKUP_MODES.OFF);
    }
    // Re-arm the native backup reminder against the new interval.
    if (NATIVE) reconcileNativeBackupReminder().catch(() => {});
  };

  const handleModeChange = (next) => {
    // Web can't deliver REMINDER mode (no scheduled OS notifications),
    // so reject the click defensively even though the UI hides it.
    if (next === BACKUP_MODES.REMINDER && !NATIVE) return;
    setModeState(next);
    setAutoBackupMode(next);
    // Picking a real mode without an interval = no actual schedule.
    // Auto-pick a sensible default so the user isn't surprised.
    if (next !== BACKUP_MODES.OFF && interval === 0) {
      setIntervalState(7);
      setAutoBackupInterval(7);
    }
    if (NATIVE) reconcileNativeBackupReminder().catch(() => {});
  };

  const handleRunNow = async () => {
    setRunning(true);
    try {
      await runAutoBackupNow();
      setLastAt(getAutoBackupLastAt());
    } catch (e) {
      toast.error(e?.message || "Backup failed");
    } finally {
      setRunning(false);
    }
  };

  const lastLabel = lastAt
    ? (() => { try { return format(new Date(lastAt), "MMM d, yyyy 'at' h:mm a"); } catch { return lastAt; } })()
    : "never";

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Download className="w-4 h-4 text-primary" /> Auto-backup
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Writes a full backup of your data to your device on a schedule. The destination is outside the app's sandbox, so a backup file there survives "Clear app data", device-cleaner apps, app reinstalls, and most storage-loss scenarios.
        </p>
      </div>

      {/* Mode picker */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground block">Backup mode</label>
        <div className="grid gap-1.5">
          <ModeCard
            id={BACKUP_MODES.OFF}
            active={mode === BACKUP_MODES.OFF}
            onClick={() => handleModeChange(BACKUP_MODES.OFF)}
            title="Off"
            body="No scheduled backups. You can still use Back up now below at any time."
          />
          <ModeCard
            id={BACKUP_MODES.AUTO}
            active={mode === BACKUP_MODES.AUTO}
            onClick={() => handleModeChange(BACKUP_MODES.AUTO)}
            icon={Zap}
            title={NATIVE ? "Back up automatically" : "Back up automatically (limited)"}
            body={NATIVE
              ? "Silent. When you open the app and a backup is due, it writes straight to your device's Documents folder — no prompts, no chooser."
              : "When you open the app and a backup is due, the system share sheet pops up so you can save the file. Truly automatic background backups need the native Android app — browsers and PWAs can't run on a clock."}
          />
          {NATIVE ? (
            <ModeCard
              id={BACKUP_MODES.REMINDER}
              active={mode === BACKUP_MODES.REMINDER}
              onClick={() => handleModeChange(BACKUP_MODES.REMINDER)}
              icon={Bell}
              title="Notify me to back up"
              body="The OS notifies you at your chosen interval. Tap the notification and the app runs the backup automatically. Useful if you'd rather see explicit confirmation than have it slip into the Documents folder silently."
            />
          ) : (
            <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5 flex items-start gap-2 opacity-70">
              <Bell className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Notify me to back up <span className="ml-1 text-[0.625rem] uppercase tracking-wider text-muted-foreground font-semibold">Native only</span></p>
                <p className="text-[0.6875rem] text-muted-foreground mt-0.5">
                  Available in the Android native app. Sends a system notification at your chosen interval — tap it to run the backup. Web browsers and TWAs can't schedule notifications when the page isn't open.
                </p>
              </div>
            </div>
          )}
        </div>
        {!NATIVE && (mode === BACKUP_MODES.AUTO) && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 flex items-start gap-2">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-[0.6875rem] text-foreground leading-relaxed">
              On web / TWA, backups only run when you open the app — the browser can't run scheduled tasks. If you don't open Symphony for a stretch, no backups happen during that gap. Open at least as often as your interval, or hit "Back up now" before a long break.
            </p>
          </div>
        )}
      </div>

      <div className={`space-y-2 ${mode === BACKUP_MODES.OFF ? "opacity-50 pointer-events-none" : ""}`}>
        <label className="text-xs font-medium text-muted-foreground block">Schedule</label>
        <div className="flex flex-wrap gap-1.5">
          {AUTO_BACKUP_INTERVALS.filter(o => o.value > 0).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleIntervalChange(opt.value)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                interval === opt.value
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/40 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[0.6875rem] text-muted-foreground">
          Last backup: <span className="text-foreground">{lastLabel}</span>
        </p>
      </div>

      <div>
        <Button onClick={handleRunNow} disabled={running} variant="outline" size="sm" className="gap-1.5">
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {running ? "Backing up…" : "Back up now"}
        </Button>
      </div>

      {/* On native, the backup-destination picker is the actual
          user-meaningful control on this platform — the persistence
          status still renders below it (PersistentStorageStatus handles
          the native/web difference internally). */}
      {NATIVE && (
        <div className="border-t border-border/30 pt-3 space-y-2">
          <label className="text-xs font-medium text-muted-foreground block">Backup destination</label>
          <div className="grid gap-1.5">
            <ModeCard
              id={BACKUP_DESTINATIONS.DOCUMENTS}
              active={destination === BACKUP_DESTINATIONS.DOCUMENTS}
              onClick={() => handleDestinationChange(BACKUP_DESTINATIONS.DOCUMENTS)}
              title="Save to device"
              body={"Silent — no share-sheet prompt. Backups land in your device's Documents folder when Android allows it (visible in Files app → Internal storage → Documents). On Android 11+ where scoped storage blocks the Documents write, falls back to the app's own external folder at Internal storage → Android → data → app.oceans_symphony.twa → files (still browsable, but wiped if you uninstall the app — keep an extra cloud copy if that matters)."}
            />
            <ModeCard
              id={BACKUP_DESTINATIONS.ASK}
              active={destination === BACKUP_DESTINATIONS.ASK}
              onClick={() => handleDestinationChange(BACKUP_DESTINATIONS.ASK)}
              title="Ask each time"
              body={"Pops the system share sheet so you pick where to save each backup (Files, Drive, email, etc.). Slower but lets you put backups in cloud storage in one tap."}
            />
          </div>
        </div>
      )}

      <div className="border-t border-border/30 pt-3">
        <PersistentStorageStatus />
      </div>
    </div>
  );
}

function ModeCard({ active, onClick, icon: Icon, title, body }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-2.5 flex items-start gap-2 transition-colors ${
        active
          ? "border-primary/60 bg-primary/5"
          : "border-border/40 hover:border-primary/30 hover:bg-muted/30"
      }`}
    >
      {Icon ? (
        <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
      ) : (
        <span className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 inline-block rounded-full border ${active ? "border-primary bg-primary" : "border-muted-foreground/50"}`} />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium ${active ? "text-primary" : "text-foreground"}`}>{title}</p>
        <p className="text-[0.6875rem] text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
      </div>
    </button>
  );
}
