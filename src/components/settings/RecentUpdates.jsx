import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { CHANGELOG } from "@/lib/changelog";
import { APP_VERSION } from "@/lib/appVersion";

const TYPE_STYLES = {
  feature: { dot: "bg-primary", label: "New", labelCls: "text-primary bg-primary/10" },
  improve: { dot: "bg-blue-500", label: "Improved", labelCls: "text-blue-600 bg-blue-500/10" },
  fix:     { dot: "bg-green-500", label: "Fixed", labelCls: "text-green-600 bg-green-500/10" },
  hotfix:  { dot: "bg-muted-foreground", label: null, labelCls: "" },
};

const INITIAL_SHOW = 2;

export default function RecentUpdates() {
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? CHANGELOG : CHANGELOG.slice(0, INITIAL_SHOW);

  return (
    <div className="space-y-4">
      {visible.map((release, ri) => {
        // The last version published on this date. The current (top) block
        // isn't stamped — it shows the live APP_VERSION so today's releases
        // don't each need a manual bump; older blocks carry the frozen
        // version they ended the day on (stamped when a new date rolls over).
        const ver = release.version || (ri === 0 ? APP_VERSION : null);
        return (
        <div key={ri}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
            <span>{release.date}</span>
            {ver && (
              <span className="font-mono normal-case tracking-normal text-[0.625rem] text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted/60">v{ver}</span>
            )}
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
        );
      })}

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
