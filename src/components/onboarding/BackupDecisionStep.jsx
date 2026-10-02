// The backup DECISION — the one onboarding step nobody can walk past.
//
// Why it exists: auto-backup defaults to off (a silent plaintext file in a
// public folder is an outing risk), and every previous route to turning it
// on was skippable — the Guide's checklist item, the home-screen health
// card. A tester reached a storage wipe having never been asked. This step
// asks, once, and records the answer (autoBackup.js → recordBackupDecision).
//
// "Not now" is always available: the point is a conscious choice, not a
// forced feature. The Continue button names the consequence of each choice.
//
// Mounted in two places: inline at the end of first-run setup
// (StorageModeSetup) and, as a safety net, in a dialog on the Dashboard for
// anyone who reaches the app without a recorded decision (users from before
// this existed, or a setup path that reloaded the page).

import React, { useState } from "react";
import { Zap, Bell, ShieldAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import { isNative } from "@/lib/platform";
import { ModeCard } from "@/components/settings/AutoBackupSettings";
import BackupFileOptions from "@/components/settings/BackupFileOptions";
import {
  AUTO_BACKUP_INTERVALS,
  BACKUP_DECISIONS,
  recordBackupDecision,
} from "@/lib/autoBackup";

const NATIVE = isNative();

export default function BackupDecisionStep({ onDone, compact = false }) {
  const terms = useTerms();
  const [choice, setChoice] = useState(null);
  const [interval, setInterval_] = useState(7);
  const [busy, setBusy] = useState(false);

  const scheduled = choice === BACKUP_DECISIONS.AUTO || choice === BACKUP_DECISIONS.REMINDER;

  const confirm = async () => {
    if (!choice || busy) return;
    setBusy(true);
    try {
      recordBackupDecision(choice, { intervalDays: interval });
      if (NATIVE) {
        try {
          const { reconcileNativeBackupReminder } = await import("@/lib/nativeBackupScheduler");
          await reconcileNativeBackupReminder();
        } catch { /* non-fatal — Settings re-arms it */ }
      }
      onDone?.(choice);
    } finally {
      setBusy(false);
    }
  };

  const continueLabel = {
    [BACKUP_DECISIONS.AUTO]: "Turn on backups & continue",
    [BACKUP_DECISIONS.REMINDER]: "Set reminder & continue",
    [BACKUP_DECISIONS.DECLINED]: "Continue without backups",
  }[choice] || "Continue";

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="font-display text-xl font-semibold text-foreground">Keep a backup copy?</h2>
        </div>
      )}
      <p className="text-sm text-muted-foreground leading-relaxed">
        Everything about your {terms.system} lives on this device only — there is no cloud copy.
        If the phone is lost, or a cleaner app or update clears the app's storage, a backup file
        is the only thing that survives. Choose how you want that handled.
      </p>

      <div className="grid gap-1.5">
        <ModeCard
          active={choice === BACKUP_DECISIONS.AUTO}
          onClick={() => setChoice(BACKUP_DECISIONS.AUTO)}
          icon={Zap}
          title={NATIVE ? "Back up automatically" : "Back up automatically (limited)"}
          body={NATIVE
            ? "Silent. On a schedule, a backup file is written to this phone's Downloads. You can lock it with a password and give it a plain name."
            : "When a backup is due and you open the app, a save prompt appears so you can put the file somewhere safe. Browsers can't do this in the background."}
        />
        {NATIVE && (
          <ModeCard
            active={choice === BACKUP_DECISIONS.REMINDER}
            onClick={() => setChoice(BACKUP_DECISIONS.REMINDER)}
            icon={Bell}
            title="Remind me to back up"
            body="A notification on a schedule. Tap it and the backup runs. Nothing is written until you do."
          />
        )}
        <ModeCard
          active={choice === BACKUP_DECISIONS.DECLINED}
          onClick={() => setChoice(BACKUP_DECISIONS.DECLINED)}
          title="Not now"
          body="I'll export by hand from Settings → Data & privacy. I understand that if this device loses its storage before I do, the data is gone."
        />
      </div>

      {scheduled && (
        <div className="space-y-3 rounded-xl border border-border/40 bg-muted/20 p-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground block">How often</label>
            <div className="flex flex-wrap gap-1.5">
              {AUTO_BACKUP_INTERVALS.filter((o) => o.value > 0).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setInterval_(opt.value)}
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
          </div>
          <BackupFileOptions />
        </div>
      )}

      <Button onClick={confirm} disabled={!choice || busy} className="w-full bg-primary hover:bg-primary/90">
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {continueLabel}
      </Button>
      <p className="text-[0.6875rem] text-muted-foreground text-center">
        Change any of this later in Settings → Data &amp; privacy → Auto-backup.
      </p>
    </div>
  );
}
