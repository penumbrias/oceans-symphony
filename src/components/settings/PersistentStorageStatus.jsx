import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { requestPersistentStorage, getStorageState } from "@/lib/autoBackup";
import { isNative } from "@/lib/platform";

const NATIVE = isNative();

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

  useEffect(() => {
    getStorageState().then(setStorage).catch(() => {});
  }, []);

  const handleRequest = async () => {
    const granted = await requestPersistentStorage();
    setStorage(await getStorageState());
    if (granted) toast.success("Storage marked persistent");
    else toast.error("Browser refused persistent storage");
  };

  if (NATIVE) {
    return (
      <div className="flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          This is the installed app's own storage — more durable than a browser tab, but it can still be wiped by "Clear storage" in Android app settings or by device-cleaner apps. Keep a recent backup as your safety net; it's the only thing that survives a storage wipe.
          {storage.usage != null && (
            <> Using ~{fmtBytes(storage.usage)}{storage.quota ? ` of ${fmtBytes(storage.quota)}` : ""}.</>
          )}
        </p>
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
