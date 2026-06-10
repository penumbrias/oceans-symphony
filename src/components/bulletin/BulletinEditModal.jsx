import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Search, Check, X } from "lucide-react";
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
  const [authorSearch, setAuthorSearch] = useState("");
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
            <label className="text-sm font-medium block mb-1.5">Signed by</label>
            {/* Selected authors as removable chips (matches the composer). */}
            {(systemAuthor || selectedAuthorIds.length > 0) && (
              <div className="flex flex-wrap gap-1 mb-2">
                {systemAuthor ? (
                  <span className="inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-full border border-border/60 bg-card text-xs">
                    <SystemAvatar size="sm" />
                    <span className="truncate max-w-[8rem]">{systemIdentity.name || "System"}</span>
                  </span>
                ) : (
                  selectedAuthorIds.map((id) => {
                    const a = activeAlters.find((x) => x.id === id);
                    if (!a) return null;
                    return (
                      <span key={id} className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-full border border-border/60 bg-card text-xs">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.color || "#6366f1" }} />
                        <span className="truncate max-w-[8rem]">{formatAlter(a)}</span>
                        <button type="button" aria-label={`Remove ${formatAlter(a)}`} onClick={() => toggleAlter(id)} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                      </span>
                    );
                  })
                )}
              </div>
            )}
            {/* Searchable, scrollable picker. */}
            <div className="relative mb-1.5">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                value={authorSearch}
                onChange={(e) => setAuthorSearch(e.target.value)}
                aria-label={`Search ${terms.alters}`}
                placeholder={`Search ${terms.alters}…`}
                className="w-full h-8 pl-8 pr-2.5 text-xs rounded-lg border border-border/50 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="border border-border/50 rounded-lg bg-muted/10 max-h-48 overflow-y-auto overscroll-contain divide-y divide-border/30">
              <button
                type="button"
                aria-pressed={systemAuthor}
                onClick={toggleSystem}
                className={`w-full flex items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors min-h-[40px] ${systemAuthor ? "bg-primary/10" : "hover:bg-muted/40"}`}
              >
                <SystemAvatar size="sm" />
                <span className="flex-1 truncate">{systemIdentity.name || "System"} <span className="text-muted-foreground">(no specific {terms.alter})</span></span>
                {systemAuthor && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
              </button>
              {activeAlters
                .filter((a) => { const q = authorSearch.toLowerCase(); return !q || a.name?.toLowerCase().includes(q) || a.alias?.toLowerCase().includes(q); })
                .map((alter) => {
                  const on = selectedAuthorIds.includes(alter.id);
                  return (
                    <button
                      key={alter.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleAlter(alter.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors min-h-[40px] ${on ? "bg-primary/10" : "hover:bg-muted/40"}`}
                    >
                      <span className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: alter.color || "hsl(var(--muted))" }}>
                        {on && <Check className="w-3.5 h-3.5 text-white" />}
                      </span>
                      <span className="flex-1 truncate">{formatAlter(alter)}</span>
                    </button>
                  );
                })}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Pick one or more {terms.alters} to re-attribute this post, or {systemIdentity.name || "System"} for the whole {terms.system}.
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
