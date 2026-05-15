import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AUTO_BACKUP_INTERVALS,
  getAutoBackupInterval,
  setAutoBackupInterval,
  getAutoBackupLastAt,
  runAutoBackupNow,
  requestPersistentStorage,
  getStorageState,
} from "@/lib/autoBackup";

function fmtBytes(n) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [lastAt, setLastAt] = useState(null);
  const [running, setRunning] = useState(false);
  const [storage, setStorage] = useState({ persisted: null, usage: null, quota: null });

  // Initial read of state from localStorage + browser.
  useEffect(() => {
    setIntervalState(getAutoBackupInterval());
    setLastAt(getAutoBackupLastAt());
    getStorageState().then(setStorage).catch(() => {});
  }, []);

  const handleIntervalChange = (val) => {
    const v = parseInt(val, 10);
    setIntervalState(v);
    setAutoBackupInterval(v);
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

  const handleRequestPersistent = async () => {
    const granted = await requestPersistentStorage();
    setStorage(await getStorageState());
    if (granted) toast.success("Storage marked persistent");
    else toast.error("Browser refused persistent storage");
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
          Writes a full backup of your data to your device's Downloads folder on a schedule. The Downloads folder lives outside the app's sandbox, so a backup file there survives "Clear app data", device-cleaner apps, app reinstalls, and most storage-loss scenarios.
        </p>
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 flex items-start gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-[0.6875rem] text-foreground leading-relaxed">
            <strong>Auto-backup runs only when the app is opened.</strong> On
            boot, if enough time has passed since the last backup (based on
            your chosen schedule), the app writes a backup right then. If
            you don't open the app for a while, no backups happen during
            that gap — open the app at least as often as your schedule
            (e.g. once a week if Weekly), or use "Back up now" before a
            long break. Browsers and installed PWAs can't reliably run
            background tasks on a real clock.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground block">Schedule</label>
        <div className="flex flex-wrap gap-1.5">
          {AUTO_BACKUP_INTERVALS.map((opt) => (
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

      <div className="border-t border-border/30 pt-3 space-y-2">
        <div className="flex items-start gap-2">
          {storage.persisted === true ? (
            <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium">
              Storage persistence: {storage.persisted === true ? "Granted" : storage.persisted === false ? "Not granted" : "Unknown"}
            </p>
            <p className="text-[0.6875rem] text-muted-foreground mt-0.5">
              {storage.persisted === true
                ? "The browser has marked this app's storage as persistent — it won't be evicted by background cleanup."
                : "The browser hasn't marked this app's storage as persistent yet. Installed PWAs / TWAs usually get this automatically; web tabs need to earn user engagement first."}
              {storage.usage != null && (
                <> Currently using ~{fmtBytes(storage.usage)}{storage.quota ? ` of ${fmtBytes(storage.quota)}` : ""}.</>
              )}
            </p>
          </div>
        </div>
        {storage.persisted !== true && (
          <Button onClick={handleRequestPersistent} variant="outline" size="sm">
            Request persistent storage
          </Button>
        )}
      </div>
    </div>
  );
}
