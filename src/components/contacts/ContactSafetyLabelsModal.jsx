import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import { CONTACT_SAFETY_LEVELS, getSafetyLevels } from "@/lib/contacts";

// Phase 2 — let users rename / recolour the 4 contact safety levels.
// The KEYS (safe/caution/unsafe/unknown) are fixed so existing Contact.safety
// values never break; only the user-facing label / colour / description change.
// Persisted to SystemSettings.contact_safety_levels (read by getSafetyLevels).
export default function ContactSafetyLabelsModal({ open, onClose, settings }) {
  const queryClient = useQueryClient();
  const [levels, setLevels] = useState(() => getSafetyLevels(settings));
  const [saving, setSaving] = useState(false);
  const [colorFor, setColorFor] = useState(null); // key currently picking a colour

  useEffect(() => {
    if (open) setLevels(getSafetyLevels(settings).map((l) => ({ ...l })));
  }, [open, settings]);

  const update = (key, patch) =>
    setLevels((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const resetDefaults = () => setLevels(CONTACT_SAFETY_LEVELS.map((l) => ({ ...l })));

  const save = async () => {
    setSaving(true);
    try {
      // Normalise — always keep all four preset keys so nothing can be lost.
      const clean = CONTACT_SAFETY_LEVELS.map((preset) => {
        const edited = levels.find((l) => l.key === preset.key) || preset;
        return {
          key: preset.key,
          label: (edited.label || preset.label).trim() || preset.label,
          color: edited.color || preset.color,
          description: (edited.description ?? preset.description) || "",
        };
      });
      const list = await base44.entities.SystemSettings.list();
      const existing = list[0];
      if (existing) await base44.entities.SystemSettings.update(existing.id, { contact_safety_levels: clean });
      else await base44.entities.SystemSettings.create({ contact_safety_levels: clean });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast.success("Safety labels saved");
      onClose?.();
    } catch (err) {
      toast.error(err?.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Safety labels</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1 mb-1">
          Rename or recolour the four trust levels to fit how you think about people. Contacts already marked keep their level — only the wording changes.
        </p>

        <div className="space-y-2.5">
          {levels.map((lvl) => (
            <div key={lvl.key} className="rounded-lg border border-border/60 p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setColorFor(lvl.key)}
                  className="w-7 h-7 rounded-full border border-border flex-shrink-0"
                  style={{ backgroundColor: lvl.color }}
                  title="Change colour"
                />
                <Input
                  value={lvl.label}
                  onChange={(e) => update(lvl.key, { label: e.target.value })}
                  placeholder={CONTACT_SAFETY_LEVELS.find((p) => p.key === lvl.key)?.label}
                  className="flex-1"
                />
              </div>
              <Input
                value={lvl.description || ""}
                onChange={(e) => update(lvl.key, { description: e.target.value })}
                placeholder="Short description (optional)"
                className="text-xs h-8"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={resetDefaults} className="gap-1.5 text-muted-foreground">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </Button>
          </div>
        </div>
      </DialogContent>

      {colorFor && (
        <ColorPickerModal
          color={levels.find((l) => l.key === colorFor)?.color || "#94a3b8"}
          label="Pick colour"
          onSave={(hex) => update(colorFor, { color: hex })}
          onClose={() => setColorFor(null)}
        />
      )}
    </Dialog>
  );
}
