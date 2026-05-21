import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { useSystemIdentity } from "@/lib/useSystemIdentity";
import { useAlterLabel } from "@/lib/useAlterLabel";
import SystemAvatar from "@/components/shared/SystemAvatar";

// Edit a bulletin's content + author(s). Re-attribution writes the
// same fields the composer writes: `author_alter_ids` (array),
// `author_alter_id` (the head id used for legacy/single-author
// surfaces), and `read_by_alter_ids` (so the new authors don't get a
// "new mention" badge on a post they're authoring). Picking no alters
// and toggling the System option attributes the post to the system as
// a whole, mirroring the `-system` signpost path in the composer.
export default function BulletinEditModal({ bulletin, alters, open, onClose }) {
  const qc = useQueryClient();
  const terms = useTerms();
  const systemIdentity = useSystemIdentity();
  const formatAlter = useAlterLabel();

  const initialAuthorIds = useMemo(() => {
    if (bulletin?.author_alter_ids?.length) return bulletin.author_alter_ids;
    if (bulletin?.author_alter_id) return [bulletin.author_alter_id];
    return [];
  }, [bulletin]);
  const initialSystemAuthor = !!bulletin && !bulletin.author_alter_id && (bulletin.author_alter_ids || []).length === 0;

  const [content, setContent] = useState(bulletin?.content || "");
  const [selectedAuthorIds, setSelectedAuthorIds] = useState(initialAuthorIds);
  const [systemAuthor, setSystemAuthor] = useState(initialSystemAuthor);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!open || !bulletin) return;
    setContent(bulletin.content || "");
    setSelectedAuthorIds(initialAuthorIds);
    setSystemAuthor(initialSystemAuthor);
  }, [open, bulletin, initialAuthorIds, initialSystemAuthor]);

  if (!bulletin) return null;

  const activeAlters = (alters || []).filter((a) => !a.is_archived);

  const toggleAlter = (id) => {
    setSystemAuthor(false);
    setSelectedAuthorIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSystem = () => {
    setSystemAuthor((prev) => {
      const next = !prev;
      if (next) setSelectedAuthorIds([]);
      return next;
    });
  };

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error("Bulletin can't be empty");
      return;
    }
    setSaving(true);
    try {
      const finalIds = systemAuthor ? [] : selectedAuthorIds;
      await base44.entities.Bulletin.update(bulletin.id, {
        content: content.trim(),
        author_alter_ids: finalIds,
        author_alter_id: systemAuthor ? null : (finalIds[0] || null),
      });
      qc.invalidateQueries({ queryKey: ["bulletins"] });
      toast.success("Bulletin updated");
      onClose?.();
    } catch (e) {
      toast.error(e?.message || "Couldn't update bulletin");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit bulletin</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-1.5">Content</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[100px] text-sm"
              placeholder="Bulletin text…"
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">
              Author{selectedAuthorIds.length > 1 ? "s" : ""}
              {selectedAuthorIds.length > 0 && !systemAuthor && (
                <span className="text-xs font-normal text-muted-foreground ml-2">
                  ({selectedAuthorIds.length} selected)
                </span>
              )}
            </label>
            <div className="border border-border rounded-lg bg-muted/20 max-h-56 overflow-y-auto">
              <label className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40 border-b border-border/50">
                <Checkbox
                  checked={systemAuthor}
                  onCheckedChange={toggleSystem}
                  id="bulletin-edit-system-author"
                />
                <SystemAvatar size="sm" />
                <span className="text-sm flex-1">
                  {systemIdentity.name || "System"}
                  <span className="text-muted-foreground text-xs ml-1">
                    (no specific {terms.alter})
                  </span>
                </span>
              </label>
              {activeAlters.map((alter) => (
                <label
                  key={alter.id}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40 last:border-b-0 border-b border-border/30"
                >
                  <Checkbox
                    checked={selectedAuthorIds.includes(alter.id)}
                    onCheckedChange={() => toggleAlter(alter.id)}
                    id={`bulletin-edit-alter-${alter.id}`}
                  />
                  <div
                    className="w-6 h-6 rounded-full flex-shrink-0"
                    style={{ backgroundColor: alter.color || "hsl(var(--muted))" }}
                  />
                  <span className="text-sm">{formatAlter(alter)}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Pick one or more {terms.alters} to re-attribute this post, or check {systemIdentity.name || "System"} to attribute it to the whole {terms.system}.
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !content.trim()}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
