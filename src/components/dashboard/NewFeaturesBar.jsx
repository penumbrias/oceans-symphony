import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { X, Sparkles } from "lucide-react";
import { CHANGELOG } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/appVersion";

// "What's new" strip on the dashboard. Shows the latest changelog
// date block whenever the user opens the app on a version they
// haven't seen yet. Dismissal stores the current APP_VERSION in
// localStorage — the bar reappears only when APP_VERSION advances
// past the stored value (i.e. the next release).
//
// Visibility is also governed by the Dashboard layout setting
// `new_features_bar` (the dashboard's layout-driven render skips
// this component entirely when that toggle is off). Inside this
// component we own the per-version dismissal.
const STORAGE_KEY = "symphony_whats_new_seen_version";

const TYPE_ICON = {
  feature: "✨",
  improve: "↑",
  fix:     "🔧",
  hotfix:  "•",
};

export default function NewFeaturesBar() {
  // Start hidden so the bar doesn't flash in before the effect
  // resolves the user's dismissal state.
  const [dismissed, setDismissed] = useState(true);
  const [block, setBlock] = useState(null);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (seen === APP_VERSION) {
        setDismissed(true);
        return;
      }
      const top = CHANGELOG[0];
      if (!top || !Array.isArray(top.changes) || top.changes.length === 0) {
        setDismissed(true);
        return;
      }
      setBlock(top);
      setDismissed(false);
    } catch {
      // localStorage off (private mode / quota); silently skip the
      // bar rather than spamming the dashboard every load.
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(STORAGE_KEY, APP_VERSION); }
    catch { /* ignore — bar stays dismissed for this session */ }
  };

  if (dismissed || !block) return null;

  return (
    <div
      role="region"
      aria-label="What's new"
      className="mb-4 rounded-2xl border border-primary/30 bg-primary/5 p-4"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-primary">What's new in v{APP_VERSION}</p>
            <p className="text-[0.625rem] text-muted-foreground flex-shrink-0">{block.date}</p>
          </div>
          <ul className="space-y-1.5">
            {block.changes.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground leading-relaxed">
                <span className="text-[0.6875rem] flex-shrink-0 mt-px" aria-hidden="true">
                  {TYPE_ICON[c.type] || "•"}
                </span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
          <Link
            to="/settings#recent-updates"
            className="inline-block text-[0.6875rem] font-medium text-primary hover:underline"
          >
            See full changelog →
          </Link>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss What's new"
          className="text-muted-foreground hover:text-foreground p-1 -m-1 rounded-md flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
