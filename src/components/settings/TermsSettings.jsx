import React, { useState, useEffect } from "react";

const PRESETS = [
  { label: "DID / OSDD (default)", system: "system", alter: "alter", switch: "switch", front: "front" },
  { label: "Headmates", system: "system", alter: "headmate", switch: "switch", front: "front" },
  { label: "Parts (IFS)", system: "system", alter: "part", switch: "shift", front: "influenc" },
  { label: "Collective", system: "collective", alter: "member", switch: "switch", front: "front" },
];
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Languages, Save } from "lucide-react";
import { pluralize, gerund, agent } from "@/lib/useTerms";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { markTermsCustomizedToday } from "@/lib/dailyTaskSystem";

export default function TermsSettings() {
  const qc = useQueryClient();
  const terms = useTerms();
  const [vals, setVals] = useState({
    system: "", alter: "", switch: "", front: "",
    fronting: "", fronter: "", switching: "",
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);

  const applyPreset = (preset) => {
    setVals((p) => ({
      ...p,
      system: preset.system, alter: preset.alter, switch: preset.switch, front: preset.front,
      // Presets are regular bases — clear any overrides the user had.
      fronting: "", fronter: "", switching: "",
    }));
  };

  useEffect(() => {
    setVals({
      system: terms.system,
      alter: terms.alter,
      switch: terms.switch,
      front: terms.front,
      // Show the resolved values (override or auto-derived) so the user
      // sees what's currently in effect; leaving them blank on save
      // means "fall back to auto" again.
      fronting: terms.fronting,
      fronter: terms.fronter,
      switching: terms.switching,
    });
  }, [terms.system, terms.alter, terms.switch, terms.front, terms.fronting, terms.fronter, terms.switching]);

  const handleSave = async () => {
    setSaving(true);
    // Only persist override fields when they differ from the auto-derived
    // form — otherwise blank them so future base-term edits propagate
    // through the auto-conjugation again.
    const baseFront = vals.front.trim() || "front";
    const baseSwitch = vals.switch.trim() || "switch";
    const autoFronting = gerund(baseFront);
    const autoFronter = agent(baseFront);
    const autoSwitching = gerund(baseSwitch);
    const data = {
      term_system: vals.system.trim() || "system",
      term_alter: vals.alter.trim() || "alter",
      term_switch: baseSwitch,
      term_front: baseFront,
      term_fronting: vals.fronting.trim() && vals.fronting.trim() !== autoFronting ? vals.fronting.trim() : "",
      term_fronter: vals.fronter.trim() && vals.fronter.trim() !== autoFronter ? vals.fronter.trim() : "",
      term_switching: vals.switching.trim() && vals.switching.trim() !== autoSwitching ? vals.switching.trim() : "",
    };
    if (terms._settingsId) {
      await base44.entities.SystemSettings.update(terms._settingsId, data);
    } else {
      await base44.entities.SystemSettings.create(data);
    }
    markTermsCustomizedToday();
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
    setSaving(false);
  };

  const fields = [
    { key: "system", label: "System", hint: "e.g. system, collective, network" },
    { key: "alter", label: "Alter", hint: "e.g. alter, headmate, part, member" },
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
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => applyPreset(p)}
              className="rounded-xl border border-border/50 p-2.5 text-left text-xs hover:border-primary/50 hover:bg-primary/5 transition-all"
            >
              <p className="font-medium text-foreground">{p.label}</p>
              <p className="text-[0.6875rem] text-muted-foreground mt-0.5">{p.alter} · {p.front}ing</p>
            </button>
          ))}
        </div>
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
        <div className="text-xs text-muted-foreground space-y-0.5">
          <p>
            <span className="font-medium">System:</span>{" "}
            <span className="text-foreground font-medium">{vals.system}</span> · <span className="text-foreground font-medium">{pluralize(vals.system)}</span>
          </p>
          <p>
            <span className="font-medium">Alter:</span>{" "}
            <span className="text-foreground font-medium">{vals.alter}</span> · <span className="text-foreground font-medium">{pluralize(vals.alter)}</span>
          </p>
          <p>
            <span className="font-medium">Switch:</span>{" "}
            <span className="text-foreground font-medium">{vals.switch}</span> · <span className="text-foreground font-medium">{pluralize(vals.switch)}</span> · <span className="text-foreground font-medium">{gerund(vals.switch)}</span>
          </p>
          <p>
            <span className="font-medium">Front:</span>{" "}
            <span className="text-foreground font-medium">{vals.front}</span> · <span className="text-foreground font-medium">{pluralize(vals.front)}</span> · <span className="text-foreground font-medium">{vals.fronting || gerund(vals.front)}</span> · <span className="text-foreground font-medium">{vals.fronter || agent(vals.front)}</span>
          </p>
        </div>

        {/* Advanced word-form overrides. The auto-conjugator assumes the
            base term is a regular verb root; adjectives like "active"
            yield "activing" / "activer" instead of "activating" /
            "active fronter". This section lets the user type the
            correct forms explicitly. */}
        <div className="border-t border-border/40 pt-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? "▾" : "▸"} Advanced word forms (override if auto-conjugation looks off)
          </button>
          {showAdvanced && (
            <div className="mt-2 space-y-2">
              <p className="text-[0.6875rem] text-muted-foreground leading-relaxed">
                Used when the base term isn't a regular verb. e.g. setting Front to "active" would auto-conjugate to "activing" / "activer" — type "activating" / "active fronter" here instead. Leave blank to fall back to auto-conjugation.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Fronting form</label>
                  <Input
                    value={vals.fronting}
                    onChange={(e) => setVals((p) => ({ ...p, fronting: e.target.value }))}
                    placeholder={gerund(vals.front || "front")}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Fronter form</label>
                  <Input
                    value={vals.fronter}
                    onChange={(e) => setVals((p) => ({ ...p, fronter: e.target.value }))}
                    placeholder={agent(vals.front || "front")}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Switching form</label>
                  <Input
                    value={vals.switching}
                    onChange={(e) => setVals((p) => ({ ...p, switching: e.target.value }))}
                    placeholder={gerund(vals.switch || "switch")}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving} size="sm" className="bg-primary hover:bg-primary/90">
          {saving ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />Saving...</> : <><Save className="w-4 h-4 mr-2" />Save Terms</>}
        </Button>
      </CardContent>
    </Card>
  );
}