import React, { useState, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Search, Check, X, Type, Sparkles, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { useSystemIdentity } from "@/lib/useSystemIdentity";
import { useAlterLabel } from "@/lib/useAlterLabel";
import SystemAvatar from "@/components/shared/SystemAvatar";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { MiniToolbar, useTextareaInsert } from "@/components/shared/MiniToolbar";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import { processUploadedImage, saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";
import { isLocalMode } from "@/lib/storageMode";

// Edit a bulletin's content + author(s). Rebuilt to use the SAME rich-editing
// stack as the composer (Simple/Fancy toggle, @mention textarea, formatting
// MiniToolbar, image/GIF insert) so editing no longer strips formatting and you
// can format a post you're editing. `is_rich` is carried through (initialised
// from the bulletin and saved from the Fancy toggle) so rich posts stay rich.
// Re-attribution writes the same author fields the composer does.
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
  // Start in Fancy when the post was rich, so its formatting is preserved.
  const [richMode, setRichMode] = useState(!!bulletin?.is_rich);
  const [uploadingImage, setUploadingImage] = useState(false);
  const textareaRef = useRef(null);
  const imageInputRef = useRef(null);
  const insertHtml = useTextareaInsert(textareaRef, content, setContent);

  React.useEffect(() => {
    if (!open || !bulletin) return;
    setContent(bulletin.content || "");
    setSelectedAuthorIds(initialAuthorIds);
    setSystemAuthor(initialSystemAuthor);
    setRichMode(!!bulletin.is_rich);
  }, [open, bulletin, initialAuthorIds, initialSystemAuthor]);

  if (!bulletin) return null;

  const activeAlters = (alters || []).filter((a) => !a.is_archived);

  const handleComposerImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("That doesn't look like an image."); return; }
    setUploadingImage(true);
    try {
      const { dataUrl, isGif, sizeKB } = await processUploadedImage(file, 800, 0.85);
      if (isGif && sizeKB > 3000) toast.warning(`Large GIF (${(sizeKB / 1024).toFixed(1)}MB) — grows your storage & backups.`);
      let url = dataUrl;
      if (isLocalMode()) {
        const id = `bulletinimg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        await saveLocalImage(id, dataUrl);
        url = createLocalImageUrl(id);
      }
      insertHtml(`<img src="${url}" alt="" />`, "");
      setRichMode(true);
      toast.success(isGif ? "GIF added!" : "Image added!");
    } catch (err) {
      toast.error(err?.message || "Couldn't add that image.");
    } finally {
      setUploadingImage(false);
    }
  };

  const toggleAlter = (id) => {
    setSystemAuthor(false);
    setSelectedAuthorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSystem = () => {
    setSystemAuthor((prev) => {
      const next = !prev;
      if (next) setSelectedAuthorIds([]);
      return next;
    });
  };

  const handleSave = async () => {
    if (!content.trim()) { toast.error("Bulletin can't be empty"); return; }
    setSaving(true);
    try {
      const finalIds = systemAuthor ? [] : selectedAuthorIds;
      await base44.entities.Bulletin.update(bulletin.id, {
        content: content.trim(),
        author_alter_ids: finalIds,
        author_alter_id: systemAuthor ? null : (finalIds[0] || null),
        // Carry the rich flag so formatting renders (and isn't stripped on edit).
        is_rich: richMode,
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium">Content</label>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setRichMode(false)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${!richMode ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
                  <Type className="w-3 h-3" /> Simple
                </button>
                <button type="button" onClick={() => setRichMode(true)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all ${richMode ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`}>
                  <Sparkles className="w-3 h-3" /> Fancy
                </button>
              </div>
            </div>
            <MentionTextarea
              ref={textareaRef}
              value={content}
              onChange={setContent}
              alters={activeAlters}
              systemName={systemIdentity.name}
              placeholder="Bulletin text… @ to mention"
              className="min-h-[100px] text-sm resize-none"
            />
            {richMode && (
              <div className="mt-1.5 rounded-lg border border-border/50 overflow-hidden">
                <div className="flex items-center gap-1 px-1.5 py-1 bg-muted/10">
                  <button type="button" title="Insert image / GIF" disabled={uploadingImage}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => imageInputRef.current?.click()}
                    className="h-6 px-1.5 flex items-center gap-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs font-medium flex-shrink-0 disabled:opacity-50">
                    {uploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} Image / GIF
                  </button>
                  <AssetButton onPick={(url) => { insertHtml(`<img src="${url}" alt="" />`, ""); setRichMode(true); }} className="h-6 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 flex-shrink-0" title="Insert from assets" />
                  <span className="text-[0.625rem] text-muted-foreground/70 ml-1">Select text, then tap a style. @mentions still work.</span>
                </div>
                <MiniToolbar onInsert={insertHtml} />
                <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={handleComposerImage} />
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Signed by</label>
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
