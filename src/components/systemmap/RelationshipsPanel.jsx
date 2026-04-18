import React, { useState } from "react";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import CreateRelationshipModal, { RELATIONSHIP_PRESETS } from "./CreateRelationshipModal";

export function AlterAvatar({ alter, size = 24 }) {
  if (!alter) return <div className="rounded-full bg-muted flex-shrink-0" style={{ width: size, height: size }} />;
  return alter.avatar_url ? (
    <img src={alter.avatar_url} className="rounded-full object-cover flex-shrink-0 border border-border"
      style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: alter.color || "#8b5cf6", fontSize: size * 0.4 }}>
      {alter.name?.charAt(0)?.toUpperCase()}
    </div>
  );
}

function DirArrow({ direction }) {
  if (direction === "a_to_b") return <span className="text-muted-foreground text-sm">→</span>;
  if (direction === "b_to_a") return <span className="text-muted-foreground text-sm">←</span>;
  return <span className="text-muted-foreground text-sm">↔</span>;
}

function RelTypeLabel({ rel }) {
  return rel.relationship_type === "Custom" ? (rel.custom_label || "Custom") : rel.relationship_type;
}

function EditRelationshipModal({ rel, alterMap, onSave, onClose }) {
  const [direction, setDirection] = useState(rel.direction);
  const [relType, setRelType] = useState(rel.relationship_type);
  const [customLabel, setCustomLabel] = useState(rel.custom_label || "");
  const [color, setColor] = useState(rel.color || "#6b7280");
  const [notes, setNotes] = useState(rel.notes || "");

  const alterA = alterMap[rel.alter_id_a];
  const alterB = alterMap[rel.alter_id_b];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-5 shadow-xl w-full max-w-sm mx-4 space-y-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Edit Relationship</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
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
          <select value={relType} onChange={e => setRelType(e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm">
            {RELATIONSHIP_PRESETS.map(p => (
              <option key={p.type} value={p.type}>{p.type}</option>
            ))}
          </select>
          {relType === "Custom" && (
            <input value={customLabel} onChange={e => setCustomLabel(e.target.value)}
              placeholder="Custom label..."
              className="mt-2 w-full h-9 px-3 rounded-md border border-border bg-background text-sm" />
          )}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Color</p>
          <div className="flex items-center gap-2">
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              className="w-8 h-8 rounded border border-border cursor-pointer bg-transparent" />
            <span className="text-xs text-muted-foreground font-mono">{color}</span>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Notes</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm resize-none" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={() => onSave({ direction, relationship_type: relType, custom_label: customLabel, color, notes })}>Save</Button>
        </div>
      </div>
    </div>
  );
}

export default function RelationshipsPanel({ relationships, alters, locations = [], onRefreshRelationships }) {
  const queryClient = useQueryClient();
  const [filterAlterId, setFilterAlterId] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingRel, setEditingRel] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [open, setOpen] = useState(true);

  const alterMap = Object.fromEntries(alters.map(a => [a.id, a]));
  const locationMap = Object.fromEntries(locations.map(l => [l.id, l]));

  const filteredRels = filterAlterId
    ? relationships.filter(r => r.alter_id_a === filterAlterId || r.alter_id_b === filterAlterId)
    : relationships;

  // Location rows: alters that have inner_world_location_id set
  const locationRows = alters.filter(a => !a.is_archived && a.inner_world_location_id);
  const filteredLocationRows = filterAlterId
    ? locationRows.filter(a => a.id === filterAlterId)
    : locationRows;

  const handleDelete = async (rel) => {
    await base44.entities.AlterRelationship.delete(rel.id);
    queryClient.invalidateQueries({ queryKey: ["alterRelationships"] });
    onRefreshRelationships?.();
    setConfirmDelete(null);
  };

  const handleSaveNew = async (data) => {
    await base44.entities.AlterRelationship.create(data);
    queryClient.invalidateQueries({ queryKey: ["alterRelationships"] });
    onRefreshRelationships?.();
    setCreating(false);
  };

  const handleSaveEdit = async (data) => {
    await base44.entities.AlterRelationship.update(editingRel.id, data);
    queryClient.invalidateQueries({ queryKey: ["alterRelationships"] });
    onRefreshRelationships?.();
    setEditingRel(null);
  };

  const totalCount = filteredRels.length + filteredLocationRows.length;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
        <span className="font-semibold text-sm text-foreground">
          Relationships &amp; Locations ({totalCount})
        </span>
        <div className="flex items-center gap-2">
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <>
          <div className="px-3 pb-2 border-t border-border pt-2 flex flex-wrap gap-2 items-center">
            <select value={filterAlterId} onChange={e => setFilterAlterId(e.target.value)}
              className="h-8 px-2 rounded border border-border bg-background text-xs">
              <option value="">All alters</option>
              {alters.filter(a => !a.is_archived).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <Button size="sm" className="text-xs h-8" onClick={() => setCreating(true)}>
              <Plus className="w-3 h-3 mr-1" /> Add Relationship
            </Button>
          </div>

          <div className="divide-y divide-border/50">
            {filteredRels.length === 0 && filteredLocationRows.length === 0 && (
              <p className="text-xs text-muted-foreground px-4 py-3 text-center">No relationships yet</p>
            )}

            {/* Relationship rows */}
            {filteredRels.map(rel => {
              const a = alterMap[rel.alter_id_a];
              const b = alterMap[rel.alter_id_b];
              return (
                <div key={rel.id} className="px-4 py-2.5 flex items-center gap-2.5 hover:bg-muted/20 transition-colors">
                  {/* Alter A */}
                  <AlterAvatar alter={a} size={22} />
                  <span className="text-xs text-foreground font-medium">{a?.name || "?"}</span>

                  {/* Direction arrow */}
                  <DirArrow direction={rel.direction} />

                  {/* Relationship type */}
                  <span className="text-xs text-muted-foreground"><RelTypeLabel rel={rel} /></span>

                  {/* Arrow other way / Alter B */}
                  <AlterAvatar alter={b} size={22} />
                  <span className="text-xs text-foreground font-medium">{b?.name || "?"}</span>

                  {/* Color dot */}
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 ml-auto" style={{ backgroundColor: rel.color || "#6b7280" }} />

                  {/* Actions */}
                  <button onClick={() => setEditingRel(rel)}
                    className="text-muted-foreground hover:text-foreground p-0.5 flex-shrink-0">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setConfirmDelete(rel)}
                    className="text-muted-foreground hover:text-destructive p-0.5 flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {/* Location rows */}
            {filteredLocationRows.map(alter => {
              const loc = locationMap[alter.inner_world_location_id];
              return (
                <div key={`loc-${alter.id}`} className="px-4 py-2.5 flex items-center gap-2.5 hover:bg-muted/20 transition-colors">
                  <AlterAvatar alter={alter} size={22} />
                  <span className="text-xs text-foreground font-medium">{alter.name}</span>
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">located in</span>
                  <span className="text-xs text-foreground font-medium">{loc?.name || "Unknown location"}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {creating && alters.filter(a => !a.is_archived).length >= 2 && (
        <CreateRelationshipModal
          alterA={alters.filter(a => !a.is_archived)[0]}
          alterB={alters.filter(a => !a.is_archived)[1]}
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