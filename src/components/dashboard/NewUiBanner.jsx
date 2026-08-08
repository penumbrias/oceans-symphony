// The new home screen is opt-in and, until now, only discoverable by
// someone already poking around Settings. This says it exists once, on the
// classic dashboard, and gets out of the way permanently when dismissed.
//
// Never shown when the new UI is already on, and never re-shown after a
// dismissal (the flag rides backups, so it doesn't come back on a restore).

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { UI_V2_ENABLED } from "@/lib/featureFlags";

const DISMISS_KEY = "symphony_newui_banner_dismissed_v1";

export default function NewUiBanner() {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  const { data: rows = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const record = rows[0];
  const alreadyOn = record?.ui_v2?.enabled === true;

  if (!UI_V2_ENABLED || alreadyOn || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage off */ }
  };

  const turnOn = async () => {
    try {
      const next = { ...(record?.ui_v2 || {}), enabled: true };
      if (record?.id) await base44.entities.SystemSettings.update(record.id, { ui_v2: next });
      else await base44.entities.SystemSettings.create({ ui_v2: next });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      dismiss();
      toast.success("New home screen on — switch back any time in Settings");
    } catch (e) {
      toast.error(e?.message || "Couldn't switch");
    }
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 px-3 py-2.5 flex items-center gap-2.5">
      <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Build your own home screen</p>
        <p className="text-xs text-muted-foreground">
          Choose what's on it, where it sits and how it looks. Switch back any time.
        </p>
      </div>
      <button type="button" onClick={turnOn}
        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground flex-shrink-0">
        Try it
      </button>
      <button type="button" onClick={dismiss} aria-label="Dismiss"
        className="p-1 rounded-lg text-muted-foreground hover:text-foreground flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
