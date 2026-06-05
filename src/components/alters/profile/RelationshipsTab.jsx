import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2, Link2, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import ColorPicker from "@/components/shared/ColorPicker";
import CreateRelationshipModal from "@/components/systemmap/CreateRelationshipModal";
import { DEFAULT_RELATIONSHIP_TYPES, flattenTypeTree } from "@/lib/relationshipTypes";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// Small avatar that resolves legacy local-image:// URLs (a raw <img src> on
// those renders broken). Mirrors AlterAvatar in RelationshipsPanel.jsx.
function AlterAvatar({ alter, size = 28 }) {
  const resolved = useResolvedAvatarUrl(alter?.avatar_url);
  if (!alter) return <div className="rounded-full bg-muted flex-shrink-0" style={{ width: size, height: size }} />;
  return resolved ? (
    <img src={resolved} className="rounded-full object-cover flex-shrink-0 border border-border"
      style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: alter.color || "#8b5cf6", fontSize: size * 0.4 }}>
      {alter.name?.charAt(0)?.toUpperCase()}
    </div>
  );
}

// Direction indicator relative to THIS alter. If this alter is side A, the
// stored direction reads naturally; if it's side B, the arrow is mirrored so
// the relationship always reads "this alter → other alter". Mirrors the
// _selfIsA arrow logic in LineageTab.jsx.
function relativeArrow(direction, selfIsA) {
  if (direction === "bidirectional") return "↔";
  if (selfIsA) return direction === "a_to_b" ? "→" : "←";
  return direction === "a_to_b" ? "←" : "→";
}

function relTypeLabel(rel) {
  return rel.relationship_type === "Custom" ? (rel.custom_label || "Custom") : rel.relationship_type;
}

// Cycle-safe, depth-indented <option>s for a relationship-type <select>.
// The option VALUE is the type's label — AlterRelationship.relationship_type
// stores the label (not the id), so nesting never changes what's saved.
// Mirrors GroupedTypeOptions in RelationshipsPanel.jsx.
function GroupedTypeOptions({ types }) {
  const tree = flattenTypeTree(types);
  const NB = String.fromCharCode(160); // U+00A0; ASCII spaces collapse in <option>
  return tree.map(t => {
    const depth = t._depth || 0;
    return (
      <option key={t.id ?? t.label} value={t.label}>
        {depth > 0 ? NB.repeat(depth * 2) + "↳ " : ""}{t.label}
      </option>
    );
  });
}

