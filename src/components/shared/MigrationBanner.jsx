import { useState } from "react";
import { X, ExternalLink } from "lucide-react";

const DISMISSED_KEY = "migration_banner_dismissed_v1";

export default function MigrationBanner() {
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISSED_KEY));

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm">
      <span className="text-lg leading-none flex-shrink-0 mt-0.5">📦</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-amber-700 dark:text-amber-400">Coming from an older version?</p>
        <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-0.5 leading-relaxed">
          Missing your data? Your old version is still available at{" "}
          <a
            href="https://oceans-symphony.base44.app"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium hover:text-amber-700 dark:hover:text-amber-300 inline-flex items-center gap-0.5"
          >
            oceans-symphony.base44.app
            <ExternalLink className="w-3 h-3 inline" />
          </a>
          {" "}— export your data there and import it into this version via{" "}
          <span className="font-medium">Settings → Data &amp; Privacy</span>.
        </p>
      </div>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 p-0.5 rounded-md text-amber-600/60 hover:text-amber-700 dark:text-amber-400/60 dark:hover:text-amber-300 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
