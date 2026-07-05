import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, ImageDown, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { localizeRemoteImages } from "@/lib/localizeRemoteImages";

// "Save remote images to this device" — the retroactive fix for imported
// avatars that were stored as remote CDN URLs (mostly Simply Plural) and
// vanish when that server goes down. Downloads every still-reachable remote
// image into local storage so it survives forever. See localizeRemoteImages.js.
export default function RemoteImageRescue() {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // {done,total}
  const [result, setResult] = useState(null);     // {scanned,localized,failed}

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    setProgress({ done: 0, total: 1 });
    try {
      const res = await localizeRemoteImages({
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setResult(res);
      // Refresh everything that renders an avatar.
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      if (res.localized > 0 && res.failed === 0) {
        toast.success(`Saved ${res.localized} image${res.localized === 1 ? "" : "s"} to this device — they're safe now.`);
      } else if (res.localized > 0) {
        toast.success(`Saved ${res.localized} image${res.localized === 1 ? "" : "s"}; ${res.failed} couldn't be reached.`);
      } else if (res.scanned === 0) {
        toast.info("No remote images to save — everything's already stored locally.");
      } else {
        toast.warning("Couldn't reach any of the remote images to save them.");
      }
    } catch (e) {
      toast.error(e?.message || "Something went wrong saving the images.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground leading-relaxed">
        {terms.Alters} imported from other apps (especially <span className="font-medium">Simply Plural</span>)
        sometimes keep their picture on the other app's server instead of on this device — so when that server
        goes offline, the picture disappears. This downloads every picture that's still reachable and saves it
        here permanently, so it can't vanish again.
      </p>
      <Button onClick={run} disabled={busy} variant="outline" className="w-full gap-2 justify-start h-auto py-2.5">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageDown className="w-4 h-4" />}
        <div className="text-left min-w-0">
          <p className="text-sm font-medium">
            {busy ? "Saving images…" : "Save remote images to this device"}
          </p>
          {busy && progress && (
            <p className="text-[0.6875rem] text-muted-foreground">
              Checking {terms.alters}… {progress.done}/{progress.total}
            </p>
          )}
        </div>
      </Button>

      {result && (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1.5 text-xs">
          {result.localized > 0 && (
            <p className="flex items-center gap-1.5 text-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
              Saved {result.localized} image{result.localized === 1 ? "" : "s"} to this device.
            </p>
          )}
          {result.failed > 0 && (
            <div className="flex items-start gap-1.5 text-muted-foreground">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              <span>
                {result.failed} image{result.failed === 1 ? "" : "s"} couldn't be reached — the server they were
                on is likely offline. Those can't be recovered here; you can set a new picture, or re-import from an
                OpenPlural (.zip) or Ampersand (.ampar) export, which carry the actual image files.
              </span>
            </div>
          )}
          {result.localized === 0 && result.failed === 0 && (
            <p className="text-muted-foreground">Nothing to do — all pictures are already saved on this device.</p>
          )}
        </div>
      )}
    </div>
  );
}
