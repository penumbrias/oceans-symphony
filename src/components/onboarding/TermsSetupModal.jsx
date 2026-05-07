import React, { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";

const PRESETS = [
  { label: "DID / OSDD (default)", system: "system", alter: "alter", switch: "switch", front: "front" },
  { label: "Headmates", system: "system", alter: "headmate", switch: "switch", front: "front" },
  { label: "Parts (IFS)", system: "system", alter: "part", switch: "shift", front: "influenc" },
  { label: "Collective", system: "collective", alter: "member", switch: "switch", front: "front" },
];

export default function TermsSetupModal({ open, onClose, existingSettingsId }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(0);
  const [custom, setCustom] = useState({ system: "", alter: "", switch: "", front: "" });
  const [useCustom, setUseCustom] = useState(false);
  const [saving, setSaving] = useState(false);

  const terms = useCustom ? custom : PRESETS[selected];

  const handleSave = async () => {
    setSaving(true);
    const data = {
      term_system: terms.system.trim() || "system",
      term_alter: terms.alter.trim() || "alter",
      term_switch: terms.switch.trim() || "switch",
      term_front: terms.front.trim() || "front",
    };
    if (existingSettingsId) {
      await base44.entities.SystemSettings.update(existingSettingsId, data);
    } else {
      await base44.entities.SystemSettings.create(data);
    }
    localStorage.setItem("terms_setup_done", "1");
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold">Choose your language 💜</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Oceans Symphony adapts to the terminology your system prefers. Pick a preset or define your own.
            </p>
          </div>

          {/* Presets */}
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => { setSelected(i); setUseCustom(false); }}
                className={`rounded-xl border p-3 text-left text-sm transition-all ${
                  !useCustom && selected === i
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border/50 text-muted-foreground hover:border-primary/40"
                }`}
              >
                <p className="font-medium text-xs mb-1">{p.label}</p>
                <p className="text-[11px] opacity-70">{p.alter} · {p.front}ing</p>
              </button>
            ))}
          </div>

          {/* Custom toggle */}
          <button
            onClick={() => setUseCustom((v) => !v)}
            className={`w-full text-sm rounded-xl border p-3 text-left transition-all ${
              useCustom ? "border-primary bg-primary/5" : "border-border/50 text-muted-foreground hover:border-primary/40"
            }`}
          >
            ✏️ Custom terms
          </button>

          {useCustom && (
            <div className="grid grid-cols-2 gap-3">
              {["system", "alter", "switch", "front"].map((key) => (
                <div key={key}>
                  <label className="text-xs text-muted-foreground capitalize mb-1 block">{key}</label>
                  <Input
                    placeholder={key}
                    value={custom[key]}
                    onChange={(e) => setCustom((p) => ({ ...p, [key]: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Preview */}
          <div className="rounded-xl bg-muted/30 border border-border/40 p-3 text-xs text-muted-foreground space-y-0.5">
            <p>Preview: <span className="text-foreground font-medium capitalize">{terms.system}</span> · <span className="text-foreground font-medium capitalize">{terms.alter}</span> · <span className="text-foreground font-medium capitalize">{terms.switch}</span> · <span className="text-foreground font-medium capitalize">{terms.front}ing</span></p>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            🗺️ Once you're in, open <strong className="text-foreground">Settings → Feature Tour</strong> for an in-depth walkthrough of everything Symphony can do.
          </p>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save & Continue"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}