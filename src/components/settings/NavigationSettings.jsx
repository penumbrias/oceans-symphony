import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Navigation, Save, Loader2, ChevronDown, ChevronUp } from "lucide-react";

const ALL_PAGES = [
  { id: "home", label: "Home" },
  { id: "alters", label: "Alters" },
  { id: "checkin", label: "Check-In" },
  { id: "journals", label: "Journals" },
  { id: "tasks", label: "Tasks" },
  { id: "timeline", label: "Timeline" },
  { id: "therapy-report", label: "Therapy Report" },
  { id: "system-map", label: "System Map" },
  { id: "analytics", label: "Analytics" },
  { id: "activities", label: "Activities" },
  { id: "sleep", label: "Sleep" },
  { id: "support", label: "Support & Learn" },
  { id: "groups", label: "Groups" },
];

const DEFAULT_CONFIG = {
  topBar: ["home", "alters", "checkin", "journals", "tasks"],
  bottomBar: ["home", "alters", "checkin", "journals", "tasks"],
  dashboardGrid: ["alters", "checkin", "activities", "analytics", "therapy-report", "support"],
};

export default function NavigationSettings({ settings }) {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [openSection, setOpenSection] = useState(null);

  useEffect(() => {
    if (settings?.navigation_config) {
      setConfig(settings.navigation_config);
    } else {
      setConfig(DEFAULT_CONFIG);
    }
  }, [settings]);

  const handleToggle = (location, pageId) => {
    setConfig(prev => {
      const updated = { ...prev };
      const list = [...updated[location]];
      const idx = list.indexOf(pageId);
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        const maxLen = location === "topBar" ? 6 : location === "bottomBar" ? 5 : 999;
        if (list.length < maxLen) {
          list.push(pageId);
        }
      }
      updated[location] = list;
      return updated;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, { navigation_config: config });
      } else {
        await base44.entities.SystemSettings.create({ navigation_config: config });
      }
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Navigation className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Navigation</CardTitle>
            <CardDescription>Customize where pages appear</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {["topBar", "bottomBar", "dashboardGrid"].map(location => {
          const maxLen = location === "topBar" ? 6 : location === "bottomBar" ? 5 : 999;
          const count = config[location]?.length || 0;
          const isOpen = openSection === location;
          const sectionLabel = location === "topBar" ? "Top Navigation Bar" : location === "bottomBar" ? "Mobile Bottom Bar" : "Dashboard Grid";

          return (
            <div key={location} className="border border-border rounded-lg overflow-hidden">
              {/* Header - Clickable to toggle */}
              <button
                onClick={() => setOpenSection(isOpen ? null : location)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-semibold text-sm text-foreground">{sectionLabel}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {count}/{maxLen}
                  </span>
                </div>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </button>

              {/* Content - Shown when open */}
              {isOpen && (
                <div className="px-4 py-3 border-t border-border bg-muted/5 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_PAGES.map(page => (
                      <label
                        key={page.id}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={config[location]?.includes(page.id) || false}
                          disabled={
                            !config[location]?.includes(page.id) &&
                            count >= maxLen
                          }
                          onCheckedChange={() => handleToggle(location, page.id)}
                        />
                        {page.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 w-full mt-4"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Navigation Settings
        </Button>
      </CardContent>
    </Card>
  );
}