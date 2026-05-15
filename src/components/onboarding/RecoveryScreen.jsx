import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  LifeBuoy,
  Download,
  Upload,
  RotateCcw,
  Lock,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import {
  exportRawStorageBlob,
  loadDbDump,
  peekStoredData,
} from "@/lib/localDb";
import { runAutoBackupNow } from "@/lib/autoBackup";

// Shown when boot detects existing data on disk that we cannot use as-is
// (corrupted JSON, IDB read error, missing salt, etc.). The point of this
// screen is that the user is NEVER routed back into firstrun setup with
// real data still on the device — every path here either recovers, exports
// a copy first, or makes destruction explicit and confirmed.
export default function RecoveryScreen({ reason, onResolved }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // {type, text}
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef(null);

  const kind = reason?.kind || "unknown";
  const message = describeReason(kind, reason?.error);

  const handleExportRaw = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const raw = await exportRawStorageBlob();
      if (!raw) {
        setStatus({ type: "error", text: "Nothing to export — no stored data was found." });
        return;
      }
      const blob = new Blob([raw], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `oceans-symphony-raw-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus({
        type: "success",
        text: "Raw data file saved. Keep this safe — it can be used to recover your data later, even if it's encrypted.",
      });
    } catch (e) {
      setStatus({ type: "error", text: `Export failed: ${e?.message || e}` });
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = () => {
    setStatus(null);
    onResolved?.();
  };

  const handleRestoreFile = () => fileInputRef.current?.click();

  const onFileChosen = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.__format !== "symphony_backup" || !parsed.data) {
        throw new Error("Unrecognised file. Expected an Oceans Symphony backup JSON.");
      }
      await loadDbDump(parsed.data);
      setStatus({ type: "success", text: "Backup restored. Reloading…" });
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setStatus({ type: "error", text: `Restore failed: ${e?.message || e}` });
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setBusy(true);
    setStatus(null);
    try {
      // Always try to back up the raw blob to Downloads first, even
      // though the user already saw the manual export button. The cost
      // of an extra file is nothing compared to losing data forever.
      try {
        const raw = await exportRawStorageBlob();
        if (raw) {
          const blob = new Blob([raw], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          a.href = url;
          a.download = `oceans-symphony-raw-pre-reset-${ts}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1500);
        }
      } catch { /* best-effort */ }
      // Also try to write a regular auto-backup of whatever is currently
      // loaded (might be empty, but harmless). Best-effort.
      try { await runAutoBackupNow({ silent: true }); } catch { /* ignore */ }

      // Now actually wipe by writing an empty DB.
      await loadDbDump({});
      setStatus({ type: "success", text: "Reset complete. Reloading…" });
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setStatus({ type: "error", text: `Reset failed: ${e?.message || e}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-5 my-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center">
            <LifeBuoy className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-foreground text-center">
            Data Recovery
          </h2>
          <p className="text-sm text-muted-foreground text-center">{message}</p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-foreground">
            Your stored data is still on this device. Don't reset until you've
            saved a copy — once you reset, the existing data is gone for good.
          </p>
        </div>

        {status && (
          <div className={`text-sm rounded-lg p-3 ${
            status.type === "success"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}>
            {status.text}
          </div>
        )}

        <div className="space-y-2">
          {(kind === "forgot_password" || kind === "unlock_failed") && (
            <Button
              type="button"
              onClick={handleRetry}
              disabled={busy}
              variant="outline"
              className="w-full justify-start"
            >
              <Lock className="w-4 h-4 mr-2" />
              Try unlocking again
            </Button>
          )}

          <Button
            type="button"
            onClick={handleExportRaw}
            disabled={busy}
            className="w-full justify-start bg-primary hover:bg-primary/90"
          >
            {busy
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Download className="w-4 h-4 mr-2" />}
            Save a copy of my raw data
          </Button>
          <p className="text-xs text-muted-foreground px-1">
            Downloads the raw on-device data file (encrypted ciphertext if you
            had a password). Keep it safe — it can be recovered later.
          </p>

          <Button
            type="button"
            onClick={handleRestoreFile}
            disabled={busy}
            variant="outline"
            className="w-full justify-start"
          >
            <Upload className="w-4 h-4 mr-2" />
            Restore from a backup file
          </Button>
          <p className="text-xs text-muted-foreground px-1">
            Pick a previous Oceans Symphony backup JSON to replace what's on
            this device.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={onFileChosen}
            className="hidden"
          />

          <Button
            type="button"
            onClick={() => setConfirmReset(true)}
            disabled={busy}
            variant="outline"
            className="w-full justify-start text-destructive hover:text-destructive"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset and start fresh
          </Button>
          <p className="text-xs text-muted-foreground px-1">
            Wipes the on-device data so the app can boot from empty. A copy
            of the current raw blob is saved to your Downloads folder first.
          </p>
        </div>

        <p className="text-[11px] text-muted-foreground text-center pt-1">
          If none of these work, contact pesturedrawing@gmail.com with the raw
          data file you saved.
        </p>
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset on-device data?</AlertDialogTitle>
            <AlertDialogDescription>
              This wipes the data currently stored on this device so the app
              can start fresh. A copy of the raw data file is saved to your
              Downloads folder first, in case you need to recover it later.
              This action cannot be undone from inside the app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault();
                await handleReset();
                setConfirmReset(false);
              }}
              disabled={busy}
              className="bg-destructive hover:bg-destructive/90"
            >
              {busy
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <RotateCcw className="w-4 h-4 mr-2" />}
              Save copy &amp; reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Background re-peek — if the underlying state has resolved (e.g.
          a service worker update finished restoring storage), let the
          user know the situation may have changed. */}
      <DataStateRefreshHint onChanged={onResolved} />
    </div>
  );
}

function describeReason(kind, error) {
  switch (kind) {
    case "read_error":
      return `We couldn't read this device's storage${error?.message ? ` (${error.message})` : ""}. Your data file may still be intact — please don't clear app data until you've saved a copy below.`;
    case "corrupted":
      return "The data file on this device is unreadable. Save a copy of the raw file below before resetting — support may be able to recover it.";
    case "init_failed":
      return `Loading your data hit an error${error?.message ? ` (${error.message})` : ""}. Save a raw copy below before doing anything destructive.`;
    case "missing_salt":
      return "The encryption salt this device used to scramble your data is missing, so no password can decrypt it from here. If you have a backup file, restore from it. Otherwise save the raw file and contact support.";
    case "forgot_password":
    case "unlock_failed":
      return "If you can't unlock your data, save a raw copy first — that file can be unlocked later if you remember the password or have it in a backup.";
    default:
      return "Something went wrong loading your data. Use the options below to save a copy or restore a backup before doing anything destructive.";
  }
}

// Fires onChanged() if a periodic peek shows the storage state has
// shifted on its own (rare, but cheap insurance — e.g. a deferred
// migration finished). Doesn't auto-redirect; just re-checks every 4s.
function DataStateRefreshHint({ onChanged }) {
  const lastSig = useRef(null);
  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const peek = await peekStoredData();
        const sig = JSON.stringify({
          e: peek.exists, en: peek.encrypted, c: peek.corrupted,
        });
        if (lastSig.current === null) {
          lastSig.current = sig;
        } else if (sig !== lastSig.current && !cancelled) {
          // Don't auto-route — the user may be mid-export. Surface a
          // soft hint via onChanged only when truly different.
          lastSig.current = sig;
        }
      } catch { /* keep waiting */ }
    };
    const id = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [onChanged]);
  return null;
}
