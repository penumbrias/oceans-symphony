import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { requestPersistentStorage, getStorageState } from "@/lib/autoBackup";
import { isNative, getNativePlatform } from "@/lib/platform";
import { getMirrorStatus } from "@/lib/nativeMirror";

const NATIVE = isNative();
const IOS = NATIVE && getNativePlatform() === "ios";
const ICLOUD_KEY = "symphony_icloud_backup"; // read by ios/App/App/AppDelegate.swift

// iPhone: is the app's data part of the phone's iCloud backup? The person
// chooses (owner, 2026-10-01). iOS includes it by default; AppDelegate
// applies the choice at launch and whenever the app goes to the background.
function ICloudChoice() {
  const [value, setValue] = useState(null); // "include" | "exclude"
  useEffect(() => {
    (async () => {
      try {
        const { Preferences } = await import("@capacitor/preferences");
        const { value: v } = await Preferences.get({ key: ICLOUD_KEY });
        setValue(v === "exclude" ? "exclude" : "include");
      } catch { setValue("include"); }
    })();
  }, []);
  const choose = async (v) => {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key: ICLOUD_KEY, value: v });
      setValue(v);
      toast.success(v === "exclude" ? "Kept out of iCloud backups from now on" : "Included in iCloud backups");
    } catch { toast.error("Couldn't save that choice"); }
  };
  if (!value) return null;
  return (
    <div className="mt-2 rounded-lg border border-border/50 p-2 space-y-1.5">
      <p className="text-xs font-medium">iCloud backup of this iPhone</p>
      <p className="text-[0.6875rem] text-muted-foreground leading-snug">
        Included: your data is part of the phone's iCloud backup, so a new iPhone restored from it gets your data too — and it's stored with Apple. Kept on this phone: it never leaves the device; only backups you make yourself can bring it back.
      </p>
      <div className="flex gap-2">
        {[["include", "Include in iCloud"], ["exclude", "Keep on this phone"]].map(([v, label]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => choose(v)}
            className={`flex-1 text-xs px-2 py-1.5 rounded-lg border ${value === v ? "border-primary/60 bg-primary/10 text-primary font-semibold" : "border-border/50"}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function fmtBytes(n) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// "Is our storage eviction-resistant?" status + request button. Persistence
// is fundamentally a storage-safety concern (Storage & Encryption) but users
// also look for it next to the backup controls (Automatic backups), so this
// is a shared component mounted in both rather than picking one "correct"
// home and making the other point at it.
export default function PersistentStorageStatus() {
  const [storage, setStorage] = useState({ persisted: null, usage: null, quota: null });
  const [mirror, setMirror] = useState(() => (NATIVE ? getMirrorStatus() : null));

  useEffect(() => {
    getStorageState().then(setStorage).catch(() => {});
    if (!NATIVE) return undefined;
    const on = () => setMirror(getMirrorStatus());
    window.addEventListener("symphony-mirror-health", on);
    return () => window.removeEventListener("symphony-mirror-health", on);
  }, []);

  const handleRequest = async () => {
    const granted = await requestPersistentStorage();
    setStorage(await getStorageState());
    if (granted) toast.success("Storage marked persistent");
    else toast.error("Browser refused persistent storage");
  };

  if (NATIVE) {
    return (
      <div>
      <div className="flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          The app keeps your data in two places on this device: its working storage, and a copy in its own private files that's put back automatically if the working storage is ever cleared. Uninstalling the app or "Clear storage" in the phone's settings removes both, so keep a recent backup — it's the only thing that survives those.
          {storage.usage != null && (
            <> Using ~{fmtBytes(storage.usage)}{storage.quota ? ` of ${fmtBytes(storage.quota)}` : ""}.</>
          )}
          {mirror && (mirror.consecutive > 0
            ? <span className="block mt-1 text-destructive font-medium">The private-files copy isn't saving right now ({mirror.lastError}). Your data is still saved in working storage — back up now to be safe.</span>
            : mirror.lastWriteAt
              ? <span className="block mt-1">Private-files copy last updated {new Date(mirror.lastWriteAt).toLocaleString()}.</span>
              : null)}
        </p>
      </div>
      {IOS && <ICloudChoice />}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        {storage.persisted === true ? (
          <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
        ) : (
          <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium">
            Storage persistence: {storage.persisted === true ? "Granted" : storage.persisted === false ? "Not granted" : "Unknown"}
          </p>
          <p className="text-[0.6875rem] text-muted-foreground mt-0.5">
            {storage.persisted === true
              ? "The browser has marked this app's storage as persistent — it won't be evicted by background cleanup."
              : "The browser hasn't marked this app's storage as persistent yet. Installed PWAs / TWAs usually get this automatically; web tabs need to earn user engagement first."}
            {storage.usage != null && (
              <> Currently using ~{fmtBytes(storage.usage)}{storage.quota ? ` of ${fmtBytes(storage.quota)}` : ""}.</>
            )}
          </p>
        </div>
      </div>
      {storage.persisted !== true && (
        <Button onClick={handleRequest} variant="outline" size="sm">
          Request persistent storage
        </Button>
      )}
    </div>
  );
}
