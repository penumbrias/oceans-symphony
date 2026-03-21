import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_SECTIONS = [
  { id: "emotions", emoji: "😊", title: "Emotions", subtitle: "Tap to log feelings", enabled: true },
  { id: "urges", emoji: "🆘", title: "Urges to", subtitle: "Rate the intensity", enabled: true },
  { id: "body_mind", emoji: "🌿", title: "Body + mind", subtitle: "Rate wellbeing", enabled: true },
  { id: "skills", emoji: "🧠", title: "Skills used", subtitle: "How many skills", enabled: true },
  { id: "medication", emoji: "💊", title: "Medication + safety", subtitle: "Rx meds + safety", enabled: true },
  { id: "notes", emoji: "📝", title: "Notes", subtitle: "Details + context", enabled: true },
  { id: "checklist", emoji: "🔲", title: "Symptoms Checklist", subtitle: "Symptoms, habits & more", enabled: true },
];

export default function DiaryCardPresetsManager() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState(DEFAULT_SECTIONS);

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });

  const settings = settingsList[0] || null;

  useEffect(() => {
    if (settings?.diary_sections) {
      setSections(settings.diary_sections);
    }
  }, [settings]);

  const handleToggle = (id) => {
    setSections(prev =>
      prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)
    );
  };

  const handleEdit = (id, field, value) => {
    setSections(prev =>
      prev.map(s => s.id === id ? { ...s, [field]: value } : s)
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, {
          diary_sections: sections,
        });
      } else {
        await base44.entities.SystemSettings.create({
          diary_sections: sections,
        });
      }
      toast.success("Diary card sections saved!");
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (error) {
      toast.error("Failed to save settings");
    }
    setSaving(false);
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Customize Diary Cards</CardTitle>
            <CardDescription>Choose which sections appear and customize their labels</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {sections.map((section) => (
            <div
              key={section.id}
              className={`p-4 border rounded-xl transition-all ${
                section.enabled
                  ? "bg-card border-border/50"
                  : "bg-muted/30 border-border/30 opacity-60"
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => handleToggle(section.id)}
                  className="mt-1 flex-shrink-0"
                >
                  {section.enabled ? (
                    <Eye className="w-4 h-4 text-primary" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>

                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{section.emoji}</span>
                    <Input
                      value={section.title}
                      onChange={(e) => handleEdit(section.id, "title", e.target.value)}
                      disabled={!section.enabled}
                      className="text-sm font-medium h-8"
                      placeholder="Section title"
                    />
                  </div>
                  <Input
                    value={section.subtitle}
                    onChange={(e) => handleEdit(section.id, "subtitle", e.target.value)}
                    disabled={!section.enabled}
                    className="text-xs h-8"
                    placeholder="Subtitle/description"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-primary hover:bg-primary/90"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : null}
          Save Changes
        </Button>
      </CardContent>
    </Card>
  );
}