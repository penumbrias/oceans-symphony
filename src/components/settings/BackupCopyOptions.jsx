// "Keep a copy off this device" — where the off-device backup copy goes
// (src/lib/backupCopy.js). Mounted inside BackupFileOptions, so it shows in
// Settings → Auto-backup, the first-run backup step and the Guide's backup
// item without drifting between them.

import React, { useEffect, useState } from "react";
import { CloudUpload, Check, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isDesktop } from "@/lib/platform";
import {
  backupCopyAvailable,
  backupCopyKind,
  getBackupCopyTarget,
  chooseBackupCopyTarget,
  clearBackupCopyTarget,
  describeBackupCopyTarget,
} from "@/lib/backupCopy";
import { getBackupName } from "@/lib/autoBackup";

export default function BackupCopyOptions({ onChange }) {
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const available = backupCopyAvailable();
  const kind = backupCopyKind();
  const device = isDesktop() ? "computer" : "phone";

  useEffect(() => {
    const sync = () => setTarget(getBackupCopyTarget());
    sync();
    window.addEventListener("symphony:backup-copy-changed", sync);
    return () => window.removeEventListener("symphony:backup-copy-changed", sync);
  }, []);

  const notify = () => { try { onChange?.(); } catch { /* parent-side */ } };

  const choose = async () => {
    setBusy(true);
    try {
      const t = await chooseBackupCopyTarget({ suggestedName: getBackupName() });
      if (t) {
        toast.success(`Backups will also be copied to ${describeBackupCopyTarget(t)}`);
        notify();
      }
    } catch (e) {
      toast.error(e?.message || "Couldn't choose that place.");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await clearBackupCopyTarget();
      toast.info("Stopped copying backups. The copy that's already there is left as it is.");
      notify();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <CloudUpload className="w-3.5 h-3.5" /> Keep a copy off this {device}
      </label>
      {!available ? (
        <p className="text-[0.6875rem] text-muted-foreground leading-relaxed">
          A backup on this device is lost with the device. When the save prompt appears, choose
          Google Drive or another cloud place to keep the file somewhere else. (The Android and
          desktop apps can do this automatically.)
        </p>
      ) : (
        <>
          <p className="text-[0.6875rem] text-muted-foreground leading-relaxed">
            {kind === "android-file"
              ? "A backup in Downloads is lost if the phone is lost or broken. Pick a file in Google Drive, OneDrive, Dropbox or an SD card, and every backup also replaces that file."
              : "A backup on this computer is lost with the computer. Pick a folder that's copied elsewhere, like your Google Drive, OneDrive or Dropbox folder, and every backup also lands there."}
            {" "}On a new device, install the app and use Import to restore from it.
          </p>
          {target ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 space-y-2">
              <p className="text-[0.6875rem] text-foreground flex items-start gap-1.5 break-all">
                <Check className="w-3 h-3 mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>Copying to <span className="font-medium">{describeBackupCopyTarget(target)}</span></span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="sm" variant="outline" onClick={choose} disabled={busy} className="h-7 text-xs">
                  {busy && <Loader2 className="w-3 h-3 mr-1 animate-spin" />} Change
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={stop} disabled={busy} className="h-7 text-xs text-muted-foreground">
                  Stop copying
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={choose} disabled={busy} className="h-8 text-xs gap-1.5">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
              {kind === "android-file" ? "Choose a file in Drive or elsewhere" : "Choose a folder"}
            </Button>
          )}
          {target && (
            <p className="text-[0.6875rem] text-muted-foreground leading-relaxed flex items-start gap-1.5">
              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                The copy can be read by anyone with access to that account
                {" "}unless backup files are locked with a password above.
                {" "}If a backup is ever much smaller than the copy, the copy is kept and you're told.
              </span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
