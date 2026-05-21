import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Square, Squircle, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CORNER_MODES, DEFAULT_CORNER_MODE } from "@/lib/useCornerMode";

const OPTIONS = [
  {
    id: CORNER_MODES.ROUNDED,
    label: "Rounded",
    desc: "Soft rounded corners on cards, buttons, inputs, and pills.",
    PreviewIcon: Squircle,
  },
  {
    id: CORNER_MODES.SHARP,
    label: "Sharp",
    desc: "Squared-off corners. Circular elements like avatars stay round.",
    PreviewIcon: Square,
  },
];

export default function CornerStyleSettings() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = list?.[0] || null;
  const current = settings?.corner_mode === CORNER_MODES.SHARP ? CORNER_MODES.SHARP : DEFAULT_CORNER_MODE;
  const [saving, setSaving] = useState(false);

  const choose = async (mode) => {
    if (mode === current || saving) return;
    setSaving(true);
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, { corner_mode: mode });
      } else {
        await base44.entities.SystemSettings.create({ corner_mode: mode });
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
            <Squircle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Corner style</CardTitle>
            <CardDescription>
              Make every card, button, input, and pill rounded or sharp. Avatars and other intentionally circular elements stay round either way.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {OPTIONS.map((opt) => {
          const selected = current === opt.id;
          const { PreviewIcon } = opt;
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
              <PreviewIcon className="w-6 h-6 text-foreground/80 flex-shrink-0" />
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
