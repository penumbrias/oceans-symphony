import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { getPrivacyLevels, makeLevel, sortedLevels, defaultFieldProfile, SHARE_FIELDS, SHARE_FIELD_LABELS, selectablePillClass } from "@/lib/privacyLevels";

// Define the catalogue of privacy levels + each level's field profile (what a
// friend who can see that level gets). Stored on SystemSettings.privacy_levels.
// Local config only — no sharing happens here (that's Phase 4).
export default function PrivacyLevelsManager({ isOpen, onClose }) {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settings = settingsList[0] || null;

  const [levels, setLevels] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setLevels(sortedLevels(getPrivacyLevels(settings)));
  }, [isOpen, settings]);

  const addLevel = () => {
    const nextNum = levels.length ? Math.max(...levels.map((l) => l.number)) + 1 : 0;
    setLevels((ls) => [...ls, makeLevel({ number: nextNum, name: nextNum === 0 ? "Public" : `Level ${nextNum}` })]);
  };
  const updateLevel = (id, patch) => setLevels((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const toggleField = (id, field) => setLevels((ls) => ls.map((l) => (l.id === id ? { ...l, fields: { ...(l.fields || defaultFieldProfile()), [field]: !l.fields?.[field] } } : l)));
  const removeLevel = (id) => setLevels((ls) => ls.filter((l) => l.id !== id));

  const save = async () => {
    setSaving(true);
    try {
      const clean = levels.map((l) => ({ id: l.id, number: Number(l.number) || 0, name: (l.name || "").trim() || `Level ${l.number || 0}`, fields: l.fields || defaultFieldProfile() }));
      if (settings?.id) await base44.entities.SystemSettings.update(settings.id, { privacy_levels: clean });
      else await base44.entities.SystemSettings.create({ privacy_levels: clean });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      toast.success("Privacy levels saved");
      onClose?.();
    } catch (e) { toast.error(e?.message || "Couldn't save"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Privacy levels</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Levels decide <strong>what</strong> a friend sees. Number them however you like (e.g. 0 = most open). You assign {terms.alters} to levels on each profile, and grant friends a set of levels on the Friends page. {terms.Alters} are private until you put them in a level.
        </p>

        <div className="space-y-3">
          {sortedLevels(levels).map((l) => (
            <div key={l.id} className="rounded-xl border border-border/50 bg-card/40 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input type="number" value={l.number} onChange={(e) => updateLevel(l.id, { number: e.target.value })} className="w-16 h-8 text-sm" aria-label="Level number" />
                <Input value={l.name} onChange={(e) => updateLevel(l.id, { name: e.target.value })} placeholder="Level name" className="flex-1 h-8 text-sm" aria-label="Level name" />
                <button type="button" onClick={() => removeLevel(l.id)} aria-label="Delete level" className="text-muted-foreground hover:text-destructive flex-shrink-0 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SHARE_FIELDS.map((f) => {
                  const on = !!l.fields?.[f];
                  return (
                    <button key={f} type="button" aria-pressed={on} onClick={() => toggleField(l.id, f)}
                      className={`text-[0.6875rem] px-2 py-1 rounded-full border transition-colors ${selectablePillClass(on)}`}>
                      {on ? "✓ " : ""}{SHARE_FIELD_LABELS[f]}
                    </button>
                  );
                })}
              </div>
              <p className="text-[0.625rem] text-muted-foreground">Tap a field to include it. <strong className="text-foreground">Filled</strong> = shared at this level; outlined = hidden.</p>
            </div>
          ))}
          {levels.length === 0 && (
            <p className="text-xs text-muted-foreground/70 italic text-center py-4">No levels yet — add one to start sharing {terms.alters} with friends.</p>
          )}
          <button type="button" onClick={addLevel} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground hover:bg-muted/30">
            <Plus className="w-4 h-4" /> Add level
          </button>
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={save} disabled={saving} className="flex-1 gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save levels
          </Button>
          <Button variant="outline" onClick={() => onClose?.()}>Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
