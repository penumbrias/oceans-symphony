import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine, AlertTriangle } from "lucide-react";
import { isNative } from "@/lib/platform";

// Shown ONCE on the first launch of the native Capacitor build under
// the TWA's package id. The TWA stored data in Chrome's storage
// scope for the TWA's origin; the native build stores in its own
// WebView's IndexedDB sandbox. These are separate stores that share
// nothing — so a Play Store update that swaps the TWA for the
// native build (same package id, same listing, same auto-update
// channel) lands with an empty database from the user's
// perspective. The user thinks: "I lost everything."
//
// They didn't — their TWA data is still on the device in the
// previous app's storage, just unreachable from the new WebView.
// Best path forward is: import an Oceans Symphony backup file (if
// they have one). If they don't, they should treat this as a fresh
// install. This modal makes that decision explicit so it can't be
// missed.

const FLAG_KEY = "symphony_twa_to_native_seen_v1";

export function shouldShowTwaToNativeMigration() {
  if (!isNative()) return false;
  try { return !localStorage.getItem(FLAG_KEY); }
  catch { return false; }
}

function setSeen() {
  try { localStorage.setItem(FLAG_KEY, String(Date.now())); }
  catch { /* non-fatal */ }
}

export default function TwaToNativeMigrationModal({ open, onClose, onImport }) {
  const [confirming, setConfirming] = useState(false);

  if (!open) return null;

  const handleStartFresh = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setSeen();
    onClose?.();
  };

  const handleImport = () => {
    setSeen();
    onClose?.();
    onImport?.();
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-background/80 backdrop-blur-sm overflow-y-auto"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg leading-tight">Welcome to the native Oceans Symphony</h3>
            <p className="text-xs text-muted-foreground mt-1">
              This version replaces the old web-wrapper build under the same Play listing.
            </p>
          </div>
        </div>

        <div className="space-y-3 text-sm leading-relaxed">
          <p>
            <strong>Your old data didn't carry over automatically.</strong> The previous build was a wrapper around the website — it stored everything in Chrome's storage for the app's origin. This new native build has its own separate storage sandbox, and Android can't share data between them.
          </p>
          <p>
            <strong>The good news:</strong> your data is still safe in Chrome. To get it into the native app, open <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">oceans-symphony.app</code> in Chrome on this phone, go to Settings → Data &amp; Privacy → Download Backup, and save the file. Then come back here and tap "Import backup file" below.
          </p>
          <p className="text-muted-foreground text-xs">
            If you don't have any data to migrate, "Start fresh" is fine.
          </p>
        </div>

        {confirming ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 space-y-2">
            <p className="text-sm font-medium text-destructive">Start fresh?</p>
            <p className="text-xs text-muted-foreground">
              Your old alters, journals, check-ins, and reminders won't be visible in this build. They aren't deleted from your device, but you'll need a backup file to bring them in. Continue?
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Back</Button>
              <Button variant="destructive" size="sm" onClick={handleStartFresh}>Yes, start fresh</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pt-1">
            <Button onClick={handleImport} className="gap-2">
              <ArrowDownToLine className="w-4 h-4" />
              Import backup file
            </Button>
            <Button variant="outline" onClick={handleStartFresh}>
              I don't have a backup — start fresh
            </Button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
