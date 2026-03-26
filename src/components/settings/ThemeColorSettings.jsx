import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Palette, Save, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";

const THEME_PRESETS = [
  { name: "Purple", hue: "265" },
  { name: "Blue", hue: "200" },
  { name: "Green", hue: "150" },
  { name: "Pink", hue: "320" },
  { name: "Orange", hue: "30" },
  { name: "Red", hue: "0" },
];

export default function ThemeColorSettings({ settings }) {
  const queryClient = useQueryClient();
  const [customColor, setCustomColor] = useState(settings?.theme_primary_hue || "265");
  const [saving, setSaving] = useState(false);

  const handleSaveColor = async () => {
    setSaving(true);
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, { theme_primary_hue: customColor });
      } else {
        await base44.entities.SystemSettings.create({ theme_primary_hue: customColor });
      }
      // Update CSS variable
      document.documentElement.style.setProperty("--primary", `${customColor} 60% 55%`);
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (hue) => {
    setCustomColor(hue);
    document.documentElement.style.setProperty("--primary", `${hue} 60% 55%`);
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Palette className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">Theme Color</CardTitle>
            <CardDescription>Choose your primary accent color</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Presets */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Presets</p>
          <div className="grid grid-cols-3 gap-2">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.hue}
                onClick={() => applyPreset(preset.hue)}
                className={`p-3 rounded-lg border-2 transition-all ${
                  customColor === preset.hue
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
                style={{
                  backgroundColor: `hsl(${preset.hue} 60% 85%)`,
                }}
              >
                <p className="text-xs font-medium text-foreground">{preset.name}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Color */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Custom</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="custom-hue" className="text-xs text-muted-foreground">Hue (0-360)</Label>
              <Input
                id="custom-hue"
                type="number"
                min="0"
                max="360"
                value={customColor}
                onChange={(e) => {
                  const hue = e.target.value || "265";
                  setCustomColor(hue);
                  document.documentElement.style.setProperty("--primary", `${hue} 60% 55%`);
                }}
                className="mt-1 bg-card/50"
              />
            </div>
            <div className="flex items-end">
              <div
                className="w-12 h-9 rounded-md border-2 border-border"
                style={{ backgroundColor: `hsl(${customColor} 60% 55%)` }}
              />
            </div>
          </div>
        </div>

        <Button
          onClick={handleSaveColor}
          disabled={saving}
          size="sm"
          className="bg-primary hover:bg-primary/90 w-full"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Theme
        </Button>
      </CardContent>
    </Card>
  );
}