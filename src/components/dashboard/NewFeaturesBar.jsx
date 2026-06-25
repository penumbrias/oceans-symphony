import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { X, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { CHANGELOG } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/appVersion";

// "What's new" strip on the dashboard. Shows the latest changelog
// date block whenever the user opens the app on a version they
// haven't seen yet. Dismissal stores the current APP_VERSION in
// localStorage — the bar reappears only when APP_VERSION advances
// past the stored value (i.e. the next release).
//
// "Show older changes" progressively reveals older date blocks. The
// changelog is filtered down to user-relevant entry types (feature
// / improve / fix); hotfixes are excluded since they're internal /
// "keep text brief" by spec. Blocks that filter down to nothing are
// skipped entirely, so the user can't end up clicking "show older"
// and getting a card with zero rows.
//
// Visibility is also governed by the Dashboard layout setting
// `new_features_bar` (the dashboard's layout-driven render skips
// this component entirely when that toggle is off). Inside this
// component we own the per-version dismissal.
const STORAGE_KEY = "symphony_whats_new_seen_version";

const VISIBLE_TYPES = new Set(["feature", "improve", "fix"]);

const TYPE_ICON = {
  feature: "✨",
  improve: "↑",
  fix:     "🔧",
};

export default function NewFeaturesBar() {
  // Start hidden so the bar doesn't flash in before the effect
  // resolves the user's dismissal state.
  const [dismissed, setDismissed] = useState(true);
  const [block, setBlock] = useState(null);
  // The bar opens as a slim banner that just says "What's new in
  // vX.Y.Z" plus the entry count — the user expands it to read.
  // Keeps the dashboard quiet for users who don't care.
  const [expanded, setExpanded] = useState(false);
  // Number of OLDER date blocks the user has chosen to reveal in
  // addition to the headline (most-recent) block. Reset every mount.
  const [extraBlocks, setExtraBlocks] = useState(0);

  // Pre-filter the whole changelog once: drop hotfixes, drop empty
  // blocks. The order is preserved (newest first).
  const filteredChangelog = useMemo(() => {
    return (CHANGELOG || [])
      .map((entry) => ({
        ...entry,
        changes: (entry.changes || []).filter((c) => VISIBLE_TYPES.has(c.type)),
      }))
      .filter((entry) => entry.changes.length > 0);
  }, []);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (seen === APP_VERSION) {
        setDismissed(true);
        return;
      }
      const top = filteredChangelog[0];
      if (!top) {
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
  }, [filteredChangelog]);

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(STORAGE_KEY, APP_VERSION); }
    catch { /* ignore — bar stays dismissed for this session */ }
  };

  if (dismissed || !block) return null;

  // Older blocks revealed via "Show older changes". Slice picks up
  // starting at index 1 (the second-most-recent block) since index 0
  // is the headline rendered separately above.
  const olderBlocks = filteredChangelog.slice(1, 1 + extraBlocks);
  const hasMoreOlder = extraBlocks + 1 < filteredChangelog.length;
  const changeCount = block.changes.length;

  return (
    <div
      role="region"
      aria-label="What's new"
      className="mb-4 rounded-2xl border border-primary/30 bg-primary/5 overflow-hidden"
    >
      {/* Banner — always rendered. Tap to toggle expand/collapse;
          X dismisses entirely. Keeps the dashboard quiet by default
          but the visual cue ("What's new") still reads from across
          the page. */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse What's new" : "Expand What's new"}
          className="flex-1 flex items-center gap-2 text-left min-w-0"
        >
          <Sparkles className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
          <p className="text-sm font-semibold text-primary truncate">
            What's new in v{APP_VERSION}
          </p>
          <span className="text-[0.6875rem] text-muted-foreground flex-shrink-0">
            · {changeCount} {changeCount === 1 ? "change" : "changes"}
          </span>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-auto" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-auto" />}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss What's new"
          className="text-muted-foreground hover:text-foreground p-1 -m-1 rounded-md flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-primary/20">
          <div className="flex items-baseline justify-end gap-1.5 pt-2">
            <p className="text-[0.625rem] text-muted-foreground">{block.date}</p>
            {/* Most recent version released that day — the top block shows the
                live APP_VERSION (today's releases aren't individually stamped). */}
            <span className="font-mono text-[0.5625rem] text-muted-foreground/70 px-1 py-px rounded bg-muted/50">
              v{block.version || APP_VERSION}
            </span>
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

          {olderBlocks.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-primary/20">
              {olderBlocks.map((older, idx) => (
                <div key={`${older.date}-${idx}`} className="space-y-1.5">
                  <p className="text-[0.6875rem] font-semibold text-muted-foreground flex items-center gap-1.5">
                    <span>{older.date}</span>
                    {older.version && (
                      <span className="font-mono font-normal text-[0.5625rem] text-muted-foreground/70 px-1 py-px rounded bg-muted/50">v{older.version}</span>
                    )}
                  </p>
                  <ul className="space-y-1.5">
                    {older.changes.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-foreground/90 leading-relaxed">
                        <span className="text-[0.6875rem] flex-shrink-0 mt-px" aria-hidden="true">
                          {TYPE_ICON[c.type] || "•"}
                        </span>
                        <span>{c.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
            {hasMoreOlder ? (
              <button
                type="button"
                onClick={() => setExtraBlocks((n) => n + 3)}
                className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-primary hover:underline"
              >
                <ChevronDown className="w-3 h-3" />
                Show older changes
              </button>
            ) : (
              <span className="text-[0.6875rem] text-muted-foreground">No earlier user-visible changes.</span>
            )}
            <Link
              to="/settings#recent-updates"
              className="text-[0.6875rem] font-medium text-primary hover:underline"
            >
              See full changelog →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
