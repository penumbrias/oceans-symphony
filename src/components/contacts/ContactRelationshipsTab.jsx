import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Users, User, Network, Check } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { fetchActiveContactRelationshipTypes, contactDisplayName } from "@/lib/contacts";
import ContactRelationshipTypeField from "@/components/contacts/ContactRelationshipTypeField";

// Phase 3 — relationships between a contact and the system / individual
// alters / groups. The relationship TYPE comes from a SEPARATE, editable
// contact catalogue (Friend, Family, Therapist…) and is free-entry — NOT the
// internal alter RelationshipType set (whose "Split from" / "Protected by"
// dynamics don't fit outside people).
//
// Entity: localEntities.ContactRelationship
//   { contact_id, target_type: "system"|"alter"|"group", target_id (null for
//     system), relationship_type (a free-entry LABEL string),
//     has_met (bool), notes, created_date }
//
// Every "system"/"alter" word routes through useTerms — never hardcoded.

const TARGET_TYPES = [
  { key: "system", icon: Network },
  { key: "alter", icon: User },
  { key: "group", icon: Users },
];

export default function ContactRelationshipsTab({ contact }) {
  const t = useTerms();
  const queryClient = useQueryClient();
  const contactId = contact?.id;

  const { data: rels = [] } = useQuery({
    queryKey: ["contactRelationships", contactId],
    queryFn: () => base44.entities.ContactRelationship.filter({ contact_id: contactId }),
    enabled: !!contactId,
  });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: types = [] } = useQuery({ queryKey: ["contactRelationshipTypes"], queryFn: () => fetchActiveContactRelationshipTypes(base44.entities) });

  const [adding, setAdding] = useState(false);
  const [targetType, setTargetType] = useState("system");
  const [targetId, setTargetId] = useState(null);
  const [relType, setRelType] = useState("");
  const [hasMet, setHasMet] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const groupOptions = useMemo(
    () => groups
      .filter((g) => g && !g.is_archived)
      .map((g) => ({ id: g.id, label: g.name || "Untitled group", color: g.color }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [groups]
  );

  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const groupsById = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const typeColor = (label) => types.find((x) => x.label === label)?.color || "#94a3b8";

  const resetForm = () => {
    setAdding(false); setTargetType("system"); setTargetId(null);
    setRelType(""); setHasMet(false); setNotes("");
  };

  const canSave = relType.trim() && (targetType === "system" || targetId);

  const save = async () => {
    if (!canSave || saving) return;
    const label = relType.trim();
    setSaving(true);
    try {
      await base44.entities.ContactRelationship.create({
        contact_id: contactId,
        target_type: targetType,
        target_id: targetType === "system" ? null : targetId,
        relationship_type: label,
        has_met: !!hasMet,
        notes: notes.trim(),
        created_date: new Date().toISOString(),
      });
      // A typed-in type that isn't in the catalogue gets added, so it becomes a
      // reusable suggestion next time (and shows up in the manager to edit).
      if (label && !types.some((x) => (x.label || "").toLowerCase() === label.toLowerCase())) {
        try {
          await base44.entities.ContactRelationshipType.create({ label, color: "#94a3b8", order: types.length });
          queryClient.invalidateQueries({ queryKey: ["contactRelationshipTypes"] });
        } catch { /* non-fatal — the relationship still saved */ }
      }
      queryClient.invalidateQueries({ queryKey: ["contactRelationships", contactId] });
      resetForm();
      toast.success("Relationship added");
    } catch (err) {
      toast.error(err?.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await base44.entities.ContactRelationship.delete(id);
      queryClient.invalidateQueries({ queryKey: ["contactRelationships", contactId] });
    } catch (err) {
      toast.error(err?.message || "Couldn't delete");
    }
  };

  const targetLabel = (r) => {
    if (r.target_type === "system") return t.System;
    if (r.target_type === "group") return groupsById[r.target_id]?.name || "(deleted group)";
    return altersById[r.target_id]?.name || `(deleted ${t.alter})`;
  };
  const targetColor = (r) => {
    if (r.target_type === "alter") return altersById[r.target_id]?.color || "#8b5cf6";
    if (r.target_type === "group") return groupsById[r.target_id]?.color || "#64748b";
    return "#0ea5e9";
  };

  // Sort: system relationships first, then by target name.
  const sorted = [...rels].sort((a, b) => {
    const order = { system: 0, group: 1, alter: 2 };
    if (order[a.target_type] !== order[b.target_type]) return order[a.target_type] - order[b.target_type];
    return targetLabel(a).localeCompare(targetLabel(b));
  });

  const name = contactDisplayName(contact);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        How {name} relates to your {t.system.toLowerCase()} and individual {t.alters.toLowerCase()} — like the relationships you can set between {t.alters.toLowerCase()}, but with an outside person.
      </p>

      {!adding && (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4" /> Add relationship
        </Button>
      )}

      {adding && (
        <div className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
          {/* Who is on the other side */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Relationship with</label>
            <div className="grid grid-cols-3 gap-1.5 mt-1.5">
              {TARGET_TYPES.map(({ key, icon: Icon }) => {
                const label = key === "system" ? t.System : key === "alter" ? `An ${t.alter}` : "A group";
                const active = targetType === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setTargetType(key); setTargetId(null); }}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs transition-colors ${active ? "border-primary bg-primary/10 text-primary font-medium" : "border-border/60 text-muted-foreground hover:bg-muted/40"}`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {targetType === "alter" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Which {t.alter}?</label>
              <div className="mt-1.5">
                <AlterSearchSelect alters={alters} value={targetId} onChange={setTargetId} terms={t} showNone={false} placeholder={`Pick an ${t.alter}…`} />
              </div>
            </div>
          )}

          {targetType === "group" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Which group?</label>
              <div className="mt-1.5">
                <SearchableSelect value={targetId} onChange={setTargetId} options={groupOptions} placeholder="Pick a group…" searchPlaceholder="Search groups…" emptyMessage="No groups yet" />
              </div>
            </div>
          )}

          {/* Relationship type — free entry + editable contact catalogue */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Relationship type</label>
            <div className="mt-1.5">
              <ContactRelationshipTypeField value={relType} onChange={setRelType} />
            </div>
          </div>

          {targetType !== "system" && (
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input type="checkbox" checked={hasMet} onChange={(e) => setHasMet(e.target.checked)} className="rounded" />
              They've met {targetType === "alter" ? `this ${t.alter}` : "this group"}
            </label>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="How they feel about each other, history, beliefs, boundaries…"
              className="mt-1.5 w-full bg-background border border-input rounded-lg px-2.5 py-1.5 text-sm resize-y outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={!canSave || saving} className="gap-1.5">
              <Check className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}

      {sorted.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground text-center py-6">No relationships recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => (
            <div key={r.id} className="rounded-lg border border-border/50 bg-card p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: targetColor(r) }} />
                    <span className="text-sm font-medium truncate">{targetLabel(r)}</span>
                    <span className="text-[0.6875rem] px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: typeColor(r.relationship_type) }}>
                      {r.relationship_type}
                    </span>
                    {r.has_met && <span className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">met</span>}
                  </div>
                  {r.notes && <p className="text-sm whitespace-pre-wrap mt-1.5 text-muted-foreground">{r.notes}</p>}
                </div>
                <button type="button" onClick={() => remove(r.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
