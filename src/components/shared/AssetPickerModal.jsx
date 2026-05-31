import React, { useState, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Upload, Loader2, Trash2, ImagePlus, Images } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { isLocalMode } from "@/lib/storageMode";
import { processUploadedImage, saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

// A reusable library of locally-stored images. Upload once (in bulk if you
// like), organise into folders, and re-use any image anywhere that takes a
// picture — without re-uploading or duplicating storage (assets reference
// the same /local-image/<id> the rest of the app uses).

function AssetThumb({ asset, onSelect, onDelete }) {
  const resolved = useResolvedAvatarUrl(asset.image_url);
  return (
    <div className="relative group">
      <button type="button" onClick={() => onSelect(asset.image_url)}
        className="w-full aspect-square rounded-lg overflow-hidden border border-border/50 bg-muted/30 hover:ring-2 hover:ring-primary transition-all">
        {resolved
          ? <img src={resolved} alt={asset.name} className="w-full h-full object-cover" />
          : <span className="w-full h-full flex items-center justify-center text-muted-foreground"><ImagePlus className="w-5 h-5" /></span>}
      </button>
      {asset.is_gif && <span className="absolute bottom-1 left-1 text-[0.5rem] font-bold px-1 rounded bg-black/60 text-white">GIF</span>}
      <button type="button" onClick={() => onDelete(asset)} aria-label="Remove asset"
        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <Trash2 className="w-3 h-3" />
      </button>
      {asset.name && <p className="text-[0.625rem] text-muted-foreground truncate mt-0.5 px-0.5">{asset.name}</p>}
    </div>
  );
}

export default function AssetPickerModal({ open, onClose, onSelect }) {
  const qc = useQueryClient();
  const t = useTerms();
  const { data: assets = [] } = useQuery({
    queryKey: ["imageAssets"],
    queryFn: () => base44.entities.ImageAsset.list("-created_date"),
  });
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("all");
  const [uploadFolder, setUploadFolder] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const folders = useMemo(
    () => [...new Set(assets.map((a) => (a.folder || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [assets]
  );
  const filtered = useMemo(
    () => assets.filter((a) =>
      (folder === "all" || (a.folder || "") === folder) &&
      (!search || (a.name || "").toLowerCase().includes(search.toLowerCase()))
    ),
    [assets, folder, search]
  );

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
      } catch { /* skip bad file */ }
    }
    qc.invalidateQueries({ queryKey: ["imageAssets"] });
    setUploading(false);
    if (added) toast.success(`${added} image${added === 1 ? "" : "s"} added to your assets`);
  };

  const del = async (asset) => {
    if (!window.confirm(`Remove "${asset.name}" from your assets? Anywhere already using it keeps it.`)) return;
    try {
      await base44.entities.ImageAsset.delete(asset.id);
      qc.invalidateQueries({ queryKey: ["imageAssets"] });
    } catch (err) { toast.error(err?.message || "Couldn't remove"); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-start justify-center p-4 pt-[8vh]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="bg-popover border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[82vh] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-2">
          <span className="font-semibold text-sm flex items-center gap-1.5"><Images className="w-4 h-4" /> Image assets</span>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-4 py-2.5 border-b border-border/50 space-y-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets…"
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
              {assets.length === 0 ? "No assets yet — upload some images to reuse them anywhere." : "No assets match."}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {filtered.map((a) => <AssetThumb key={a.id} asset={a} onSelect={onSelect} onDelete={del} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Small trigger button that opens the asset picker and hands the chosen
// image URL back via onPick. Drop next to any upload control.
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
