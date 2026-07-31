// System name + live date/clock as a homescreen widget. Mirrors the
// classic dashboard's fixed header block (Dashboard.jsx title row) but as
// a placeable card; the tap-to-switch affordance appears only with
// multiple systems, same as classic. The switcher dialog itself is hosted
// by Dashboard (api.openSystemSwitcher).

import React from "react";
import { ChevronsUpDown } from "lucide-react";

export default function SystemHeaderCard({ mode = "normal", api }) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const name = api?.systemName || "";
  const multi = !!api?.multiSystem;

  if (mode === "minimal") {
    return (
      <div className="px-3 py-2 rounded-xl border border-border/40 bg-card/50">
        <span className="font-display text-base font-semibold truncate block">{name}</span>
      </div>
    );
  }
  return (
    <div className="px-3 py-2.5">
      {multi ? (
        <button
          type="button"
          onClick={() => api?.openSystemSwitcher?.()}
          className="group inline-flex items-center gap-1.5 text-left"
        >
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-foreground">{name}</h1>
          <ChevronsUpDown className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors flex-shrink-0" />
        </button>
      ) : (
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-foreground">{name}</h1>
      )}
      <p className="text-muted-foreground mt-0.5 text-sm">
        {now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })} · {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </p>
    </div>
  );
}
