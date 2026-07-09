import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Pencil, X, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import MentionTextarea from "@/components/shared/MentionTextarea";
import RichText from "@/components/shared/RichText";
import { applyWhisper } from "@/lib/whisperUtils";
import { applyLogCommands } from "@/lib/logCommands";
import { useTerms } from "@/lib/useTerms";
import { format } from "date-fns";

// Notify the alters a whisper is addressed to (recipients are peeled off
// the body, so they aren't in the saved content).
async function notifyWhisper(recipientIds, { sourceId, alterId }) {
  for (const rid of recipientIds || []) {
    try {
      await base44.entities.MentionLog.create({
        mentioned_alter_id: rid,
        author_alter_id: null,
        log_type: "mention",
        source_type: "note",
        source_id: sourceId,
        source_label: "Whisper in a note",
        source_date: new Date().toISOString(),
        preview_text: "🔒 private whisper",
        navigate_path: `/alter/${alterId}`,
      });
    } catch { /* best-effort */ }
  }
}

export default function NotesTab({ alterId }) {
  const queryClient = useQueryClient();
  const t = useTerms();
  const [composing, setComposing] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: notes = [] } = useQuery({
    queryKey: ["alterNotes", alterId],
    queryFn: () => base44.entities.AlterNote.filter({ alter_id: alterId }, "-created_date"),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const createNote = async () => {
    if (!newContent.trim()) return;
    const lc = await applyLogCommands(newContent.trim(), { isRich: false });
    const w = applyWhisper(lc.content, alters, { allowWholeBlur: false, rich: lc.logged.length > 0, surfaceLabel: `${t.alter} note` });
    if (w === null) return; // user backed out of the whole-blur warning
    setSaving(true);
    const note = await base44.entities.AlterNote.create({ alter_id: alterId, content: w.content });
    await notifyWhisper(w.recipientIds, { sourceId: note.id, alterId });
    queryClient.invalidateQueries({ queryKey: ["alterNotes", alterId] });
    setNewContent("");
    setComposing(false);
    setSaving(false);
  };

  const saveEdit = async () => {
    if (!editContent.trim()) return;
    const lc = await applyLogCommands(editContent.trim(), { isRich: false });
    const w = applyWhisper(lc.content, alters, { allowWholeBlur: false, rich: lc.logged.length > 0, surfaceLabel: `${t.alter} note` });
    if (w === null) return;
    setSaving(true);
    await base44.entities.AlterNote.update(editingId, { content: w.content });
    await notifyWhisper(w.recipientIds, { sourceId: editingId, alterId });
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
        <div className="text-center py-16 text-muted-foreground text-sm rounded-2xl" data-pf-surface>
          <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          This {t.alter} has no notes.
        </div>
      )}

      {notes.map((note) => (
        <div key={note.id} className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-2">
          {editingId === note.id ? (
            <div className="space-y-2">
              <MentionTextarea
                value={editContent}
                onChange={setEditContent}
                alters={alters}
                placeholder={`Edit note… @ to mention, /w @name [secret] to whisper`}
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
              <div className="text-sm text-foreground"><RichText content={note.content} alters={alters} /></div>
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
          <MentionTextarea
            placeholder={`Write a note… @ to mention, /w @name [secret] to whisper`}
            value={newContent}
            onChange={setNewContent}
            alters={alters}
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