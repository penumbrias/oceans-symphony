import React, { useState, useRef, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Upload, Loader2, ImagePlus, Images } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { isLocalMode } from "@/lib/storageMode";
import {
  processUploadedImage, saveLocalImage, createLocalImageUrl,
  getAllLocalImages, getLocalImageId,
} from "@/lib/localImageStorage";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// Auto-folder names from the id prefix our upload paths use (kept in sync
// with the Assets page) so EVERY stored image — not just curated assets —
// shows up here, sorted sensibly.
const PREFIX_FOLDERS = {
  avatar: "Avatars", fixed: "Avatars",
  bg: "Backgrounds", header: "Headers & banners",
  bioimg: "Bio images", bulletinimg: "Bulletin images",
  chatimg: "Chat images", commentimg: "Comment images",
  group: "Group images", asset: "Library uploads",
};
function autoFolderFor(id) {
  return PREFIX_FOLDERS[String(id).split("-")[0]] || "Other";
}

function AssetThumb({ item, onSelect }) {
  const resolved = useResolvedAvatarUrl(item.url);
  return (
    <button type="button" onClick={() => onSelect(item.url)}
      className="relative w-full aspect-square rounded-lg overflow-hidden border border-border/50 bg-muted/30 hover:ring-2 hover:ring-primary transition-all">
      {resolved
        ? <img src={resolved} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
        : <span className="w-full h-full flex items-center justify-center text-muted-foreground"><ImagePlus className="w-5 h-5" /></span>}
      {item.isGif && <span className="absolute bottom-1 left-1 text-[0.5rem] font-bold px-1 rounded bg-black/60 text-white">GIF</span>}
    </button>
  );
}

export default function AssetPickerModal({ open, onClose, onSelect }) {
  const qc = useQueryClient();
  const t = useTerms();
  const [rawImages, setRawImages] = useState({});
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("all");
  const [uploadFolder, setUploadFolder] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const { data: assets = [] } = useQuery({
    queryKey: ["imageAssets"],
    queryFn: () => base44.entities.ImageAsset.list("-created_date"),
    enabled: open,
  });

  const loadImages = async () => { try { setRawImages(await getAllLocalImages()); } catch { setRawImages({}); } };
  useEffect(() => { if (open) loadImages(); }, [open]);

  const assetByImageId = useMemo(() => {
    const m = {};
    for (const a of assets) { const id = a.image_url ? getLocalImageId(a.image_url) : null; if (id) m[id] = a; }
    return m;
  }, [assets]);

  // Every stored image + any asset record not backed by a stored image.
  const items = useMemo(() => {
    const out = [];
    for (const id of Object.keys(rawImages)) {
      const asset = assetByImageId[id];
      const data = rawImages[id];
      out.push({
        key: id,
        url: `/local-image/${encodeURIComponent(id)}`,
        name: asset?.name || id,
        folder: (asset?.folder || "").trim() || autoFolderFor(id),
        isGif: !!asset?.is_gif || (typeof data === "string" && data.startsWith("data:image/gif")),
      });
    }
    for (const a of assets) {
      const lid = a.image_url ? getLocalImageId(a.image_url) : null;
      if (lid && rawImages[lid] !== undefined) continue;
      out.push({
        key: `asset-${a.id}`, url: a.image_url,
        name: a.name || "Image", folder: (a.folder || "").trim() || "Library uploads", isGif: !!a.is_gif,
      });
    }
    return out;
  }, [rawImages, assets, assetByImageId]);

  const folders = useMemo(
    () => [...new Set(items.map((i) => i.folder).filter(Boolean))].sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b))),
    [items]
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) =>
      (folder === "all" || i.folder === folder) &&
      (!q || (i.name || "").toLowerCase().includes(q))
    );
  }, [items, folder, search]);

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
          folder: (folder !== "all" ? folder : uploadFolder).trim(),
          is_gif: isGif,
          created_date: new Date().toISOString(),
        });
        added++;
      } catch { /* skip */ }
    }
    qc.invalidateQueries({ queryKey: ["imageAssets"] });
    await loadImages();
    setUploading(false);
    if (added) toast.success(`${added} image${added === 1 ? "" : "s"} added`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-start justify-center p-4 pt-[8vh]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[82vh] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-2">
          <span className="font-semibold text-sm flex items-center gap-1.5"><Images className="w-4 h-4" /> Choose an image</span>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-4 py-2.5 border-b border-border/50 space-y-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search images…"
            className="w-full h-8 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            <button type="button" onClick={() => setFolder("all")}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border flex-shrink-0 ${folder === "all" ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>All</button>
            {folders.map((f) => (
              <button key={f} type="button" onClick={() => setFolder(f)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border flex-shrink-0 max-w-[10rem] truncate ${folder === f ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>{f}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {folder === "all" && (
              <input value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)} placeholder="Folder (optional)"
                className="flex-1 h-8 px-2.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
            )}
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-60 flex-shrink-0">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Upload{folder !== "all" ? ` to ${folder}` : ""}
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-3" style={{ WebkitOverflowScrolling: "touch" }}>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {items.length === 0 ? "No images stored yet — upload one above." : "No images match."}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {filtered.map((it) => <AssetThumb key={it.key} item={it} onSelect={onSelect} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Small trigger button that opens the picker and hands the chosen image
// URL back via onPick. Drop next to any upload control.
export function AssetButton({ onPick, className = "", title = "Choose from assets" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={title}
        className={className || "h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors flex-shrink-0"}>
        <Images className="w-4 h-4 text-muted-foreground" />
      </button>
      <AssetPickerModal open={open} onClose={() => setOpen(false)} onSelect={(url) => { onPick(url); setOpen(false); }} />
    </>
  );
}
