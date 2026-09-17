// The Journal tab on an alter's (or group's) profile — that member's own
// slice of the journals, right where their other per-member surfaces
// (notes, board, history) live. Reuses the Journals page's own pieces
// (JournalEntryCard / JournalViewModal / JournalEditorModal) rather than
// re-implementing any of them; entries written here are ordinary
// JournalEntry rows attributed to the profile's member, so they appear on
// the Journals page too.
//
// `alterIds` scopes the list: entries authored OR co-authored by any of
// them. An alter profile passes [alter.id]; a group profile passes its
// member ids. `defaultAuthorId` pre-attributes new entries (alter
// profiles only).

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { BookOpen, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import JournalEntryCard from "@/components/journal/JournalEntryCard";
import JournalViewModal from "@/components/journal/JournalViewModal";
import JournalEditorModal from "@/components/journal/JournalEditorModal";

export default function ProfileJournalTab({ alterIds = [], defaultAuthorId = null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [viewEntry, setViewEntry] = useState(null);
  const [editEntry, setEditEntry] = useState(null);
  const [showEditor, setShowEditor] = useState(false);

  const { data: entries = [] } = useQuery({
    queryKey: ["journalEntries"],
    queryFn: () => base44.entities.JournalEntry.list(),
  });
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  const idSet = useMemo(() => new Set(alterIds), [alterIds]);
  const mine = useMemo(() => entries
    .filter((e) => idSet.has(e.author_alter_id) || (e.co_author_alter_ids || []).some((id) => idSet.has(id)))
    .sort((a, b) => new Date(b.updated_date || b.created_date || 0) - new Date(a.updated_date || a.created_date || 0)),
  [entries, idSet]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground flex-1">
          {mine.length} {mine.length === 1 ? "entry" : "entries"}
        </p>
        {defaultAuthorId && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"
            onClick={() => navigate(`/journals?author=${defaultAuthorId}`)}>
            <ExternalLink className="w-3.5 h-3.5" /> Open in Journals
          </Button>
        )}
        <Button size="sm" className="gap-1.5"
          onClick={() => { setEditEntry(null); setShowEditor(true); }}>
          <Plus className="w-4 h-4" /> New entry
        </Button>
      </div>

      {mine.length === 0 ? (
        <div className="text-center py-10 space-y-2">
          <BookOpen className="w-8 h-8 mx-auto text-muted-foreground/50" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No journal entries yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {mine.map((e) => (
            <JournalEntryCard key={e.id} entry={e} altersById={altersById}
              onClick={() => setViewEntry(e)} />
          ))}
        </div>
      )}

      <JournalViewModal
        open={!!viewEntry}
        onClose={() => setViewEntry(null)}
        entry={viewEntry}
        altersById={altersById}
        onEdit={(e) => { setViewEntry(null); setEditEntry(e); setShowEditor(true); }}
        onDelete={async (e) => {
          if (!e?.id) return;
          try {
            await base44.entities.JournalEntry.delete(e.id);
            queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
            queryClient.invalidateQueries({ queryKey: ["journals"] });
            setViewEntry(null);
            toast.success("Entry deleted");
          } catch (err) {
            toast.error(err?.message || "Couldn't delete the entry");
          }
        }}
      />
      <JournalEditorModal
        key={editEntry?.id || "new"}
        isOpen={showEditor}
        onClose={() => { setShowEditor(false); setEditEntry(null); }}
        editingEntry={editEntry}
        alters={alters}
        currentAlterId={defaultAuthorId}
      />
    </div>
  );
}
