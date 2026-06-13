import { useState, useEffect } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { CHANGELOG } from "@/lib/changelog";
import { Button } from "@/components/ui/button";
import {
  isChangelogInstalled,
  installChangelog,
  OPTIONAL_CONTENT_EVENT,
} from "@/lib/optionalContent";
import { toast } from "sonner";

const TYPE_STYLES = {
  feature: { dot: "bg-primary", label: "New", labelCls: "text-primary bg-primary/10" },
  improve: { dot: "bg-blue-500", label: "Improved", labelCls: "text-blue-600 bg-blue-500/10" },
  fix:     { dot: "bg-green-500", label: "Fixed", labelCls: "text-green-600 bg-green-500/10" },
  hotfix:  { dot: "bg-muted-foreground", label: null, labelCls: "" },
};

const INITIAL_SHOW = 2;

export default function RecentUpdates() {
  const [expanded, setExpanded] = useState(false);
  // The changelog is an OPTIONAL add-on, default OFF. When it isn't
  // installed we show a short note + Install button instead of the list.
  // The main on/off toggle lives in Settings → Appearance → Optional
  // add-ons; this surface stays in sync via OPTIONAL_CONTENT_EVENT.
  const [installed, setInstalled] = useState(() => isChangelogInstalled());
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const onChange = () => setInstalled(isChangelogInstalled());
    window.addEventListener(OPTIONAL_CONTENT_EVENT, onChange);
    return () => window.removeEventListener(OPTIONAL_CONTENT_EVENT, onChange);
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await installChangelog();
      setInstalled(true);
      toast.success("Changelog enabled");
    } catch {
      toast.error("Couldn't enable the changelog");
    } finally {
      setInstalling(false);
    }
  };

  const visible = expanded ? CHANGELOG : CHANGELOG.slice(0, INITIAL_SHOW);

  if (!installed) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          The changelog and the dashboard "What's new" bar are an optional add-on, off by default to keep the app lean. Turn it on to see recent updates here. You can also manage it under Appearance → Optional add-ons.
        </p>
        <Button onClick={handleInstall} disabled={installing} className="gap-2">
          {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {installing ? "Enabling…" : "Enable changelog"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
    </div>
  );
}
