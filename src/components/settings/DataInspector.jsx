import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Trash2, Loader2, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { useTerms } from "@/lib/useTerms";
import { getStorageState } from "@/lib/autoBackup";
import { bulkDeleteEntities } from "@/lib/localDb";
import { isNative } from "@/lib/platform";

const NATIVE = isNative();
import {
  EXPORT_CATEGORIES,
  computeCategoryStats,
  exportSingleCategory,
  resolveCatLabel,
  resolveCatDesc,
} from "@/components/settings/DataBackupRestore";

function fmtKB(kb) {
  if (kb == null) return "—";
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function fmtBytes(n) {
  if (n == null) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DataInspector() {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [stats, setStats] = useState(null); // { categories, deviceBound }
  const [storage, setStorage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyCatId, setBusyCatId] = useState(null); // export or delete in progress
  const [confirmCat, setConfirmCat] = useState(null); // category pending delete confirmation

  const load = async () => {
    setLoading(true);
    try {
      const [s, st] = await Promise.all([computeCategoryStats(), getStorageState()]);
      setStats(s);
      setStorage(st);
    } catch (e) {
      toast.error(e?.message || "Couldn't read local storage");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = async (cat) => {
    setBusyCatId(cat.id);
    try {
      const res = await exportSingleCategory(cat.id);
      if (res?.result === "failed") {
        toast.error(`Export failed${res.error ? `: ${res.error}` : ""}`);
      } else if (res?.result !== "cancelled") {
        toast.success(`"${resolveCatLabel(cat, terms)}" exported`);
      }
    } catch (e) {
      toast.error(e?.message || "Export failed");
    } finally {
      setBusyCatId(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    const cat = confirmCat;
    if (!cat) return;
    setConfirmCat(null);
    setBusyCatId(cat.id);
    try {
      // Non-skippable safety net: back up just this category BEFORE
      // deleting anything. If the backup itself fails, abort — never
      // delete without a fallback copy already on the device.
      const backupRes = await exportSingleCategory(cat.id);
      if (backupRes?.result === "failed" || backupRes?.result === "cancelled") {
        toast.error("Couldn't save a backup first — delete cancelled.");
        return;
      }
      const deletedCount = await bulkDeleteEntities(cat.entities);
      queryClient.invalidateQueries();
      await load();
      toast.success(`Deleted ${deletedCount} record${deletedCount === 1 ? "" : "s"} from "${resolveCatLabel(cat, terms)}".`);
    } catch (e) {
      toast.error(e?.message || "Delete failed");
    } finally {
      setBusyCatId(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Everything below lives on this device, in this browser's storage — nothing here is uploaded to a server. (The one exception is Friends mode, which is off unless you set it up, and only ever shares your current front's display name and colour.) Use this to see exactly what's stored, export any one category on its own, or delete a category you don't need anymore.
      </p>

      {storage && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-border/40 bg-muted/10">
          {NATIVE || storage.persisted === true ? (
            <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          )}
          <p className="text-xs text-muted-foreground leading-relaxed">
            {storage.usage != null
              ? <>Using ~{fmtBytes(storage.usage)}{storage.quota ? ` of ${fmtBytes(storage.quota)} available` : ""} on this device.</>
              : "Storage usage isn't available in this browser."}
            {" "}
            {NATIVE
              // On native, this is the installed app's own WebView storage —
              // not subject to the same background-eviction rules a browser
              // tab is, so the browser-only "persisted" flag doesn't apply
              // here (see PersistentStorageStatus.jsx, shared with Storage &
              // encryption / Automatic backups).
              ? "This is the installed app's own storage, so it isn't subject to browser eviction — no action needed here."
              : storage.persisted === true
                ? "Storage is marked persistent (won't be auto-cleared under storage pressure)."
                : "Storage isn't marked persistent yet — see \"Storage & encryption\" above to request it."}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">By category</p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading && !stats ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {EXPORT_CATEGORIES.map((cat) => {
            const s = stats?.categories?.[cat.id];
            const isBusy = busyCatId === cat.id;
            return (
              <div key={cat.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-border/40">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{resolveCatLabel(cat, terms)}</p>
                  <p className="text-[0.6875rem] text-muted-foreground truncate">
                    {s ? `${s.count} record${s.count === 1 ? "" : "s"} · ${fmtKB(s.sizeKB)}` : "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleExport(cat)}
                  disabled={isBusy || !s?.count}
                  title={`Export just "${resolveCatLabel(cat, terms)}"`}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-30 transition-colors"
                >
                  {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCat(cat)}
                  disabled={isBusy || !s?.count}
                  title={`Delete "${resolveCatLabel(cat, terms)}"`}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-30 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {stats?.deviceBound && Object.values(stats.deviceBound).some((d) => d.count > 0) && (
        <div className="space-y-1 pt-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">This device only</p>
          <p className="text-[0.6875rem] text-muted-foreground leading-snug">
            Tied to this device/browser — intentionally not included in backups or exports, to avoid impersonation or collisions if restored onto a different device.
          </p>
          <div className="space-y-1">
            {stats.deviceBound.FriendIdentity?.count > 0 && (
              <p className="text-xs text-muted-foreground">Friends identity · {stats.deviceBound.FriendIdentity.count} record</p>
            )}
            {stats.deviceBound.PushSubscription?.count > 0 && (
              <p className="text-xs text-muted-foreground">Push notification registration · {stats.deviceBound.PushSubscription.count} record</p>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={!!confirmCat} onOpenChange={(open) => !open && setConfirmCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{confirmCat ? resolveCatLabel(confirmCat, terms) : ""}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {confirmCat ? (stats?.categories?.[confirmCat.id]?.count ?? 0) : 0} record(s) — {confirmCat ? resolveCatDesc(confirmCat, terms) : ""} — from this device. A backup of just this category is saved to your device first; if that backup fails, nothing is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirmed} className="bg-destructive hover:bg-destructive/90">
              Back up &amp; delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