// Edit modal — mirrors EditRelationshipModal in RelationshipsPanel.jsx (that
// one is not exported, so the pattern is reproduced here).
function EditRelationshipModal({ rel, alterMap, onSave, onClose }) {
  const [direction, setDirection] = useState(rel.direction);
  const [relType, setRelType] = useState(rel.relationship_type);
  const [color, setColor] = useState(rel.color || "#6b7280");
  const [notes, setNotes] = useState(rel.notes || "");
  const [strength, setStrength] = useState(rel.strength || 3);

  const { data: relTypes = [] } = useQuery({
    queryKey: ["relationshipTypes"],
    queryFn: async () => {
      const all = await base44.entities.RelationshipType.list();
      if (all.length === 0) return DEFAULT_RELATIONSHIP_TYPES.map((t, i) => ({ ...t, id: i, order: i }));
      return all.filter(t => !t.is_archived).sort((a, b) => (a.order || 0) - (b.order || 0));
    },
  });

  const handleTypeChange = (label) => {
    setRelType(label);
    const found = relTypes.find(t => t.label === label);
    if (found) setColor(found.color || "#6b7280");
  };

  const alterA = alterMap[rel.alter_id_a];
  const alterB = alterMap[rel.alter_id_b];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 pb-16 sm:pb-0" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-5 shadow-xl w-full max-w-sm mx-4 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Edit Relationship</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Direction</p>
          {[
            { value: "a_to_b", label: `${alterA?.name} → ${alterB?.name}` },
            { value: "b_to_a", label: `${alterB?.name} → ${alterA?.name}` },
            { value: "bidirectional", label: `${alterA?.name} ↔ ${alterB?.name}` },
          ].map(opt => (
            <button key={opt.value} onClick={() => setDirection(opt.value)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm border mb-1 transition-colors ${direction === opt.value ? "bg-primary/10 border-primary/40 text-primary" : "border-border hover:bg-muted/40"}`}>
              {opt.label}
            </button>
          ))}
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Type</p>
          <select value={relType} onChange={e => handleTypeChange(e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm">
            <GroupedTypeOptions types={relTypes} />
          </select>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Strength <span className="font-normal normal-case text-muted-foreground/70">{["", "Very Weak", "Weak", "Moderate", "Strong", "Very Strong"][strength]}</span>
          </p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(v => (
              <button key={v} onClick={() => setStrength(v)}
                className={`flex-1 h-8 rounded-lg border-2 text-xs font-bold transition-all ${
                  v <= strength ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/50"
                }`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Color</p>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Notes</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm resize-none" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={() => onSave({ direction, relationship_type: relType, custom_label: "", color, notes, strength })}>Save</Button>
        </div>
      </div>
    </div>
  );
}

export default function RelationshipsTab({ alter, alters }) {
  const t = useTerms();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editingRel, setEditingRel] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const allAlters = alters || [];

  // Same query the System Map / Lineage tab use — shared cache, single source.
  const { data: relationships = [] } = useQuery({
    queryKey: ["alterRelationships"],
    queryFn: () => base44.entities.AlterRelationship.list(),
  });

  const alterMap = useMemo(() => Object.fromEntries(allAlters.map(a => [a.id, a])), [allAlters]);

  // Every relationship involving this alter, normalised so the "other" alter
  // and a this-alter-relative direction are easy to render. Mirrors
  // LineageTab.jsx's myRelationships derivation.
  const myRelationships = useMemo(() => {
    return (relationships || [])
      .filter(r => r.alter_id_a === alter.id || r.alter_id_b === alter.id)
      .map(r => {
        const selfIsA = r.alter_id_a === alter.id;
        const other = alterMap[selfIsA ? r.alter_id_b : r.alter_id_a];
        return { ...r, other, _selfIsA: selfIsA };
      })
      .filter(r => r.other); // drop dangling rows where the other alter is gone
  }, [relationships, alter.id, alterMap]);

  const invalidate = () => {
    // Shared key with System Map, Lineage tab, RelationshipsPanel — keeps every
    // surface in sync after a create/edit/delete.
    queryClient.invalidateQueries({ queryKey: ["alterRelationships"] });
  };

  const handleSaveNew = async (data) => {
    await base44.entities.AlterRelationship.create(data);
    invalidate();
    setCreating(false);
  };

  const handleSaveEdit = async (data) => {
    await base44.entities.AlterRelationship.update(editingRel.id, data);
    invalidate();
    setEditingRel(null);
  };

  const handleDelete = async (rel) => {
    await base44.entities.AlterRelationship.delete(rel.id);
    invalidate();
    setConfirmDelete(null);
  };

  return (
    <div className="space-y-4 pb-8 rounded-2xl" data-pf-surface>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Relationships</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            How this {t.alter} connects to other {t.alters}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreating(true)} className="flex-shrink-0">
          <Plus className="w-3.5 h-3.5 mr-1" /> Add relationship
        </Button>
      </div>

      {myRelationships.length === 0 ? (
        <div className="text-center py-10">
          <Link2 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No relationships yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add a relationship to show how this {t.alter} connects to other {t.alters}.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/50">
          {myRelationships.map(rel => {
            const arrow = relativeArrow(rel.direction, rel._selfIsA);
            return (
              <div key={rel.id} className="px-3 py-2.5 flex items-center gap-2.5 hover:bg-muted/20 transition-colors">
                {/* Direction relative to this alter */}
                <span className="text-muted-foreground text-sm w-4 text-center flex-shrink-0">{arrow}</span>

                {/* The other alter — tap to navigate */}
                <Link to={`/alter/${rel.other.id}`} className="flex items-center gap-2 min-w-0 hover:underline">
                  <AlterAvatar alter={rel.other} size={28} />
                  <span className="text-sm text-foreground font-medium truncate">{rel.other.name}</span>
                </Link>

                {/* Relationship type */}
                <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1.5 flex-shrink-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: rel.color || "#6b7280" }}
                  />
                  {relTypeLabel(rel)}
                </span>

                {/* Actions */}
                <button onClick={() => setEditingRel(rel)}
                  className="text-muted-foreground hover:text-foreground p-0.5 flex-shrink-0" title="Edit relationship">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setConfirmDelete(rel)}
                  className="text-muted-foreground hover:text-destructive p-0.5 flex-shrink-0" title="Delete relationship">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <CreateRelationshipModal
          allAlters={allAlters.filter(a => !a.is_archived || a.id === alter.id)}
          alterA={alter}
          alterB={null}
          onSave={handleSaveNew}
          onClose={() => setCreating(false)}
        />
      )}

      {editingRel && (
        <EditRelationshipModal
          rel={editingRel}
          alterMap={alterMap}
          onSave={handleSaveEdit}
          onClose={() => setEditingRel(null)}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setConfirmDelete(null)}>
          <div className="bg-card border border-border rounded-xl p-4 shadow-xl max-w-xs mx-4 space-y-3"
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold">Delete relationship?</p>
            <p className="text-xs text-muted-foreground">This cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" className="flex-1" onClick={() => handleDelete(confirmDelete)}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
