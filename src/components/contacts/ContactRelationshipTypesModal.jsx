import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Link2 } from "lucide-react";
import { toast } from "sonner";
import ColorPickerModal from "@/components/shared/ColorPickerModal";
import { fetchActiveContactRelationshipTypes } from "@/lib/contacts";

// Manage the SEPARATE contact relationship-type catalogue (add / rename /
// recolour / delete). Distinct from the internal alter RelationshipType set.
const PALETTE = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#6366f1", "#14b8a6", "#ef4444"];

export default function ContactRelationshipTypesModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [colorForId, setColorForId] = useState(null);

  const { data: types = [] } = useQuery({
    queryKey: ["contactRelationshipTypes"],
    queryFn: () => fetchActiveContactRelationshipTypes(base44.entities),
    enabled: open,
  });
  const sorted = [...types].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.label || "").localeCompare(b.label || ""));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["contactRelationshipTypes"] });

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    if (types.some((t) => (t.label || "").toLowerCase() === n.toLowerCase())) { toast.error("That type already exists"); return; }
    try {
      await base44.entities.ContactRelationshipType.create({ label: n, color: PALETTE[types.length % PALETTE.length], order: types.length });
      setName("");
      invalidate();
    } catch (err) { toast.error(err?.message || "Couldn't add"); }
  };

  const rename = async (t, newLabel) => {
    const n = (newLabel || "").trim();
    if (!n || n === t.label) return;
    try { await base44.entities.ContactRelationshipType.update(t.id, { label: n }); invalidate(); }
    catch (err) { toast.error(err?.message || "Couldn't rename"); }
  };

  const recolor = async (t, color) => {
    try { await base44.entities.ContactRelationshipType.update(t.id, { color }); invalidate(); }
    catch (err) { toast.error(err?.message || "Couldn't update"); }
  };

  const remove = async (t) => {
    if (!window.confirm(`Delete the "${t.label}" type? Existing relationships keep their label — it just won't be a suggestion anymore.`)) return;
    try { await base44.entities.ContactRelationshipType.delete(t.id); invalidate(); }
    catch (err) { toast.error(err?.message || "Couldn't delete"); }
  };

  const colorType = sorted.find((t) => t.id === colorForId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 className="w-4 h-4" /> Relationship types</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Your own set for contacts — Friend, Family, Therapist, Coworker… Separate from the relationships between your alters.
        </p>

        <div className="flex items-center gap-1.5 mt-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="New type (e.g. Therapist)"
            className="flex-1"
          />
          <Button type="button" size="sm" onClick={add} disabled={!name.trim()} className="gap-1 flex-shrink-0">
            <Plus className="w-3.5 h-3.5" /> Add
          </Button>
        </div>

        <div className="space-y-1.5 mt-2">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
          ) : (
            sorted.map((t) => (
              <TypeRow key={t.id} type={t} onRename={rename} onColor={() => setColorForId(t.id)} onDelete={remove} />
            ))
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>

      {colorType && (
        <ColorPickerModal
          color={colorType.color || "#8b5cf6"}
          label="Type colour"
          onSave={(hex) => recolor(colorType, hex)}
          onClose={() => setColorForId(null)}
        />
      )}
    </Dialog>
  );
}

function TypeRow({ type, onRename, onColor, onDelete }) {
  const [val, setVal] = useState(type.label || "");
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 px-2 py-1.5">
      <button type="button" onClick={onColor} className="w-5 h-5 rounded-full border border-border flex-shrink-0" style={{ backgroundColor: type.color || "#8b5cf6" }} title="Change colour" />
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => onRename(type, val)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        className="flex-1 h-8 text-sm border-0 bg-transparent px-1 focus-visible:ring-0"
      />
      <button type="button" onClick={() => onDelete(type)} className="text-muted-foreground hover:text-destructive flex-shrink-0 p-1">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
