import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2, Link2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import CreateRelationshipModal from "@/components/systemmap/CreateRelationshipModal";
import { useTerms } from "@/lib/useTerms";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { toast } from "sonner";
import { isLogCommandError } from "@/lib/authoredText";
import { saveRelationship, deleteRelationship, relationshipsOf, relativeArrow, relationshipTypeLabel, RELATIONSHIPS_KEY } from "@/lib/alterRelationships";
import { TRASH_HINT } from "@/lib/trashSettings";

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

export default function RelationshipsTab({ alter, alters }) {
  const t = useTerms();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editingRel, setEditingRel] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const allAlters = alters || [];

  // Same query the System Map / Lineage tab use — shared cache, single source.
  const { data: relationships = [] } = useQuery({
    queryKey: RELATIONSHIPS_KEY,
    queryFn: () => base44.entities.AlterRelationship.list(),
  });

  const alterMap = useMemo(() => Object.fromEntries(allAlters.map(a => [a.id, a])), [allAlters]);

  // External contacts (Phase 3) — relationships this alter has with people
  // OUTSIDE the system. Read-only here; created/edited from the contact's
  // own profile so there's one source of truth.
  const { data: contactRels = [] } = useQuery({
    queryKey: ["contactRelationshipsForAlter", alter.id],
    queryFn: () => base44.entities.ContactRelationship.filter({ target_type: "alter", target_id: alter.id }),
  });
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list() });
  const contactsById = useMemo(() => Object.fromEntries(contacts.map(c => [c.id, c])), [contacts]);
  const myContactRels = useMemo(
    () => (contactRels || []).filter(r => contactsById[r.contact_id]),
    [contactRels, contactsById]
  );

  // Every relationship involving this alter, normalised so the "other" alter
  // and a this-alter-relative direction are easy to render. Mirrors
  // LineageTab.jsx's myRelationships derivation.
  const myRelationships = useMemo(() => relationshipsOf(relationships, alter.id, alterMap), [relationships, alter.id, alterMap]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: RELATIONSHIPS_KEY });
  const navigatePath = `/alter/${alter.id}?tab=relationships`;

  const save = async (id, data) => {
    try {
      const row = await saveRelationship({ id, data, alters: allAlters, terms: t, navigatePath });
      if (row === null) return false; // backed out of the whisper warning
    } catch (e) { if (isLogCommandError(e)) { toast.error(e.message); return false; } throw e; }
    invalidate();
    return true;
  };

  const handleSaveNew = async (data) => { if (await save(null, data)) setCreating(false); };
  const handleSaveEdit = async (data) => { if (await save(editingRel.id, data)) setEditingRel(null); };

  const handleDelete = async (rel) => {
    await deleteRelationship(rel.id);
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
                  {relationshipTypeLabel(rel)}
                </span>

                {/* Actions */}
                <button onClick={() => setEditingRel(rel)}
                  className="text-muted-foreground hover:text-foreground p-0.5 flex-shrink-0" title="Edit relationship" aria-label={`Edit the relationship with ${rel.other.name}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setConfirmDelete(rel)}
                  className="text-muted-foreground hover:text-destructive p-0.5 flex-shrink-0" title="Delete relationship" aria-label={`Delete the relationship with ${rel.other.name}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* External contacts — read-only mirror of ContactRelationship rows. */}
      {myContactRels.length > 0 && (
        <div className="space-y-2 pt-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">External contacts</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              People outside the {t.system.toLowerCase()} connected to this {t.alter} — manage these from the contact's profile.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-card overflow-hidden divide-y divide-border/50">
            {myContactRels.map(r => {
              const c = contactsById[r.contact_id];
              const cName = (c.nickname && c.nickname.trim()) || (c.name && c.name.trim()) || "Unnamed";
              return (
                <Link key={r.id} to={`/contacts/${c.id}`} className="px-3 py-2.5 flex items-center gap-2.5 hover:bg-muted/20 transition-colors">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0" style={{ backgroundColor: c.color || "#8b5cf6" }}>
                    {cName[0]?.toUpperCase() || "?"}
                  </span>
                  <span className="text-sm text-foreground font-medium truncate">{cName}</span>
                  <span className="text-xs text-muted-foreground ml-auto truncate max-w-[45%] flex-shrink-0">{r.relationship_type}</span>
                </Link>
              );
            })}
          </div>
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
        <CreateRelationshipModal
          rel={editingRel}
          allAlters={allAlters}
          onSave={handleSaveEdit}
          onClose={() => setEditingRel(null)}
        />
      )}

      {confirmDelete && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setConfirmDelete(null)}>
          <div className="bg-card border border-border rounded-xl p-4 shadow-xl max-w-xs mx-4 space-y-3"
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold">Delete relationship?</p>
            <p className="text-xs text-muted-foreground">{TRASH_HINT}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" className="flex-1" onClick={() => handleDelete(confirmDelete)}>Delete</Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
