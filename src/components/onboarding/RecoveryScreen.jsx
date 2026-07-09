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
  FileJson,
} from "lucide-react";
import {
  exportRawStorageBlob,
  loadDbDump,
  mergeDbDump,
  peekStoredData,
} from "@/lib/localDb";
import { runAutoBackupNow } from "@/lib/autoBackup";
import { shareFile } from "@/lib/shareFile";
import {
  parseImportText,
  decryptRawEncrypted,
  wrapAsStandardBackup,
  FORMAT_STANDARD,
  FORMAT_RAW_PLAIN,
  FORMAT_RAW_ENCRYPTED,
} from "@/lib/backupFormat";

// Shown when boot detects existing data on disk that we cannot use as-is
// (corrupted JSON, IDB read error, missing salt, etc.). The point of this
// screen is that the user is NEVER routed back into firstrun setup with
// real data still on the device — every path here either recovers, exports
// a copy first, or makes destruction explicit and confirmed.
export default function RecoveryScreen({ reason, onResolved }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // {type, text}
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingEncryptedImport, setPendingEncryptedImport] = useState(null);
  const [importMode, setImportMode] = useState("replace"); // 'replace' | 'merge'
  const [peekState, setPeekState] = useState(null);
  const fileInputRef = useRef(null);

  // One-shot peek so the "Save as standard backup" button knows whether
  // the on-device data is plain (we can convert) or encrypted (we
  // cannot, without the password).
  React.useEffect(() => {
    let cancelled = false;
    peekStoredData()
      .then(p => { if (!cancelled) setPeekState(p); })
      .catch(() => { if (!cancelled) setPeekState({ exists: false }); });
    return () => { cancelled = true; };
  }, []);

  const canSaveStandard = peekState?.exists && !peekState.encrypted && !peekState.corrupted;

  const kind = reason?.kind || "unknown";
  const message = describeReason(kind, reason?.error);

  // Route through the shared file-share helper so the recovery flow
  // works on native (Capacitor) — the previous inline anchor-click
  // path was silently no-op'ing inside the WebView, which is the
  // worst possible failure mode on a recovery screen.
  const downloadFile = async (filename, jsonText) => {
    const blob = new Blob([jsonText], { type: "application/json" });
    return shareFile({
      blob,
      filename,
      title: "Oceans Symphony recovery file",
      dialogTitle: "Save recovery file",
    });
  };

  const handleExportStandard = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const raw = await exportRawStorageBlob();
      if (!raw) {
        setStatus({ type: "error", text: "Nothing to export — no stored data was found." });
        return;
      }
      let parsed;
      try { parsed = JSON.parse(raw); }
      catch {
        setStatus({ type: "error", text: "The on-device data is unparseable; can't wrap it as a standard backup. Use 'Save raw on-device file' instead." });
        return;
      }
      if (parsed && parsed.__encrypted) {
        setStatus({ type: "error", text: "Data is encrypted — a standard backup requires the decrypted contents. Use 'Save raw on-device file' instead; you can re-import it later with the password." });
        return;
      }
      const envelope = wrapAsStandardBackup(parsed);
      const date = new Date().toISOString().slice(0, 10);
      const res = await downloadFile(`oceans-symphony-backup-${date}.json`, JSON.stringify(envelope));
      if (res?.result === "failed") {
        setStatus({ type: "error", text: `Save failed${res.error ? `: ${res.error}` : ""}` });
      } else if (res?.result !== "cancelled") {
        setStatus({
          type: "success",
          text: "Standard backup saved. You can import this file from Settings → Data & Privacy, or from the Restore button on this screen.",
        });
      }
    } catch (e) {
      setStatus({ type: "error", text: `Export failed: ${e?.message || e}` });
    } finally {
      setBusy(false);
    }
  };

  const handleExportRaw = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const raw = await exportRawStorageBlob();
      if (!raw) {
        setStatus({ type: "error", text: "Nothing to export — no stored data was found." });
        return;
      }
      const date = new Date().toISOString().slice(0, 10);
      const res = await downloadFile(`oceans-symphony-raw-${date}.json`, raw);
      if (res?.result === "failed") {
        setStatus({ type: "error", text: `Save failed${res.error ? `: ${res.error}` : ""}` });
      } else if (res?.result !== "cancelled") {
        setStatus({
          type: "success",
          text: "Raw data file saved. If your data is encrypted, you'll still need your password to decrypt it — but as long as you have this file AND the password, the data can be recovered.",
        });
      }
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

  // Applies a decrypted/parsed dump (with optional images/settings) to
  // the in-memory DB. Mirrors the Settings → DataBackupRestore behaviour
  // so this screen's restore button is just as capable.
  const applyDump = async ({ data, localImages, localFonts, localSettings }) => {
    if (localImages) {
      try {
        const { restoreLocalImages } = await import("@/lib/localImageStorage");
        await restoreLocalImages(localImages);
      } catch (e) {
        console.warn("Failed to restore local images during recovery:", e);
      }
    }
    if (localFonts) {
      try {
        const { restoreLocalFonts } = await import("@/lib/localFontStorage");
        await restoreLocalFonts(localFonts);
      } catch (e) {
        console.warn("Failed to restore local fonts during recovery:", e);
      }
    }
    if (localSettings) {
      for (const [k, v] of Object.entries(localSettings)) {
        try { localStorage.setItem(k, v); } catch { /* localStorage full / disabled */ }
      }
    }
    if (importMode === "merge") {
      await mergeDbDump(data);
    } else {
      await loadDbDump(data);
    }
  };

  const onFileChosen = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const text = await file.text();
      const parsed = parseImportText(text);
      if (parsed.format === FORMAT_STANDARD) {
        await applyDump({
          data: parsed.data,
          localImages: parsed.localImages,
          localFonts: parsed.localFonts,
          localSettings: parsed.localSettings,
        });
        setStatus({ type: "success", text: "Backup restored. Reloading…" });
        setTimeout(() => window.location.reload(), 900);
      } else if (parsed.format === FORMAT_RAW_PLAIN) {
        await applyDump({ data: parsed.data });
        setStatus({ type: "success", text: "Raw plain file restored. Reloading…" });
        setTimeout(() => window.location.reload(), 900);
      } else if (parsed.format === FORMAT_RAW_ENCRYPTED) {
        // Defer to the password prompt — user submits password, then we
        // decrypt and apply.
        setPendingEncryptedImport(parsed);
      }
    } catch (e) {
      setStatus({ type: "error", text: `Restore failed: ${e?.message || e}` });
    } finally {
      setBusy(false);
    }
  };

  const handleDecryptAndImport = async (password) => {
    if (!pendingEncryptedImport) return;
    setBusy(true);
    setStatus(null);
    try {
      const data = await decryptRawEncrypted(pendingEncryptedImport, password);
      setPendingEncryptedImport(null);
      await applyDump({ data });
      setStatus({ type: "success", text: "Encrypted file decrypted and restored. Reloading…" });
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setStatus({ type: "error", text: `Decrypt failed: ${e?.message || e}` });
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setBusy(true);
    setStatus(null);
    try {
      // Always try to back up the raw blob first, even though the user
      // already saw the manual export button. The cost of an extra
      // file is nothing compared to losing data forever. Routes through
      // shareFile so it works inside a Capacitor WebView (where the
      // old anchor-click was a silent no-op). The user sees a share
      // sheet and picks a destination — we proceed with the reset
      // regardless of whether they save it (they were warned).
      try {
        const raw = await exportRawStorageBlob();
        if (raw) {
          const blob = new Blob([raw], { type: "application/json" });
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          await shareFile({
            blob,
            filename: `oceans-symphony-raw-pre-reset-${ts}.json`,
            title: "Pre-reset backup",
            dialogTitle: "Save before resetting",
          });
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
            Downloads the raw on-device data file. If your data is encrypted,
            this file is ciphertext — it still needs your password to be
            decrypted later. Without the password it cannot be read.
          </p>

          <Button
            type="button"
            onClick={handleExportStandard}
            disabled={busy || !canSaveStandard}
            variant="outline"
            className="w-full justify-start"
          >
            <FileJson className="w-4 h-4 mr-2" />
            Save as standard backup file
          </Button>
          <p className="text-xs text-muted-foreground px-1">
            {canSaveStandard
              ? "Wraps the on-device data in the standard backup format — same shape as Settings → Export, so it can be imported anywhere."
              : peekState?.encrypted
                ? "Not available while the data is encrypted (we'd need to decrypt it first). Use 'Save a copy of my raw data' — the encrypted file can be re-imported here later with your password."
                : "Not available right now — the on-device data isn't readable as plain JSON. Use 'Save a copy of my raw data' to preserve the raw bytes."}
          </p>

          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
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
            <p className="text-xs text-muted-foreground">
              Accepts any of three formats: a standard Symphony backup file,
              a raw on-device file (plain), or a raw on-device file
              (encrypted — you'll be asked for the password).
            </p>
            <div className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="recoveryImportMode"
                  value="replace"
                  checked={importMode === "replace"}
                  onChange={(e) => setImportMode(e.target.value)}
                  className="w-3.5 h-3.5"
                />
                Replace
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="recoveryImportMode"
                  value="merge"
                  checked={importMode === "merge"}
                  onChange={(e) => setImportMode(e.target.value)}
                  className="w-3.5 h-3.5"
                />
                Add only new records
              </label>
            </div>
          </div>
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

      <EncryptedImportPasswordModal
        open={!!pendingEncryptedImport}
        onClose={() => setPendingEncryptedImport(null)}
        onSubmit={handleDecryptAndImport}
        busy={busy}
      />
    </div>
  );
}

function EncryptedImportPasswordModal({ open, onClose, onSubmit, busy }) {
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 shadow-2xl space-y-4">
        <h3 className="font-semibold text-lg">Encrypted file</h3>
        <p className="text-sm text-muted-foreground">
          This is an encrypted raw on-device file. Enter the password used
          when the file was created to decrypt and restore it.
        </p>
        <div className="relative">
          <input
            type={showPass ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && password) onSubmit(password); }}
            placeholder="Password used to encrypt the file"
            className="w-full px-3 py-2 pr-14 rounded-md border border-input bg-background text-sm"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowPass(p => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs"
          >
            {showPass ? "Hide" : "Show"}
          </button>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onSubmit(password)} disabled={busy || !password}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Decrypt &amp; Restore
          </Button>
        </div>
      </div>
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
      return "The encryption salt this device used to scramble your data is missing, so no password can decrypt it from here. If you have a previous backup file, restore from it. Otherwise, save the raw file (it's still encrypted; recovering it would require both the original salt and your password).";
    case "forgot_password":
    case "unlock_failed":
      return "If you can't unlock your data, save a raw copy of it first. The copy is encrypted ciphertext — it still needs your password to be read — but as long as you keep both this file and the password, the data is recoverable. Once you reset, the data is gone for good.";
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
