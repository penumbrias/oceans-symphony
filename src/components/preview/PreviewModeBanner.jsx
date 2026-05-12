import React from "react";
import { Eye, X } from "lucide-react";
import { usePreviewMode } from "@/lib/usePreviewMode";
import { exitPreview } from "@/lib/previewMode";
import { APP_VERSION } from "@/lib/appVersion";

// Persistent top banner shown whenever Preview Mode is active. Makes it
// impossible to confuse demo data with real user data, gives a one-tap
// exit path, and (for the wiki-style preview system) shows which app
// version the walkthrough text was written against. Renders nothing
// when Preview Mode is off.
export default function PreviewModeBanner() {
  const { active, system } = usePreviewMode();
  if (!active || !system) return null;
  // The wiki preset uses its alter profiles as a feature walkthrough;
  // the rest of the preview systems are just curated example data. Only
  // show the "up to date with vX.Y.Z" tag for the wiki system.
  const isWiki = system?.key === "wiki" || system?.wiki === true;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-amber-500/15 border-b border-amber-500/40"
    >
      <div className="max-w-5xl mx-auto px-3 py-2 flex items-center gap-2 text-xs sm:text-sm">
        <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-amber-700 dark:text-amber-300">Preview Mode</span>
          <span className="text-muted-foreground hidden sm:inline"> — viewing the example system </span>
          <span className="text-muted-foreground sm:hidden"> · </span>
          <span className="font-medium text-foreground truncate">{system.name}</span>
          <span className="text-muted-foreground hidden md:inline">. Your real data is untouched.</span>
          {isWiki && (
            <span className="ml-2 text-[0.625rem] font-mono text-amber-700/80 dark:text-amber-300/80">
              walkthrough up to date with v{APP_VERSION}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => exitPreview()}
          className="flex-shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 transition-colors"
        >
          <X className="w-3 h-3" />
          Exit
        </button>
      </div>
    </div>
  );
}
