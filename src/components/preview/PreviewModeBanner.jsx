import React from "react";
import { Eye, X } from "lucide-react";
import { usePreviewMode } from "@/lib/usePreviewMode";
import { exitPreview } from "@/lib/previewMode";

// Persistent top banner shown whenever Preview Mode is active. Makes it
// impossible to confuse demo data with real user data and gives a one-tap
// exit path. Renders nothing when Preview Mode is off.
export default function PreviewModeBanner() {
  const { active, system } = usePreviewMode();
  if (!active || !system) return null;

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
