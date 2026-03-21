import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Pencil, X, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

export default function NotesTab({ alterId }) {
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: notes = [] } = useQuery({
    queryKey: ["alterNotes", alterId],
    queryFn: () => base44.entities.AlterNote.filter({ alter_id: alterId }, "-created_date"),
  });

  const createNote = async () => {
    if (!newContent.trim()) return;
    setSaving(true);
    await base44.entities.AlterNote.create({ alter_id: alterId, content: newContent.trim() });
    queryClient.invalidateQueries({ queryKey: ["alterNotes", alterId] });
    setNewContent("");
    setComposing(false);
    setSaving(false);
  };

  const saveEdit = async () => {
    if (!editContent.trim()) return;
    setSaving(true);
    await base44.entities.AlterNote.update(editingId, { content: editContent.trim() });
    queryClient.invalidateQueries({ queryKey: ["alterNotes", alterId] });
    setEditingId(null);
    setSaving(false);
  };

  const deleteNote = async (id) => {
    await base44.entities.AlterNote.delete(id);
    queryClient.invalidateQueries({ queryKey: ["alterNotes", alterId] });
  };

  return (
    <div className="space-y-4">
      {notes.length === 0 && !composing && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          This member has no notes.
        </div>
      )}

      {notes.map((note) => (
        <div key={note.id} className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-2">
          {editingId === note.id ? (
            <div className="space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-[80px] text-sm"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="w-3.5 h-3.5" /></Button>
                <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={saveEdit} disabled={saving}>
                  <Check className="w-3.5 h-3.5 mr-1" /> Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
              <div className="flex items-center justify-between pt-1 border-t border-border/30">
                <span className="text-xs text-muted-foreground">
                  {note.created_date ? format(new Date(note.created_date), "MMM d, yyyy") : ""}
                </span>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingId(note.id); setEditContent(note.content); }} className="text-muted-foreground hover:text-foreground p-1">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteNote(note.id)} className="text-muted-foreground hover:text-destructive p-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ))}

      {composing ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <Textarea
            placeholder="Write a note..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            className="min-h-[100px] text-sm"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => { setComposing(false); setNewContent(""); }}>Cancel</Button>
            <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={createNote} disabled={saving || !newContent.trim()}>
              Save Note
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setComposing(true)}>
          <Plus className="w-4 h-4" /> Add Note
        </Button>
      )}
    </div>
  );
}