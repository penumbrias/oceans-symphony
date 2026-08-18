// "Is my data safe?" — a small, honest card that appears ONLY when backups
// need attention: never backed up, last backup stale, or auto-backup
// failing. Silence is the enemy here — a failing auto-backup used to be a
// console.warn and nothing else. Reads backupHealth.js; renders on the v2
// home notice stack AND the classic dashboard from this one component so
// the two can't disagree.
//
// It is quiet by design: no card when everything is fine, and a snooze
// (3 days) once acknowledged — nagging trains people to ignore it.

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, ShieldCheck, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  evaluateBackupHealth, snoozeBackupWarning, BACKUP_HEALTH_CHANGE_EVENT,
} from "@/lib/backupHealth";
import {
  getAutoBackupMode, getAutoBackupInterval, getAutoBackupLastAt, runAutoBackupNow, BACKUP_MODES,
} from "@/lib/autoBackup";

export function useBackupHealth() {
  const compute = () => evaluateBackupHealth({
    mode: getAutoBackupMode(),
    intervalDays: getAutoBackupInterval(),
    legacyLastAt: getAutoBackupLastAt(),
  });
  const [health, setHealth] = useState(compute);
  useEffect(() => {
    const refresh = () => setHealth(compute());
    window.addEventListener(BACKUP_HEALTH_CHANGE_EVENT, refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("symphony-local-settings-restored", refresh);
    const id = setInterval(refresh, 60 * 60 * 1000); // staleness ticks over with time
    return () => {
      window.removeEventListener(BACKUP_HEALTH_CHANGE_EVENT, refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("symphony-local-settings-restored", refresh);
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return health;
}

function daysLabel(d) {
  if (d == null) return "never";
  if (d < 1) return "today";
  const n = Math.floor(d);
  return n === 1 ? "yesterday" : `${n} days ago`;
}

// `variant`: "v2" (transparent, uses the notice look) | "classic"
export default function BackupHealthNotice({ variant = "classic", className = "" }) {
  const navigate = useNavigate();
  const health = useBackupHealth();
  const [busy, setBusy] = useState(false);
  const [, force] = useState(0);

  if (health.level === "ok" || health.snoozed) return null;

  const mode = getAutoBackupMode();
  const headline = {
    none: "Your data has never been backed up",
    stale: `Last backup was ${daysLabel(health.daysSince)}`,
    failing: `Backups have been failing (${health.consecutiveFails}× in a row)`,
    off: health.daysSince == null ? "Automatic backups are off — and there's no backup yet" : `Automatic backups are off — last backup ${daysLabel(health.daysSince)}`,
  }[health.level];
  const detail = {
    none: "Everything lives on this device only. One backup file means a lost or wiped phone doesn't mean lost data.",
    stale: "Anything you've added since then isn't in a backup file yet.",
    failing: health.lastFailDetail ? `Last error: ${health.lastFailDetail}` : "The backup file couldn't be saved.",
    off: "Turn on automatic backups, or export a file now.",
  }[health.level];

  const backupNow = async () => {
    setBusy(true);
    try {
      await runAutoBackupNow({ silent: false });
    } catch (e) {
      toast.error(e?.message || "Backup failed");
    } finally { setBusy(false); force((x) => x + 1); }
  };

  const shell = variant === "v2"
    ? "w-full bg-background/80 backdrop-blur-md px-3 py-2 flex items-start gap-2"
    : "w-full rounded-xl border px-3 py-2.5 flex items-start gap-2 bg-card/60";
  const style = variant === "v2"
    ? { borderRadius: "var(--v2-radius, 12px)", borderWidth: "var(--v2-border-w, 1px)", borderStyle: "solid", borderColor: "rgb(245 158 11)", borderLeftWidth: 3 }
    : { borderColor: "rgb(245 158 11 / 0.6)", borderLeftWidth: 3, borderLeftColor: "rgb(245 158 11)" };

  return (
    <div className={`${shell} ${className}`} style={style} role="status" data-tour="backup-health">
      <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug">{headline}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <button type="button" onClick={backupNow} disabled={busy}
            className="text-xs px-2.5 py-1 rounded-full border border-amber-500/70 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 flex items-center gap-1">
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
            Back up now
          </button>
          <button type="button" onClick={() => navigate("/settings#data")}
            className="text-xs px-2.5 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground">
            {mode === BACKUP_MODES.OFF ? "Turn on auto-backup" : "Backup settings"}
          </button>
        </div>
      </div>
      <button type="button" aria-label="Remind me in 3 days" title="Remind me in 3 days"
        onClick={() => { snoozeBackupWarning(3); force((x) => x + 1); }}
        className="p-1 -m-1 text-muted-foreground hover:text-foreground flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
