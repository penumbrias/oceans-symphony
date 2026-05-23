import React from "react";
import { Eye, X } from "lucide-react";
import { usePreviewMode } from "@/lib/usePreviewMode";
import { exitPreview } from "@/lib/previewMode";
import { APP_VERSION } from "@/lib/appVersion";
import { WIKI_CONTENT_VERSION } from "@/lib/previewWiki";

// Loose semver compare — returns negative if a < b, 0 if equal, positive
// if a > b. Tolerates pre-release suffixes and missing patch numbers by
// padding with zeros. Used to detect a stale wiki banner.
function cmpVersion(a, b) {
  const toNums = (s) => String(s || "").split(/[.\-+]/).map((p) => Number(p) || 0);
  const av = toNums(a);
  const bv = toNums(b);
  const n = Math.max(av.length, bv.length);
  for (let i = 0; i < n; i++) {
    const ai = av[i] || 0;
    const bi = bv[i] || 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

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
      style={{
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <div className="max-w-5xl mx-auto px-3 py-2 flex items-center gap-2 text-xs sm:text-sm">
        <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-amber-700 dark:text-amber-300">Preview Mode</span>
          <span className="text-muted-foreground hidden sm:inline"> — viewing the example system </span>
          <span className="text-muted-foreground sm:hidden"> · </span>
          <span className="font-medium text-foreground truncate">{system.name}</span>
          <span className="text-muted-foreground hidden md:inline">. Your real data is untouched.</span>
          {isWiki && (() => {
            // The wiki bios are hardcoded in previewWiki.js and only
            // get refreshed when someone actually edits them — NOT on
            // every APP_VERSION bump. So compare the two; if the wiki
            // content is older than the app, flag it as stale rather
            // than falsely claiming "up to date".
            const cmp = cmpVersion(WIKI_CONTENT_VERSION, APP_VERSION);
            if (cmp >= 0) {
              return (
                <span className="ml-2 text-[0.625rem] font-mono text-amber-700/80 dark:text-amber-300/80">
                  walkthrough up to date with v{APP_VERSION}
                </span>
              );
            }
            return (
              <span className="ml-2 text-[0.625rem] font-mono text-amber-700 dark:text-amber-300" title={`Wiki bios last refreshed for v${WIKI_CONTENT_VERSION}; you're on v${APP_VERSION}. New features may not be documented here yet.`}>
                last refreshed for v{WIKI_CONTENT_VERSION} · you're on v{APP_VERSION} (some new features may be missing)
              </span>
            );
          })()}
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
