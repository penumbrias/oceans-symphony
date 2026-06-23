import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";

// A few friendly preset swatches — a presence often registers as "just a
// colour" before anything else, so make picking one a single tap.
const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#64748b", "#a3a3a3",
];

// Self-contained form for recording a "new presence" — a sensed-but-not-yet-
// identified fragment/alter. Used both as a tab inside SetFrontModal and as a
// standalone modal on the New Presences page, so it owns NO front-session
// logic. At least ONE descriptive detail is required; everything is optional
// beyond that. Linking to existing alters + a relationship type is optional.
export default function PresenceForm({ onSaved, onCancel }) {
  const terms = useTerms();
  const qc = useQueryClient();

  const [label, setLabel] = useState("");
  const [vibe, setVibe] = useState("");
  const [color, setColor] = useState("");
  const [emoji, setEmoji] = useState("");
  const [notes, setNotes] = useState("");
  const [recurs, setRecurs] = useState(false);
  const [linkedIds, setLinkedIds] = useState([]);
  const [relType, setRelType] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: relTypes = [] } = useQuery({ queryKey: ["relationshipTypes"], queryFn: () => base44.entities.RelationshipType.list() });
  const activeAlters = useMemo(() => alters.filter((a) => !a.is_archived), [alters]);

  const hasAnything = !!(label.trim() || vibe.trim() || color || emoji.trim() || notes.trim());

  const toggleLink = (id) =>
    setLinkedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const setManyLinks = (arr, on) =>
    setLinkedIds((prev) => {
      const s = new Set(prev);
      arr.forEach((a) => (on ? s.add(a.id) : s.delete(a.id)));
      return [...s];
    });

  const save = async () => {
    if (!hasAnything) {
      toast.error("Add at least one detail — a name, colour, emoji, vibe or note.");
      return;
    }
    setSaving(true);
    try {
      await base44.entities.Presence.create({
        timestamp: new Date().toISOString(),
        label: label.trim(),
        vibe: vibe.trim(),
        color: color || "",
        emoji: emoji.trim(),
        notes: notes.trim(),
        recurs,
        associated_alter_ids: linkedIds,
        relationship_type: relType || "",
        resolved_alter_id: "",
      });
      qc.invalidateQueries({ queryKey: ["presences"] });
      toast.success("Presence recorded 🌫️");
      onSaved?.();
    } catch (e) {
      toast.error(e.message || "Couldn't save the presence");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground leading-snug">
        Sensed someone you can't quite place? Jot down whatever you can — even
        just a colour or a feeling. You can link it to {terms.an_alter || `an ${terms.alter}`} now or later.
      </p>

      <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="A name or word for them (optional)" />
      <Input value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="A vibe — e.g. quiet, watchful, young (optional)" />

      <div className="flex items-start gap-2">
        <span className="text-xs text-muted-foreground w-12 pt-1.5">Colour</span>
        <div className="flex flex-wrap gap-1.5 items-center">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(color === c ? "" : c)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
              style={{ backgroundColor: c }}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
            />
          ))}
          {color && (
            <button type="button" onClick={() => setColor("")} className="text-xs text-muted-foreground hover:text-foreground">
              clear
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-12">Emoji</span>
        <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🌫️" className="w-20 text-center" maxLength={4} />
      </div>

      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else you noticed… (optional)" rows={2} />

      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input type="checkbox" checked={recurs} onChange={(e) => setRecurs(e.target.checked)} className="w-4 h-4 accent-primary" />
        This feels like it's happened before
      </label>

      <div>
        <button type="button" onClick={() => setShowLink((v) => !v)} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80">
          <Link2 className="w-4 h-4" /> {showLink ? "Hide" : "Link to existing"} {terms.alters} (optional)
        </button>
        {showLink && (
          <div className="mt-2 space-y-2">
            <AlterTreeSelect
              alters={activeAlters}
              groups={groups}
              isSelected={(id) => linkedIds.includes(id)}
              onToggle={(a) => toggleLink(a.id)}
              onSetMany={setManyLinks}
              maxHeight="30vh"
            />
            {linkedIds.length > 0 && relTypes.length > 0 && (
              <select
                value={relType}
                onChange={(e) => setRelType(e.target.value)}
                className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
                aria-label="Relationship to the linked alters"
              >
                <option value="">How are they related? (optional)</option>
                {relTypes.map((rt) => (
                  <option key={rt.id} value={rt.name || rt.label}>{rt.name || rt.label}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={saving} className="flex-1">Cancel</Button>
        )}
        <Button onClick={save} loading={saving} disabled={saving || !hasAnything} className="flex-1 bg-primary hover:bg-primary/90">
          Record presence
        </Button>
      </div>
    </div>
  );
}
