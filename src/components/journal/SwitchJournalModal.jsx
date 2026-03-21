import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, BookOpen } from "lucide-react";

function buildTemplate(date) {
  return `## Switch Log (${format(date, "MMMM d, yyyy · h:mm a")})

**What triggered the switch?**
- 

**How were you feeling before?**
- 

**How were you feeling after?**
- 

### Symptoms (0-10)
- Anxiety / worry:
- Emotional reactivity:
- Dissociation (DP/DR):
- Memory gaps:
- Physical tension:

### Notes
- `;
}

export default function SwitchJournalModal({ open, onClose, sessionId, authorAlterId }) {
  const now = new Date();
  const [title, setTitle] = useState(`Switch Log — ${format(now, "MMM d, yyyy")}`);
  const [content, setContent] = useState(buildTemplate(now));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.JournalEntry.create({
      title,
      content,
      entry_type: "switch_log",
      tags: ["switch"],
      author_alter_id: authorAlterId || "",
      fronting_session_id: sessionId || "",
      allowed_alter_ids: [],
    });
    toast.success("Switch journal saved!");
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Switch Journal
          </DialogTitle>
        </DialogHeader>

        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Entry title"
          className="text-sm font-medium"
        />

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="flex-1 font-mono text-sm resize-none min-h-[380px]"
          placeholder="Write your switch journal..."
        />

        <div className="flex gap-2 pt-2 border-t border-border/50">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Skip
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-primary hover:bg-primary/90">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Journal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}