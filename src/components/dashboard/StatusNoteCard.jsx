import React, { useState } from "react";
import { useTerms } from "@/lib/useTerms";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Edit2, X } from "lucide-react";
import { toast } from "sonner";
import { localEntities, base44 } from "@/api/base44Client";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { prepareAuthoredText, isLogCommandError } from "@/lib/authoredText";
import { saveStatusMentions } from "@/lib/mentionUtils";

// Standalone "What's happening right now…" status note.
//
// Previously this lived inside CurrentFronters, which meant a user
// who hid the Currently Fronting block lost the status field too.
// The dashboard layout settings let users toggle these two
// independently, so the status note also lives as its own pill.
// When BOTH are enabled the CurrentFronters block hides its inline
// version (via the `hideStatusNote` prop) to avoid duplicating it.
//
// Each save creates a NEW immutable StatusNote record — never
// overwrites or updates a previous one. The dashboard preview shows
// the latest entry; the full immutable history is the Tally panel +
// timeline.
export default function StatusNoteCard() {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [tempStatus, setTempStatus] = useState("");

  const { data: allStatusNotes = [] } = useQuery({
    queryKey: ["statusNotes"],
    queryFn: () => localEntities.StatusNote.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const latestStatusNote = allStatusNotes
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

  const handleSave = async () => {
    const raw = tempStatus.trim();
    if (!raw) { setEditing(false); return; }
    setEditing(false);
    setTempStatus("");
    // Execute any inline ~commands (status notes render as plain text, so use
    // plain-label tokens rather than HTML chips).
    let note;
    // Shared text pipeline: ~commands run (plain tokens — statuses render as
    // plain text), "-name" signposts sign the status, @mentions notify.
    let prepared;
    try { prepared = await prepareAuthoredText(raw, { alters, terms, whisper: false, chips: false, surfaceLabel: "status" }); }
    catch (e) { if (isLogCommandError(e)) { toast.error(e.message); return; } throw e; }
    if (prepared === null) return;
    note = prepared.content;
    const authorAlterId = prepared.authorIds[0] || null;
    const created = await localEntities.StatusNote.create({
      timestamp: new Date().toISOString(),
      note,
      ...(authorAlterId ? { author_alter_id: authorAlterId } : {}),
    });
    // @mentions notify like every other surface — the log row is what the
    // "mentions for current fronters" banner and popups read.
    await saveStatusMentions({ note, alters, sourceId: created?.id, authorAlterId });
    queryClient.invalidateQueries({ queryKey: ["mentionLogs"] });
    queryClient.invalidateQueries({ queryKey: ["statusNotes"] });
    queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });
    queryClient.invalidateQueries({ queryKey: ["contactEncounters"] });
    toast.success("Status saved");
  };

  return (
    <div className="mb-4">
      {editing ? (
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <MentionTextarea
              signposts
              value={tempStatus}
              onChange={setTempStatus}
              alters={alters}
              placeholder="What's happening right now..."
              className="text-sm min-h-[36px] max-h-28 resize-none"
              rows={1}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); }
                if (e.key === "Escape") { setTempStatus(""); setEditing(false); }
              }}
            />
          </div>
          <Button size="sm" onClick={handleSave} className="gap-1.5 text-xs h-9 px-3">
            Save
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setTempStatus(""); setEditing(false); }}
            className="h-9 px-2"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <button
          onClick={() => { setTempStatus(""); setEditing(true); }}
          data-tour="status-note"
          className="w-full text-left px-3 py-2.5 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors text-sm text-muted-foreground hover:text-foreground flex items-center justify-between gap-2"
        >
          {latestStatusNote
            ? <span className="truncate">💬 {latestStatusNote.note}</span>
            : <span className="italic">Set a new status...</span>
          }
          <Edit2 className="w-3.5 h-3.5 flex-shrink-0" />
        </button>
      )}
    </div>
  );
}
