import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { HeartHandshake, Database, Download, Loader2, Lock, ArrowRight } from "lucide-react";
import { adoptStorageKeyAsActive } from "@/lib/systems";
import { shareFile } from "@/lib/shareFile";

// Shown when boot found NO data at the active system slot BUT the scanner
// (dataRecovery.js) found real data under another key in the same IndexedDB
// scope — i.e. the app was about to show the empty first-run Welcome screen to
// someone whose data is still on the device, just mis-pointed. Restoring only
// re-points the active system at the found blob and reloads; it never touches
// the data itself. A "download a copy first" button is offered as a safety net.
export default function OrphanRecoveryScreen({ candidates, onSetupNew }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { type, text }

  const list = Array.isArray(candidates) ? candidates : [];
  const best = list[0];

  const describe = (c) => {
    if (!c) return "";
    if (c.encrypted) return "Encrypted data (locked — you'll enter your password after restoring)";
    const parts = [];
    if (c.alterCount != null) parts.push(`${c.alterCount} ${c.alterCount === 1 ? "alter" : "alters"}`);
    if (c.entityCount != null) parts.push(`${c.entityCount} total records`);
    return parts.join(" · ") || "Saved data";
  };

  const titleFor = (c) => {
    if (c?.name) return c.name;
    if (c?.systemId == null) return "Your main system";
    return "A saved system";
  };

  const handleRestore = async (candidate) => {
    if (!candidate || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      await adoptStorageKeyAsActive(candidate.key, candidate.name);
      // Reload so the boot path re-points localDb at the adopted key and loads
      // it cleanly (unlock screen next if it was encrypted).
      window.location.reload();
    } catch (e) {
      setStatus({ type: "error", text: `Couldn't restore: ${e?.message || e}. Try "Download a copy" first, then reach out for help.` });
      setBusy(false);
    }
  };

  const handleDownload = async (candidate) => {
    if (!candidate || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const res = await shareFile({
        blob: new Blob([candidate.raw], { type: "application/json" }),
        filename: `oceans-symphony-recovered-${date}.json`,
        title: "Oceans Symphony recovered data",
        dialogTitle: "Save recovered data",
      });
      if (res?.result === "failed") {
        setStatus({ type: "error", text: `Save failed${res.error ? `: ${res.error}` : ""}` });
      } else if (res?.result !== "cancelled") {
        setStatus({ type: "success", text: "Saved a copy. This file is your full data — keep it somewhere safe." });
      }
    } catch (e) {
      setStatus({ type: "error", text: `Save failed: ${e?.message || e}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-5 my-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <HeartHandshake className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-foreground text-center">
            We found your data
          </h2>
          <p className="text-sm text-muted-foreground text-center">
            Your data is still safe on this device — the app just opened to an empty
            slot. Restore it below to pick up right where you left off.
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

        <div className="space-y-3">
          {list.map((c) => (
            <div
              key={c.key}
              className="rounded-xl border border-border bg-muted/30 p-3.5 space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {c.encrypted
                    ? <Lock className="w-5 h-5 text-primary" />
                    : <Database className="w-5 h-5 text-primary" />}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{titleFor(c)}</p>
                  <p className="text-xs text-muted-foreground">{describe(c)}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  onClick={() => handleRestore(c)}
                  disabled={busy}
                  className="w-full justify-center bg-primary hover:bg-primary/90"
                >
                  {busy
                    ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    : <ArrowRight className="w-4 h-4 mr-2" />}
                  Restore this data
                </Button>
                <Button
                  type="button"
                  onClick={() => handleDownload(c)}
                  disabled={busy}
                  variant="outline"
                  className="w-full justify-center"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download a copy first
                </Button>
              </div>
            </div>
          ))}
        </div>

        {best && (
          <p className="text-xs text-muted-foreground text-center px-2">
            Restoring only re-points the app at your existing data — nothing is
            deleted or overwritten.
          </p>
        )}

        <div className="pt-1 border-t border-border">
          <button
            type="button"
            onClick={() => !busy && onSetupNew?.()}
            disabled={busy}
            className="w-full text-xs text-muted-foreground hover:text-foreground py-2 disabled:opacity-50"
          >
            None of these are mine — set up as a new system instead
          </button>
        </div>
      </div>
    </div>
  );
}
