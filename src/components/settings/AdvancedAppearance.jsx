import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Palette, RotateCcw, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const COLOR_PRESETS = {
  warm: {
    name: "Warm",
    colors: {
      "--primary": "40 70% 55%",
      "--secondary": "20 60% 92%",
      "--accent": "20 70% 65%",
      "--destructive": "0 72% 60%",
      "--chart-1": "40 70% 55%",
      "--chart-2": "20 60% 65%",
      "--chart-3": "10 50% 55%",
      "--chart-4": "30 65% 60%",
      "--chart-5": "50 70% 50%",
    }
  },
  cool: {
    name: "Cool",
    colors: {
      "--primary": "200 70% 55%",
      "--secondary": "210 40% 90%",
      "--accent": "220 60% 70%",
      "--destructive": "0 72% 60%",
      "--chart-1": "200 70% 55%",
      "--chart-2": "220 70% 50%",
      "--chart-3": "240 60% 55%",
      "--chart-4": "190 50% 60%",
      "--chart-5": "210 65% 55%",
    }
  },
  neutral: {
    name: "Neutral",
    colors: {
      "--primary": "210 50% 50%",
      "--secondary": "210 15% 92%",
      "--accent": "220 40% 70%",
      "--destructive": "0 72% 60%",
      "--chart-1": "210 50% 50%",
      "--chart-2": "220 40% 55%",
      "--chart-3": "200 40% 55%",
      "--chart-4": "210 35% 60%",
      "--chart-5": "230 40% 50%",
    }
  },
  forest: {
    name: "Forest",
    colors: {
      "--primary": "120 50% 45%",
      "--secondary": "140 40% 88%",
      "--accent": "110 60% 55%",
      "--destructive": "0 72% 60%",
      "--chart-1": "120 50% 45%",
      "--chart-2": "140 45% 50%",
      "--chart-3": "100 40% 50%",
      "--chart-4": "160 50% 55%",
      "--chart-5": "80 60% 50%",
    }
  },
  sunset: {
    name: "Sunset",
    colors: {
      "--primary": "20 80% 55%",
      "--secondary": "35 90% 90%",
      "--accent": "350 70% 65%",
      "--destructive": "0 72% 60%",
      "--chart-1": "20 80% 55%",
      "--chart-2": "350 70% 55%",
      "--chart-3": "10 75% 60%",
      "--chart-4": "40 85% 60%",
      "--chart-5": "280 60% 50%",
    }
  },
  ocean: {
    name: "Ocean",
    colors: {
      "--primary": "210 80% 50%",
      "--secondary": "220 60% 88%",
      "--accent": "190 70% 60%",
      "--destructive": "0 72% 60%",
      "--chart-1": "210 80% 50%",
      "--chart-2": "240 60% 55%",
      "--chart-3": "190 70% 50%",
      "--chart-4": "200 75% 55%",
      "--chart-5": "270 50% 55%",
    }
  },
  berry: {
    name: "Berry",
    colors: {
      "--primary": "280 60% 55%",
      "--secondary": "300 50% 92%",
      "--accent": "320 70% 65%",
      "--destructive": "0 72% 60%",
      "--chart-1": "280 60% 55%",
      "--chart-2": "320 70% 55%",
      "--chart-3": "260 50% 55%",
      "--chart-4": "340 60% 60%",
      "--chart-5": "10 70% 50%",
    }
  },
};

export default function AdvancedAppearance() {
  const [selectedPreset, setSelectedPreset] = useState("warm");
  const [customColors, setCustomColors] = useState({});
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const stored = localStorage.getItem("custom-theme-colors");
    if (stored) {
      const colors = JSON.parse(stored);
      setCustomColors(colors);
    } else {
      const colors = {};
      Object.keys(COLOR_PRESETS.warm.colors).forEach(key => {
        colors[key] = getComputedStyle(root).getPropertyValue(key).trim();
      });
      setCustomColors(colors);
    }
  }, []);

  const applyPreset = (presetKey) => {
    const preset = COLOR_PRESETS[presetKey];
    const root = document.documentElement;
    Object.entries(preset.colors).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    setCustomColors(preset.colors);
    setSelectedPreset(presetKey);
    localStorage.setItem("custom-theme-colors", JSON.stringify(preset.colors));
    toast.success(`Applied ${preset.name} theme`);
  };

  const handleColorChange = (key, value) => {
    const updated = { ...customColors, [key]: value };
    setCustomColors(updated);
    const root = document.documentElement;
    root.style.setProperty(key, value);
  };

  const handleSaveCustom = async () => {
    setSaving(true);
    try {
      localStorage.setItem("custom-theme-colors", JSON.stringify(customColors));
      setSelectedPreset(null);
      toast.success("Custom theme saved");
    } catch (e) {
      toast.error("Failed to save theme");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    applyPreset("warm");
    setShowAdvanced(false);
  };

  const colorVars = [
    { key: "--primary", label: "Primary" },
    { key: "--secondary", label: "Secondary" },
    { key: "--accent", label: "Accent" },
    { key: "--muted", label: "Muted" },
    { key: "--destructive", label: "Destructive" },
    { key: "--chart-1", label: "Chart 1" },
    { key: "--chart-2", label: "Chart 2" },
    { key: "--chart-3", label: "Chart 3" },
    { key: "--chart-4", label: "Chart 4" },
    { key: "--chart-5", label: "Chart 5" },
  ];

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Palette className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">Advanced Appearance</CardTitle>
            <CardDescription>Customize colors and themes</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Presets */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">System Themes</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(COLOR_PRESETS).map(([key, preset]) => (
              <Button
                key={key}
                variant={selectedPreset === key ? "default" : "outline"}
                onClick={() => applyPreset(key)}
                size="sm"
                className="text-xs"
              >
                {preset.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Advanced Toggle */}
        <div className="border-t pt-4">
          <Button
            variant="ghost"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showAdvanced ? "Hide" : "Show"} Advanced Customization
          </Button>
        </div>

        {/* Advanced Controls */}
        {showAdvanced && (
          <div className="space-y-4 pt-4 border-t">
            <div className="grid gap-3 max-h-96 overflow-y-auto">
              {colorVars.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs font-medium">{label}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={customColors[key] || ""}
                      onChange={(e) => handleColorChange(key, e.target.value)}
                      placeholder="e.g., 210 68% 62%"
                      className="text-xs flex-1"
                    />
                    <div
                      className="w-10 h-9 rounded-md border border-border"
                      style={{
                        backgroundColor: `hsl(${customColors[key]})`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">HSL format: hue saturation% lightness%</p>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleSaveCustom}
                disabled={saving}
                className="flex-1 bg-primary hover:bg-primary/90"
                size="sm"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save Custom Theme
              </Button>
              <Button
                onClick={handleReset}
                variant="outline"
                size="sm"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}