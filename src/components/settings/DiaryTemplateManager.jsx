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

    </Card>
  );
}