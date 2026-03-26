/**
 * DiaryTemplateManager — Lets users configure section labels, order, and visibility.
 * Data_keys are NEVER shown to users and are never editable — analytics safety.
 */
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ClipboardList, ChevronUp, ChevronDown, Save } from "lucide-react";
import { DEFAULT_DIARY_TEMPLATE, getActiveTemplate } from "@/lib/diaryCardTemplate";
import { toast } from "sonner";

export default function DiaryTemplateManager({ settings }) {
  const qc = useQueryClient();
  const [sections, setSections] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const template = getActiveTemplate(settings);
    setSections(template.sections.map((s, i) => ({ ...s, order: i })));
  }, [settings?.id]);

  const updateSection = (id, changes) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...changes } : s)));
  };

  const moveSection = (id, dir) => {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((s, i) => ({ ...s, order: i }));
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const schema = {
      sections: sections.map((s) => ({
        id: s.id,
        label: s.label,
        emoji: s.emoji,
        subtitle: s.subtitle,
        enabled: s.enabled,
        order: s.order,
        fields: s.fields?.map((f) => ({ id: f.id, label: f.label, emoji: f.emoji, enabled: f.enabled })),
      })),
    };
    const data = { diary_sections_schema: schema };
    if (settings?.id) {
      await base44.entities.SystemSettings.update(settings.id, data);
    } else {
      await base44.entities.SystemSettings.create(data);
    }
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
    setSaving(false);
    toast.success("Diary template saved");
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">Diary Card Template</CardTitle>
            <CardDescription>Configure sections, labels, and visibility. Analytics always work regardless of label changes.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sections.map((section, idx) => (
          <div key={section.id} className="rounded-xl border border-border/60 p-3 space-y-2 bg-card">
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveSection(section.id, -1)}
                  disabled={idx === 0}
                  className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => moveSection(section.id, 1)}
                  disabled={idx === sections.length - 1}
                  className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="text-lg">{section.emoji}</span>
              <div className="flex-1 min-w-0">
                <Input
                  value={section.label}
                  onChange={(e) => updateSection(section.id, { label: e.target.value })}
                  className="h-7 text-sm font-medium"
                />
              </div>
              <Switch
                checked={section.enabled}
                onCheckedChange={(v) => updateSection(section.id, { enabled: v })}
              />
            </div>
            {section.fields && section.fields.length > 0 && (
              <div className="ml-9 space-y-1.5 pt-1 border-t border-border/40">
                {section.fields.map((field) => (
                  <div key={field.id} className="flex items-center gap-2">
                    <span className="text-sm flex-shrink-0">{field.emoji}</span>
                    <Input
                      value={field.label}
                      onChange={(e) => {
                        const updated = section.fields.map((f) =>
                          f.id === field.id ? { ...f, label: e.target.value } : f
                        );
                        updateSection(section.id, { fields: updated });
                      }}
                      className="h-6 text-xs flex-1"
                    />
                    <Switch
                      checked={field.enabled !== false}
                      onCheckedChange={(v) => {
                        const updated = section.fields.map((f) =>
                          f.id === field.id ? { ...f, enabled: v } : f
                        );
                        updateSection(section.id, { fields: updated });
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <Button onClick={handleSave} disabled={saving} size="sm" className="bg-primary hover:bg-primary/90 mt-2">
          {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Template</>}
        </Button>
      </CardContent>
    </Card>
  );
}