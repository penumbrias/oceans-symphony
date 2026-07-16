import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { HeartHandshake, Database, Download, Loader2, Lock, ArrowRight, X, RefreshCw, AlertTriangle } from "lucide-react";
import { listAllStorageBlobs } from "@/lib/dataRecovery";
import { adoptStorageKeyAsActive } from "@/lib/systems";
import { shareFile } from "@/lib/shareFile";

// Manual "find my data" rescue tool. Reachable from Settings AND the Welcome
// screen so a user whose data appears missing can recover it EVEN WHEN the
// boot-time scanner never ran — e.g. they tapped "Get Started" over a wipe and
// now have an empty active system (peek.exists === true, so App.jsx's orphan
// scan is bypassed). Lists every data blob actually in this app's IndexedDB
// (ground truth), lets the user switch to any other copy, and can download any
// copy raw. Restoring only re-points the active system — it never deletes data.
export default function DataRescuePanel({ onClose }) {
  const [blobs, setBlobs] = useState(null); // null = loading
  const [busyKey, setBusyKey] = useState(null);
  const [status, setStatus] = useState(null);

  const load = async () => {
    setBlobs(null);
    try {
      setBlobs(await listAllStorageBlobs());
    } catch (e) {
      setStatus({ type: "error", text: `Couldn't read storage: ${e?.message || e}` });
      setBlobs([]);
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const titleFor = (b) => b.name || (b.systemId == null ? "Your main system" : "A saved system");
  const describe = (b) => {
    if (b.corrupted) return "Unreadable (corrupted) — download it and send it in for recovery";
    if (b.encrypted) return "Encrypted (locked — you'll enter your password after restoring)";
    const parts = [];
    if (b.alterCount != null) parts.push(`${b.alterCount} ${b.alterCount === 1 ? "alter" : "alters"}`);
    if (b.entityCount != null) parts.push(`${b.entityCount} total records`);
    const kb = b.sizeBytes < 1024 * 1024 ? `${(b.sizeBytes / 1024).toFixed(0)} KB` : `${(b.sizeBytes / 1048576).toFixed(1)} MB`;
    parts.push(kb);
    return parts.join(" · ");
  };

  const handleRestore = async (b) => {
    if (busyKey) return;
    setBusyKey(b.key);
    setStatus(null);
    try {
      await adoptStorageKeyAsActive(b.key, b.name);
      window.location.reload();
    } catch (e) {
      setStatus({ type: "error", text: `Couldn't restore: ${e?.message || e}` });
      setBusyKey(null);
    }
  };

  const handleDownload = async (b) => {
    if (busyKey) return;
    setBusyKey(b.key);
    setStatus(null);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const res = await shareFile({
        blob: new Blob([b.raw], { type: "application/json" }),
        filename: `oceans-symphony-storage-${date}.json`,
        title: "Oceans Symphony data",
        dialogTitle: "Save data copy",
      });
      if (res?.result === "failed") setStatus({ type: "error", text: `Save failed${res.error ? `: ${res.error}` : ""}` });
      else if (res?.result !== "cancelled") setStatus({ type: "success", text: "Saved a copy — keep it somewhere safe." });
    } catch (e) {
      setStatus({ type: "error", text: `Save failed: ${e?.message || e}` });
    } finally {
      setBusyKey(null);
    }
  };

  const others = (blobs || []).filter((b) => !b.isActive);
  const recoverable = others.filter((b) => b.encrypted || b.corrupted || (b.entityCount ?? 0) > 0);

  return (
    <div className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-5 my-8 relative">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <HeartHandshake className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-foreground text-center">Find my data</h2>
          <p className="text-sm text-muted-foreground text-center">
            This shows every copy of your data stored in this app. If a copy holds your
            missing data, restore it — restoring only switches the app to that copy and
            never deletes anything.
          </p>
        </div>

        {status && (
          <div className={`text-sm rounded-lg p-3 ${
            status.type === "success"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}>{status.text}</div>
        )}

        {blobs === null ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : blobs.length === 0 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-foreground">
              No data was found in this app's storage at all. If your data was here before,
              it may be in a different browser/app storage area — don't set up or import over
              this, and reach out with a screenshot of this screen.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {blobs.map((b) => (
              <div key={b.key} className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {b.corrupted ? <AlertTriangle className="w-5 h-5 text-amber-500" />
                      : b.encrypted ? <Lock className="w-5 h-5 text-primary" />
                      : <Database className="w-5 h-5 text-primary" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {titleFor(b)}
                      {b.isActive && <span className="ml-2 text-[0.65rem] uppercase tracking-wide text-primary align-middle">Currently open</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{describe(b)}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {!b.isActive && (b.encrypted || b.corrupted || (b.entityCount ?? 0) > 0) && (
                    <Button type="button" onClick={() => handleRestore(b)} disabled={!!busyKey}
                      className="w-full justify-center bg-primary hover:bg-primary/90">
                      {busyKey === b.key ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                      Restore this data
                    </Button>
                  )}
                  <Button type="button" onClick={() => handleDownload(b)} disabled={!!busyKey}
                    variant="outline" className="w-full justify-center">
                    <Download className="w-4 h-4 mr-2" />
                    Download a copy
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {blobs && blobs.length > 0 && recoverable.length === 0 && (
          <p className="text-xs text-muted-foreground text-center px-2">
            The only data found is the copy you're already in. If your other data isn't
            listed here, it's not in this app's storage — send a screenshot of this screen
            and don't set up or import over the top.
          </p>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-border">
          <button type="button" onClick={load} disabled={blobs === null}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 py-2">
            <RefreshCw className={`w-3 h-3 ${blobs === null ? "animate-spin" : ""}`} /> Rescan
          </button>
          {onClose && (
            <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground py-2">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
