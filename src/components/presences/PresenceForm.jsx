import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Link2, Palette } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";
import ColorPickerModal from "@/components/shared/ColorPickerModal";

// Self-contained create/edit form for a "presence" — a sensed-but-not-yet-
// identified fragment/alter. Reuses the SAME colour picker (ColorPickerModal)
// and emoji-text-field pattern the alter editor uses, rather than rolling its
// own. Owns NO front-session logic, so it can live inside SetFrontModal or
// standalone. Pass `presence` to edit an existing record. At least ONE
// descriptive detail is required.
export default function PresenceForm({ presence = null, onSaved, onCancel }) {
  const terms = useTerms();
  const qc = useQueryClient();
  const editing = !!presence?.id;

  const [label, setLabel] = useState(presence?.label || "");
  const [vibe, setVibe] = useState(presence?.vibe || "");
  const [color, setColor] = useState(presence?.color || "");
  const [emoji, setEmoji] = useState(presence?.emoji || "");
  const [notes, setNotes] = useState(presence?.notes || "");
  const [linkedIds, setLinkedIds] = useState(presence?.associated_alter_ids || []);
  const [relType, setRelType] = useState(presence?.relationship_type || "");
  const [showLink, setShowLink] = useState((presence?.associated_alter_ids || []).length > 0);
  const [colorOpen, setColorOpen] = useState(false);
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
      const fields = {
        label: label.trim(),
        vibe: vibe.trim(),
        color: color || "",
        emoji: emoji.trim(),
        notes: notes.trim(),
        associated_alter_ids: linkedIds,
        relationship_type: relType || "",
      };
      if (editing) {
        await base44.entities.Presence.update(presence.id, fields);
        toast.success("Presence updated");
      } else {
        const now = new Date().toISOString();
        // `sightings` accrues every time the presence is sensed — that's how
        // reoccurrence is sourced (recording it again, here or from Set Front),
        // so there's no manual "happened before" flag.
        await base44.entities.Presence.create({ ...fields, timestamp: now, sightings: [now], resolved_alter_id: "" });
        toast.success("Presence recorded 🌫️");
      }
      qc.invalidateQueries({ queryKey: ["presences"] });
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
        just a colour or a feeling. You can link it to an {terms.alter} now or later.
      </p>

      <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="A name or word for them (optional)" />
      <Input value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="A vibe — e.g. quiet, watchful, young (optional)" />

      {/* Colour — same picker the alter editor uses. */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-12">Colour</span>
        <button
          type="button"
          onClick={() => setColorOpen(true)}
          className="w-8 h-8 rounded-lg border-2 border-border hover:border-primary/50 transition-colors flex-shrink-0 flex items-center justify-center"
          style={{ backgroundColor: color || "transparent" }}
          aria-label="Pick colour"
        >
          {!color && <Palette className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>
        <span className="flex-1 text-xs font-mono text-muted-foreground truncate">{color || "Not set"}</span>
        {color && (
          <button type="button" onClick={() => setColor("")} className="text-xs text-muted-foreground hover:text-destructive">clear</button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-12">Emoji</span>
        <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🌫️" className="w-20 text-center" maxLength={4} />
      </div>

      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything else you noticed… (optional)" rows={2} />

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
          {editing ? "Save changes" : "Record presence"}
        </Button>
      </div>

      {colorOpen && (
        <ColorPickerModal
          color={color || "#8b5cf6"}
          label="Pick colour"
          onSave={(hex) => { setColor(hex); setColorOpen(false); }}
          onClose={() => setColorOpen(false)}
        />
      )}
    </div>
  );
}
