// Blob storage migration prompt (v0.86.5).
//
// Rationale: pre-v0.86.5 every avatar / banner / custom-font was stored as
// a base64 data-URI string in the images IDB. base64 inflates image bytes
// by ~33%, and large-string manipulation on those payloads is what caused
// the backup crash fixed in v0.86.3. Converting to native Blobs cuts
// storage size, eliminates the string-manipulation peak, and speeds up
// every image read.
//
// This modal is the first-time-only prompt. It:
//   1. Explains what's happening in one paragraph
//   2. Nudges the user to create a fresh backup FIRST (opens the backup panel)
//   3. Runs the migration with a live progress bar
//   4. Sets BLOB_MIGRATION_KEY on success so it never runs again
//
// It's a soft gate: the user can defer to next boot. It doesn't block
// app usage; every read path is back-compat with legacy strings during
// the intermediate state.

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Sparkles, ShieldAlert, Check, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  probeBlobMigrationStatus,
  migrateLegacyStringsToBlobs,
  isBlobMigrationDone,
} from "@/lib/localImageStorage";
import { clearImageResolverCache } from "@/lib/imageUrlResolver";

const DEFER_KEY = "symphony_blob_migration_deferred_until";

export default function BlobStorageMigrationModal({ onClose }) {
  const navigate = useNavigate();
  const [probe, setProbe] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0, converted: 0 });
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await probeBlobMigrationStatus();
      if (!cancelled) setProbe(p);
    })();
    return () => { cancelled = true; };
  }, []);

  const runMigration = async () => {
    if (running) return;
    setRunning(true);
    try {
      const result = await migrateLegacyStringsToBlobs((p) => setProgress(p));
      clearImageResolverCache();
      setDone(true);
      toast.success(`Converted ${result.converted} of ${result.total} images to blob storage`);
    } catch (e) {
      toast.error(e?.message || "Migration failed — you can try again on next boot.");
    } finally {
      setRunning(false);
    }
  };

  const defer = () => {
    // Defer for 24h so we don't nag every launch. On next open after that,
    // the AppLayout probe fires again.
    try { localStorage.setItem(DEFER_KEY, String(Date.now() + 24 * 3600 * 1000)); } catch { /* off */ }
    onClose?.();
  };

  const openBackup = () => {
    // Settings is /settings with section hash anchors (matches the existing
    // encryption redirect in AppLayout.jsx and the SetupChecklist backup link).
    // Do NOT close the modal — the user comes back to finish the migration
    // after making a backup, and defer/dismiss is intentional if they choose.
    navigate("/settings#data");
  };

  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[10001] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Optimising image storage
          </h2>
          {!running && !done && (
            <button onClick={defer} className="text-muted-foreground hover:text-foreground" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-4 space-y-3 text-sm">
          {!done && (
            <>
              <p className="text-foreground">
                We're switching how avatars, banners, and custom fonts are stored on this device.
                The new format is <strong>smaller and faster</strong> — and it's the fix behind
                the recent backup-crash resolution.
              </p>
              <p className="text-xs text-muted-foreground">
                It's safe — nothing gets deleted, and the change is reversible via a backup restore.
                For belt-and-braces, we recommend saving a fresh backup <em>before</em> running the
                one-time conversion.
              </p>

              {probe && (
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs">
                  <p className="font-medium text-foreground mb-1">On this device</p>
                  <p className="text-muted-foreground">
                    {probe.total} image{probe.total === 1 ? "" : "s"} stored ·{" "}
                    <span className="text-foreground font-medium">{probe.legacy}</span> in the old format
                  </p>
                </div>
              )}

              {running && (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin text-primary" />
                      Converting… {progress.processed} / {progress.total}
                    </span>
                    <span className="text-muted-foreground">{pct}%</span>
                  </div>
                  <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-200" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )}
            </>
          )}

          {done && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-1 text-sm">
              <p className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Done!
              </p>
              <p className="text-xs text-muted-foreground">
                Converted {progress.converted} of {progress.total} images. The app will now use less
                storage and back up more reliably.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 p-4 border-t border-border/50">
          {!done && !running && (
            <>
              <Button variant="outline" size="sm" onClick={openBackup} className="gap-1.5 flex-1">
                <Download className="w-3.5 h-3.5" /> Back up first
              </Button>
              <Button size="sm" onClick={runMigration} className="gap-1.5 flex-1">
                <Sparkles className="w-3.5 h-3.5" /> Convert now
              </Button>
            </>
          )}
          {running && (
            <Button size="sm" disabled className="w-full gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Please don't close the app…
            </Button>
          )}
          {done && (
            <Button size="sm" onClick={onClose} className="w-full">
              Continue
            </Button>
          )}
        </div>

        {!done && !running && (
          <div className="pb-3 px-4 -mt-1">
            <button
              type="button"
              onClick={defer}
              className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
            >
              Remind me tomorrow
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Boot-time gate: returns true when we should show the modal. Cheap enough
// to run in a useEffect on Dashboard mount.
export async function shouldShowBlobMigration() {
  if (isBlobMigrationDone()) return false;
  try {
    const deferUntil = parseInt(localStorage.getItem(DEFER_KEY) || "0", 10);
    if (deferUntil && Date.now() < deferUntil) return false;
  } catch { /* storage off */ }
  const probe = await probeBlobMigrationStatus();
  return probe.legacy > 0;
}
