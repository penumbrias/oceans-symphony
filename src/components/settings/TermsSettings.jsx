import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Languages, Save } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";

export default function TermsSettings() {
  const qc = useQueryClient();
  const terms = useTerms();
  const [vals, setVals] = useState({ system: "", alter: "", switch: "", front: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVals({
      system: terms.system,
      alter: terms.alter,
      switch: terms.switch,
      front: terms.front,
    });
  }, [terms.system, terms.alter, terms.switch, terms.front]);

  const handleSave = async () => {
    setSaving(true);
    const data = {
      term_system: vals.system.trim() || "system",
      term_alter: vals.alter.trim() || "alter",
      term_switch: vals.switch.trim() || "switch",
      term_front: vals.front.trim() || "front",
    };
    if (terms._settingsId) {
      await base44.entities.SystemSettings.update(terms._settingsId, data);
    } else {
      await base44.entities.SystemSettings.create(data);
    }
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
    setSaving(false);
  };

  const fields = [
    { key: "system", label: "System", hint: "e.g. system, collective, network" },
    { key: "alter", label: "Alter / Member", hint: "e.g. alter, headmate, part, member" },
    { key: "switch", label: "Switch", hint: "e.g. switch, shift, change" },
    { key: "front", label: "Front", hint: "e.g. front, active, present" },
  ];

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Languages className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">Terminology</CardTitle>
            <CardDescription>Customize the language used throughout the app</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {fields.map(({ key, label, hint }) => (
            <div key={key}>
              <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
              <Input
                value={vals[key]}
                onChange={(e) => setVals((p) => ({ ...p, [key]: e.target.value }))}
                placeholder={hint}
                className="h-8 text-sm"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Preview: <span className="text-foreground font-medium">{vals.system}</span> · <span className="text-foreground font-medium">{vals.alter}</span> · <span className="text-foreground font-medium">{vals.switch}</span> · <span className="text-foreground font-medium">{vals.front}ing</span>
        </p>
        <Button onClick={handleSave} disabled={saving} size="sm" className="bg-primary hover:bg-primary/90">
          {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Terms</>}
        </Button>
      </CardContent>
    </Card>
  );
}