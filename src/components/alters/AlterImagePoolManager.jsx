import React, { useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Upload, Loader2, Trash2, Images } from "lucide-react";
import { isLocalMode } from "@/lib/storageMode";
import { processUploadedImage, saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

const ROLE_LABEL = { avatar: "avatar", background: "background" };

function PoolThumb({ item, onDelete }) {
  const resolved = useResolvedAvatarUrl(item.image_url);
  return (
    <div className="relative aspect-square rounded-lg overflow-hidden border border-border/50 bg-muted/30 group">
      {resolved
        ? <img src={resolved} alt={item.name || "pool image"} className="w-full h-full object-cover" loading="lazy" />
        : <span className="w-full h-full flex items-center justify-center text-muted-foreground"><Images className="w-5 h-5" /></span>}
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        title="Remove from pool"
        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// Manages exactly ONE alter+role image pool — a small, purpose-built
// component, not a fork of AssetPickerModal (that's a single-select,
// close-on-pick picker reused by 14+ call sites; this is a persistent
// multi-image grid with per-item delete, a different interaction entirely).
export default function AlterImagePoolManager({ open, onClose, alterId, role }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const roleLabel = ROLE_LABEL[role] || role;

  const queryKey = ["imageAssets", "pool", alterId, role];
  const { data: pool = [] } = useQuery({
    queryKey,
    queryFn: () => base44.entities.ImageAsset.filter({ owner_alter_id: alterId, owner_role: role }, "-created_date"),
    enabled: open && !!alterId,
  });

  const handleFiles = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    let added = 0;
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const { dataUrl, isGif } = await processUploadedImage(file, 1200, 0.85);
        let url = dataUrl;
        if (isLocalMode()) {
          const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          await saveLocalImage(id, dataUrl);
          url = createLocalImageUrl(id);
        }
        await base44.entities.ImageAsset.create({
          name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Image",
          image_url: url,
          folder: "",
          is_gif: isGif,
          owner_alter_id: alterId,
          owner_role: role,
        });
        added++;
      } catch { /* skip this file, keep going */ }
    }
    qc.invalidateQueries({ queryKey });
    setUploading(false);
    if (added) toast.success(`${added} image${added === 1 ? "" : "s"} added to the pool`);
  };

  const handleDelete = async (id) => {
    try {
      await base44.entities.ImageAsset.delete(id);
      qc.invalidateQueries({ queryKey });
    } catch (e) {
      toast.error(e?.message || "Couldn't remove that image");
    }
  };

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false} style={{ zIndex: 110 }} className="max-w-lg p-0 gap-0 flex flex-col overflow-hidden rounded-2xl">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-2">
          <DialogTitle className="font-semibold text-sm flex items-center gap-1.5">
            <Images className="w-4 h-4" /> {roleLabel[0].toUpperCase() + roleLabel.slice(1)} image pool
          </DialogTitle>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-4 py-2.5 border-b border-border/50">
          <p className="text-xs text-muted-foreground mb-2">
            Add a few images here, then set rotation to Random or Sequential — the {roleLabel} shown will change to one of these each time the app reloads.
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-60"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Add images
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3" style={{ WebkitOverflowScrolling: "touch" }}>
          {pool.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">No images in this pool yet — add some above.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {pool.map((item) => <PoolThumb key={item.id} item={item} onDelete={handleDelete} />)}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
