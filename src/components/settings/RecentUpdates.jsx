import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { CHANGELOG } from "@/lib/changelog";
import { Switch } from "@/components/ui/switch";
import { getShowChangelog, setShowChangelog } from "@/lib/changelogPref";

const TYPE_STYLES = {
  feature: { dot: "bg-primary", label: "New", labelCls: "text-primary bg-primary/10" },
  improve: { dot: "bg-blue-500", label: "Improved", labelCls: "text-blue-600 bg-blue-500/10" },
  fix:     { dot: "bg-green-500", label: "Fixed", labelCls: "text-green-600 bg-green-500/10" },
  hotfix:  { dot: "bg-muted-foreground", label: null, labelCls: "" },
};

const INITIAL_SHOW = 2;

export default function RecentUpdates() {
  const [expanded, setExpanded] = useState(false);
  const [showChangelog, setShow] = useState(() => getShowChangelog());

  // Keep in sync if the preference is changed elsewhere (e.g. another tab
  // / surface that also flips it).
  useEffect(() => {
    const onChange = (e) => setShow(e?.detail ? !!e.detail.enabled : getShowChangelog());
    window.addEventListener("changelog-pref-changed", onChange);
    return () => window.removeEventListener("changelog-pref-changed", onChange);
  }, []);

  const handleToggle = (next) => {
    setShow(next);
    setShowChangelog(next);
  };

  const visible = expanded ? CHANGELOG : CHANGELOG.slice(0, INITIAL_SHOW);

  return (
    <div className="space-y-4">
      {/* Opt-out toggle — turning this off hides the changelog list below.
          Default ON, so existing users see no change unless they opt out.
          The dashboard "What's new" bar is controlled separately via the
          dashboard layout settings. */}
      <label className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-card px-3 py-2.5">
        <span className="text-sm text-foreground">Show changelog &amp; what's new</span>
        <Switch checked={showChangelog} onCheckedChange={handleToggle} />
      </label>

      {!showChangelog ? (
        <p className="text-xs text-muted-foreground">
          The changelog is hidden. Turn it back on above to see recent updates here.
        </p>
      ) : (
        <>
          {visible.map((release, ri) => (
            <div key={ri}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {release.date}
              </p>
              <div className="space-y-2">
                {release.changes.map((c, ci) => {
                  const style = TYPE_STYLES[c.type] || TYPE_STYLES.hotfix;
                  return (
                    <div key={ci} className="flex items-start gap-2.5">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${style.dot}`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-foreground leading-snug">{c.text}</span>
                      </div>
                      {style.label && (
                        <span className={`flex-shrink-0 text-[0.625rem] font-semibold px-1.5 py-0.5 rounded-md ${style.labelCls}`}>
                          {style.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {CHANGELOG.length > INITIAL_SHOW && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
              {expanded ? "Show less" : `Show ${CHANGELOG.length - INITIAL_SHOW} older release${CHANGELOG.length - INITIAL_SHOW !== 1 ? "s" : ""}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
