import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, UserCheck, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";

// Default behaviour for the quick front action — tapping or swiping an
// alter to front them from the alters list / dashboard (NOT the explicit
// "Set Fronters" picker, which always multi-selects). Stored on
// SystemSettings.set_front_mode and read in toggleFrontFor.
export default function FrontingBehaviorSettings() {
  const qc = useQueryClient();
  const t = useTerms();
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = list?.[0] || null;
  const current = settings?.set_front_mode === "replace" ? "replace" : "cofront";
  const [saving, setSaving] = useState(false);

  const OPTIONS = [
    {
      id: "cofront",
      label: `Add as co-${t.fronter}`,
      desc: `Tapping an ${t.alter} adds them to the ${t.front} alongside anyone already ${t.fronting}.`,
      Icon: Users,
    },
    {
      id: "replace",
      label: `Replace the ${t.front}`,
      desc: `Tapping an ${t.alter} makes them the only one ${t.fronting} and ends everyone else. Best if your ${t.system} doesn't co-${t.front}.`,
      Icon: UserCheck,
    },
  ];

  const choose = async (mode) => {
    if (mode === current || saving) return;
    setSaving(true);
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, { set_front_mode: mode });
      } else {
        await base44.entities.SystemSettings.create({ set_front_mode: mode });
      }
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Default {t.front} action</CardTitle>
            <CardDescription>
              What happens when you tap or swipe an {t.alter} to {t.front} them from the {t.alters} list or dashboard. The “Set {t.Front}ers” screen always lets you pick everyone explicitly, whichever you choose here.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2">
        {OPTIONS.map((opt) => {
          const selected = current === opt.id;
          const { Icon } = opt;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => choose(opt.id)}
              disabled={saving}
              aria-pressed={selected}
              className={`text-left rounded-xl border px-3 py-3 transition-colors flex items-start gap-3 ${
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border/50 hover:border-border bg-card hover:bg-muted/30"
              }`}
            >
              <Icon className="w-6 h-6 text-foreground/80 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-foreground">{opt.label}</p>
                  {selected && <Check className="w-3.5 h-3.5 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
