import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Monitor, FolderOpen, Usb, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isDesktop, getDesktopInfo } from "@/lib/platform";
import { getSyncAdapter } from "@/lib/syncAdapters";
import { pickSyncFolder, listSyncPeers, pairSystem, runSync } from "@/lib/deviceSyncRunner";

// Desktop-only first-run notice, rendered at the top of the onboarding
// screen (StorageModeSetup).
//
// Why it exists: Chromium keys IndexedDB by origin, and the desktop shell
// runs on its own origin (symphony://app — see electron/main.cjs). So a
// user who has been using the web or phone app opens the desktop app to a
// completely empty database. Nothing is lost, but it LOOKS like everything
// is, and the onboarding screen alone doesn't say why.
//
// Two ways out, and the USB one is first on purpose: if the other device
// is right there on a cable, making the user export a file, find it, and
// import it is three steps of busywork for something sync already does.
//
// `prepare` is StorageModeSetup's setupLocalStorage — a database has to
// exist before anything can be merged into it. Pairing is implicit here:
// choosing a folder to pull from IS the confirmation, so the usual
// "another device is using a different system" prompt would just be a
// second question about a decision already made.

export default function DesktopFirstRunNotice({ onImport, prepare, onDone }) {
  const [busy, setBusy] = useState(false);
  if (!isDesktop()) return null;
  const info = getDesktopInfo();
  const adapter = getSyncAdapter();

  const handleSyncFromDevice = async () => {
    setBusy(true);
    try {
      const folder = await pickSyncFolder();
      if (!folder) return;

      const peers = (await listSyncPeers()).filter((p) => !p.isSelf);
      if (!peers.length) {
        toast.error("No other device's data in that folder. On the other device, open Settings → Data & privacy → Sync between devices and press Sync once.");
        return;
      }

      // The database must exist before a merge can land in it.
      if (prepare && !(await prepare())) return;

      // Choosing the folder is the pairing — but only with the system each
      // device is using NOW. A device can leave an older system's snapshot
      // behind (e.g. from before a reinstall); pairing every system found
      // would blend that old one into this fresh install too.
      const newestPerDevice = new Map();
      for (const p of peers) {
        if (!p.systemId || !p.data) continue;
        const cur = newestPerDevice.get(p.deviceId);
        if (!cur || (p.data.mtimeMs || 0) > (cur.data.mtimeMs || 0)) newestPerDevice.set(p.deviceId, p);
      }
      for (const p of newestPerDevice.values()) pairSystem(p.systemId);
      const report = await runSync({ force: true });

      if (!report.merged.length) {
        const why = report.errors[0]?.message;
        toast.error(why || "Nothing could be read from that folder.");
        return;
      }
      toast.success(`Brought your data over from ${report.merged[0].name}. Starting up…`);
      // Reload rather than continuing in place: a pull merges the whole
      // database, and several boot-time caches (terms, systems registry)
      // read it once. Same thing the backup importer does after a restore.
      // Appearance does NOT come along (the desktop keeps its own look —
      // see src/lib/syncLook.js); "Use another device's appearance" in the
      // sync panel copies it on request.
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast.error(e?.message || "Couldn't sync from that device.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Monitor className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <h3 className="font-semibold leading-tight">The desktop app has its own database</h3>
          <p className="text-xs text-muted-foreground">
            Your phone and browser data isn&apos;t here yet. Bring it over below —
            nothing on your other devices is changed or removed by doing this.
          </p>
        </div>
      </div>

      {adapter.available && (
        <Button type="button" onClick={handleSyncFromDevice} disabled={busy} className="w-full gap-1.5" size="sm">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Usb className="w-3.5 h-3.5" />}
          Sync from another device
        </Button>
      )}

      <Button type="button" onClick={onImport} disabled={busy} variant={adapter.available ? "outline" : "default"} className="w-full" size="sm">
        Import a backup file
      </Button>

      {adapter.available && (
        <p className="text-[0.6875rem] text-muted-foreground">
          Plug your phone in, then pick its <span className="font-medium">Documents/OceansSymphony</span> folder.
          Sync once on the phone first so there is something to read.
        </p>
      )}

      {info?.dataPath ? (
        <div className="flex items-center gap-2 pt-1">
          <code className="flex-1 min-w-0 truncate text-[11px] text-muted-foreground font-mono" title={info.dataPath}>
            {info.dataPath}
          </code>
          <Button
            type="button" variant="ghost" size="sm" className="h-7 px-2 flex-shrink-0"
            onClick={() => info.openDataFolder?.()}
            aria-label="Open the folder this app stores its data in"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
