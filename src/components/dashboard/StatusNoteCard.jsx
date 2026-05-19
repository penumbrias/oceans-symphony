import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Edit2, X } from "lucide-react";
import { toast } from "sonner";
import { localEntities } from "@/api/base44Client";

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
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [tempStatus, setTempStatus] = useState("");

  const { data: allStatusNotes = [] } = useQuery({
    queryKey: ["statusNotes"],
    queryFn: () => localEntities.StatusNote.list(),
  });

  const latestStatusNote = allStatusNotes
    .slice()
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

  const handleSave = async () => {
    const note = tempStatus.trim();
    if (!note) { setEditing(false); return; }
    setEditing(false);
    setTempStatus("");
    await localEntities.StatusNote.create({
      timestamp: new Date().toISOString(),
      note,
    });
    queryClient.invalidateQueries({ queryKey: ["statusNotes"] });
    toast.success("Status saved");
  };

  return (
    <div className="mb-4">
      {editing ? (
        <div className="flex items-center gap-2">
          <Input
            value={tempStatus}
            onChange={(e) => setTempStatus(e.target.value)}
            placeholder="What's happening right now..."
            className="text-sm h-9 flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") { setTempStatus(""); setEditing(false); }
            }}
          />
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
