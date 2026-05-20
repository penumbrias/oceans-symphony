import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tag, Check } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { ALTER_LABEL_MODES, DEFAULT_ALTER_LABEL_MODE, isAlterLabelMode } from "@/lib/alterLabel";

const OPTIONS = [
  {
    id: ALTER_LABEL_MODES.NAME,
    label: "Display name",
    sample: (a) => a.name,
    desc: "Show the full display name everywhere. Most distinguishable when alters share aliases.",
  },
  {
    id: ALTER_LABEL_MODES.ALIAS,
    label: "Alias only",
    sample: (a) => a.alias || a.name,
    desc: "Show the alias when one is set; falls back to the display name when blank.",
  },
  {
    id: ALTER_LABEL_MODES.BOTH,
    label: "Both",
    sample: (a) => (a.alias && a.alias !== a.name ? `${a.alias} — ${a.name}` : a.name),
    desc: "Show the alias and the display name together, in the form alias — name.",
  },
];

const SAMPLE = { name: "(,,,) | aleks < he >", alias: "aleks" };

export default function AlterLabelSettings() {
  const qc = useQueryClient();
  const terms = useTerms();
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = list?.[0] || null;
  const current = isAlterLabelMode(settings?.alter_label_mode)
    ? settings.alter_label_mode
    : DEFAULT_ALTER_LABEL_MODE;
  const [saving, setSaving] = useState(false);

  const choose = async (mode) => {
    if (mode === current || saving) return;
    setSaving(true);
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, { alter_label_mode: mode });
      } else {
        await base44.entities.SystemSettings.create({ alter_label_mode: mode });
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
            <Tag className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">{terms.Alter} labels in lists</CardTitle>
            <CardDescription>
              How {terms.alters} appear in dropdowns, pickers, mention popups, and other lists across the app.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {OPTIONS.map((opt) => {
          const selected = current === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => choose(opt.id)}
              disabled={saving}
              aria-pressed={selected}
              className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors flex items-start gap-3 ${
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border/50 hover:border-border bg-card hover:bg-muted/30"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  selected ? "border-primary bg-primary" : "border-border"
                }`}
              >
                {selected && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                <p className="text-xs text-muted-foreground/80 mt-1 font-mono truncate">
                  e.g. {opt.sample(SAMPLE)}
                </p>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
