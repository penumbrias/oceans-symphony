import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Tag } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { ALTER_LABEL_MODES, DEFAULT_ALTER_LABEL_MODE } from "@/lib/alterLabel";
import { useAlterLabelMode } from "@/lib/useAlterLabel";

// Pill button that cycles the system-wide alter-label mode through
// name → alias → both → name. Persists to SystemSettings.alter_label_mode
// (the same field Settings → Appearance → Alter labels writes). Anything
// using useAlterLabel() picks up the change immediately because both
// share the ["systemSettings"] react-query cache.
//
// Surfaced wherever lists of alters render names — the Alters grid, the
// Set Front modal, poll-vote breakdowns, etc. — so the user doesn't have
// to dive into Settings to flip the format.

const ORDER = [ALTER_LABEL_MODES.NAME, ALTER_LABEL_MODES.ALIAS, ALTER_LABEL_MODES.BOTH];
const SHORT_LABEL = {
  [ALTER_LABEL_MODES.NAME]: "Name",
  [ALTER_LABEL_MODES.ALIAS]: "Alias",
  [ALTER_LABEL_MODES.BOTH]: "Both",
};

export default function AlterLabelToggle({ className = "", size = "sm" }) {
  const qc = useQueryClient();
  const mode = useAlterLabelMode();
  const [busy, setBusy] = useState(false);

  const cycle = async () => {
    if (busy) return;
    const idx = ORDER.indexOf(mode);
    const next = ORDER[(idx + 1) % ORDER.length] || DEFAULT_ALTER_LABEL_MODE;
    setBusy(true);
    try {
      const list = await base44.entities.SystemSettings.list();
      if (list[0]?.id) {
        await base44.entities.SystemSettings.update(list[0].id, { alter_label_mode: next });
      } else {
        await base44.entities.SystemSettings.create({ alter_label_mode: next });
      }
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) {
      toast.error(e?.message || "Couldn't change label mode");
    } finally {
      setBusy(false);
    }
  };

  const sizing = size === "xs"
    ? "text-[0.625rem] h-6 px-1.5 gap-1"
    : "text-xs h-7 px-2 gap-1.5";

  return (
    <button
      type="button"
      onClick={cycle}
      disabled={busy}
      aria-label={`Alter label mode: ${SHORT_LABEL[mode]}. Tap to cycle.`}
      title={`Showing ${SHORT_LABEL[mode]} — tap to cycle (Name / Alias / Both)`}
      className={`inline-flex items-center rounded-full border border-border/60 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors ${sizing} ${className}`}
    >
      <Tag className={size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5"} />
      <span className="font-medium">{SHORT_LABEL[mode]}</span>
    </button>
  );
}
