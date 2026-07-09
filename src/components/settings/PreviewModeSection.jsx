import React, { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PREVIEW_SYSTEMS, enterPreview, exitPreview } from "@/lib/previewMode";
import { usePreviewMode } from "@/lib/usePreviewMode";
import { useTerms } from "@/lib/useTerms";

export default function PreviewModeSection() {
  const terms = useTerms();
  const { active, system: activeSystem } = usePreviewMode();
  const [busyKey, setBusyKey] = useState(null);

  const handleEnter = async (key) => {
    setBusyKey(key);
    try {
      await enterPreview(key);
      toast.success("Preview Mode on", {
        description: "Your real data is hidden but untouched. Look around.",
      });
    } catch (e) {
      toast.error("Couldn't start preview", { description: String(e) });
    } finally {
      setBusyKey(null);
    }
  };

  const handleExit = async () => {
    setBusyKey("__exit__");
    try {
      await exitPreview();
      toast.success("Preview Mode off", { description: "Your real data is back." });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4 space-y-2 text-sm">
        <p className="font-semibold text-foreground flex items-center gap-1.5">
          <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          What is Preview Mode?
        </p>
        <p className="text-muted-foreground">
          Preview Mode drops you into a guided example — the whole app filled with realistic data so
          you can actually try every section. <strong>Your real data is never touched</strong>; it's
          just hidden while preview is on, and anything you change while previewing disappears the
          moment you exit.
        </p>
        <p className="text-muted-foreground">
          In the example, each {terms.alter} profile is a short walkthrough of one feature — open them
          from the {terms.Alters} page to read at your own pace. A few double as design showcases that
          flex what the profile editor can produce (animation, gradients, custom fields, per-{terms.alter}
          themes) — long-press one on the dashboard to make it primary and watch the whole app recolour.
        </p>
      </div>

      <div className="space-y-3">
        {PREVIEW_SYSTEMS.map((sys) => {
          const isThisActive = active && activeSystem?.key === sys.key;
          const isBusy = busyKey === sys.key;
          return (
            <div
              key={sys.key}
              className={`rounded-xl border p-3 sm:p-4 transition-colors ${
                isThisActive
                  ? "border-amber-500/60 bg-amber-500/10"
                  : "border-border/60 bg-card"
              }`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{sys.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Uses: <span className="font-mono">{sys.termsLabel}</span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{sys.blurb}</p>
                </div>
                <div className="flex-shrink-0">
                  {isThisActive ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleExit}
                      disabled={busyKey !== null}
                      className="gap-1.5"
                    >
                      {busyKey === "__exit__" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5" />
                      )}
                      Exit Preview
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleEnter(sys.key)}
                      disabled={busyKey !== null}
                      className="gap-1.5"
                    >
                      {isBusy ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      Try Preview
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {active && (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          Preview Mode is currently <strong className="text-foreground">on</strong>. Tap
          <strong> Exit Preview</strong> (also available in the banner at the top of every page) to
          return to your real data.
        </div>
      )}
    </div>
  );
}
