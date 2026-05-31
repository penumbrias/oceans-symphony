import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Images, Upload, Loader2, Trash2, Pencil, FolderInput, FolderPlus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import {
  getAllLocalImages, deleteLocalImage, getLocalImageId, isLocalImageUrl,
  processUploadedImage, saveLocalImage, createLocalImageUrl,
} from "@/lib/localImageStorage";
import { isLocalMode } from "@/lib/storageMode";

// Auto-folder names derived from the id prefix our upload paths use, so
// every image the app has stored is pre-sorted into something sensible.
const PREFIX_FOLDERS = {
  avatar: "Avatars",
  fixed: "Avatars",
  bg: "Backgrounds",
  header: "Headers & banners",
  bioimg: "Bio images",
  bulletinimg: "Bulletin images",
  chatimg: "Chat images",
  commentimg: "Comment images",
  group: "Group images",
  asset: "Library uploads",
};
function autoFolderFor(id) {
  const prefix = String(id).split("-")[0];
  return PREFIX_FOLDERS[prefix] || "Other";
}

function Thumb({ item, onSaveToLibrary, onRename, onMove, onDelete }) {
  const resolved = useResolvedAvatarUrl(item.url);
  return (
    <div className="relative group">
      <div className="w-full aspect-square rounded-lg overflow-hidden border border-border/50 bg-muted/30">
        {resolved
          ? <img src={resolved} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
          : <span className="w-full h-full flex items-center justify-center text-muted-foreground"><Images className="w-5 h-5" /></span>}
      </div>
      {item.isGif && <span className="absolute top-1 left-1 text-[0.5rem] font-bold px-1 rounded bg-black/60 text-white">GIF</span>}
      <p className="text-[0.625rem] text-muted-foreground truncate mt-0.5 px-0.5">{item.name}</p>
      <div className="mt-1 flex items-center justify-center gap-1">
        {item.asset ? (
          <>
            <button type="button" onClick={() => onRename(item)} title="Rename" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"><Pencil className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => onMove(item)} title="Move to folder" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"><FolderInput className="w-3.5 h-3.5" /></button>
          </>
        ) : (
          <button type="button" onClick={() => onSaveToLibrary(item)} title="Save to library (name & organise it)" className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-muted/60"><FolderPlus className="w-3.5 h-3.5" /></button>
        )}
        <button type="button" onClick={() => onDelete(item)} title="Delete image" className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted/60"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

export default function AssetsLibrary() {
  const qc = useQueryClient();
  const [rawImages, setRawImages] = useState({});
  const [loadingImages, setLoadingImages] = useState(true);
  const [search, setSearch] = useState("");
  const [uploadFolder, setUploadFolder] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const { data: assets = [] } = useQuery({
    queryKey: ["imageAssets"],
    queryFn: () => base44.entities.ImageAsset.list("-created_date"),
  });

  const loadImages = async () => {
    setLoadingImages(true);
    try { setRawImages(await getAllLocalImages()); } catch { setRawImages({}); }
    setLoadingImages(false);
  };
  useEffect(() => { loadImages(); }, []);

  // Map stored-image id → its ImageAsset record (when one exists), so we
  // know which raw images are already curated.
  const assetByImageId = useMemo(() => {
    const m = {};
    for (const a of assets) {
      const id = a.image_url ? getLocalImageId(a.image_url) : null;
      if (id) m[id] = a;
    }
    return m;
  }, [assets]);

  // Unified item list: every stored image, plus any ImageAsset whose image
  // isn't a stored-local-image (e.g. a data: URL asset).
  const items = useMemo(() => {
    const out = [];
    for (const id of Object.keys(rawImages)) {
      const asset = assetByImageId[id];
      const data = rawImages[id];
      out.push({
        key: id,
        id,
        url: `/local-image/${encodeURIComponent(id)}`,
        asset: asset || null,
        name: asset?.name || id,
        folder: (asset?.folder || "").trim() || autoFolderFor(id),
        isGif: !!asset?.is_gif || (typeof data === "string" && data.startsWith("data:image/gif")),
      });
    }
    // Assets not backed by a stored local image (data: URLs / external).
    for (const a of assets) {
      const lid = a.image_url ? getLocalImageId(a.image_url) : null;
      if (lid && rawImages[lid] !== undefined) continue; // already represented
      if (isLocalImageUrl(a.image_url) && lid && rawImages[lid] === undefined) {
        // image bytes missing — still show the asset record
      }
      out.push({
        key: `asset-${a.id}`,
        id: a.id,
        url: a.image_url,
        asset: a,
        name: a.name || "Image",
        folder: (a.folder || "").trim() || "Library uploads",
        isGif: !!a.is_gif,
      });
    }
    return out;
  }, [rawImages, assets, assetByImageId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((i) => (i.name || "").toLowerCase().includes(q) || i.folder.toLowerCase().includes(q)) : items;
  }, [items, search]);

  // Group into folders (sorted, with "Other" last).
  const grouped = useMemo(() => {
    const map = {};
    for (const it of filtered) (map[it.folder] ||= []).push(it);
    const names = Object.keys(map).sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
    return names.map((n) => [n, map[n]]);
  }, [filtered]);

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
          image_url: url, folder: uploadFolder.trim(), is_gif: isGif,
          created_date: new Date().toISOString(),
        });
        added++;
      } catch { /* skip */ }
    }
    qc.invalidateQueries({ queryKey: ["imageAssets"] });
    await loadImages();
    setUploading(false);
    if (added) toast.success(`${added} image${added === 1 ? "" : "s"} uploaded`);
  };

  // Promote a raw stored image into a named, foldered ImageAsset.
  const saveToLibrary = async (item) => {
    const name = window.prompt("Name this image:", item.name && item.name !== item.id ? item.name : "");
    if (name === null) return;
    const folder = window.prompt("Folder (optional):", item.folder === autoFolderFor(item.id) ? "" : item.folder) || "";
    try {
      await base44.entities.ImageAsset.create({ name: name.trim() || "Image", image_url: item.url, folder: folder.trim(), is_gif: item.isGif, created_date: new Date().toISOString() });
      qc.invalidateQueries({ queryKey: ["imageAssets"] });
      toast.success("Saved to your library");
    } catch (e) { toast.error(e?.message || "Couldn't save"); }
  };

  const rename = async (item) => {
    if (!item.asset) return;
    const name = window.prompt("Rename:", item.name);
    if (name === null) return;
    try { await base44.entities.ImageAsset.update(item.asset.id, { name: name.trim() || "Image" }); qc.invalidateQueries({ queryKey: ["imageAssets"] }); } catch (e) { toast.error(e?.message || "Failed"); }
  };

  const move = async (item) => {
    if (!item.asset) return;
    const folder = window.prompt("Move to folder (blank = none):", item.asset.folder || "");
    if (folder === null) return;
    try { await base44.entities.ImageAsset.update(item.asset.id, { folder: folder.trim() }); qc.invalidateQueries({ queryKey: ["imageAssets"] }); } catch (e) { toast.error(e?.message || "Failed"); }
  };

  const del = async (item) => {
    if (!window.confirm("Permanently delete this image? If it's used as an avatar, background, or in a post, that will break. This can't be undone.")) return;
    try {
      if (item.asset) await base44.entities.ImageAsset.delete(item.asset.id);
      const lid = isLocalImageUrl(item.url) ? getLocalImageId(item.url) : item.id;
      if (lid) await deleteLocalImage(lid);
      qc.invalidateQueries({ queryKey: ["imageAssets"] });
      await loadImages();
    } catch (e) { toast.error(e?.message || "Couldn't delete"); }
  };

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <div className="flex items-center gap-2 mb-1">
        <Images className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-semibold">Image assets</h1>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Every image stored in the app, sorted into folders. Reuse any of them anywhere a picture is accepted (tap the 🖼 button there). Name and organise images, or save raw ones to your library.</p>

      <div className="space-y-2 mb-4 sticky top-0 bg-background/95 backdrop-blur z-10 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search images & folders…" className="pl-9 h-9" />
        </div>
        <div className="flex items-center gap-2">
          <Input value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)} placeholder="Upload into folder (optional)" className="flex-1 h-9 text-sm" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60 flex-shrink-0">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
        </div>
      </div>

      {loadingImages ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          {items.length === 0 ? "No images stored yet — upload some, or add avatars/backgrounds anywhere in the app." : "No images match."}
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([folder, list]) => (
            <div key={folder}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{folder} <span className="font-normal normal-case text-muted-foreground/60">· {list.length}</span></p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {list.map((item) => (
                  <Thumb key={item.key} item={item} onSaveToLibrary={saveToLibrary} onRename={rename} onMove={move} onDelete={del} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
