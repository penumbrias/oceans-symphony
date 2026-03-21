import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Palette, Save, Loader2 } from "lucide-react";
import DiaryCardPresetsManager from "@/components/settings/DiaryCardPresetsManager";
import SimplyPluralConnect from "@/components/settings/SimplyPluralConnect";
import CustomFieldsManager from "@/components/settings/CustomFieldsManager";
import ArchivedAltersManager from "@/components/settings/ArchivedAltersManager";

export default function Settings() {
  const queryClient = useQueryClient();

  const { data: settingsList = [], isLoading, refetch } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });

  const settings = settingsList[0] || null;

  const [systemName, setSystemName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings?.system_name) {
      setSystemName(settings.system_name);
    }
  }, [settings]);

  const handleSaveName = async () => {
    setSaving(true);
    if (settings?.id) {
      await base44.entities.SystemSettings.update(settings.id, {
        system_name: systemName,
      });
    } else {
      await base44.entities.SystemSettings.create({
        system_name: systemName,
      });
    }
    setSaving(false);
    refetch();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h1 className="font-display text-3xl font-semibold text-foreground mb-2">
        Settings
      </h1>
      <p className="text-muted-foreground mb-8">
        Configure your system and integrations
      </p>

      <div className="space-y-6 max-w-2xl">
        {/* System Name */}
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                <Palette className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <CardTitle className="text-lg">System Info</CardTitle>
                <CardDescription>
                  Set your system name and details
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="system-name" className="text-sm font-medium">
                  System Name
                </Label>
                <Input
                  id="system-name"
                  placeholder="Enter your system name..."
                  value={systemName}
                  onChange={(e) => setSystemName(e.target.value)}
                  className="mt-2 bg-card/50"
                />
              </div>
              <Button
                onClick={handleSaveName}
                disabled={saving}
                size="sm"
                className="bg-primary hover:bg-primary/90"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Diary Card Presets */}
        <DiaryCardPresetsManager />

        {/* Custom Fields */}
         <CustomFieldsManager />

         {/* Archived Alters */}
         <ArchivedAltersManager />

         {/* Simply Plural */}
         <SimplyPluralConnect
           settings={settings}
           onSettingsChange={() => {
             refetch();
             queryClient.invalidateQueries({ queryKey: ["alters"] });
           }}
         />
      </div>
    </motion.div>
  );
}