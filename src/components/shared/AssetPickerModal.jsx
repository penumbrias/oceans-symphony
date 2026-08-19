import React, { useState, useRef, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Upload, Loader2, ImagePlus, Images, FolderOpen } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { isLocalMode } from "@/lib/storageMode";
import {
  processUploadedImage, saveLocalImage, createLocalImageUrl,
  getAllLocalImages, getLocalImageId,
} from "@/lib/localImageStorage";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { FOLDER_MODES, makeFolderUrl } from "@/lib/folderSource";

// Auto-folder names + the user's rules: lib/assetFolders.js (shared with
// the Assets Library page so both file an image the same way).
import { resolveAssetRules, autoFolderFor as autoFolderForRules, alterFolderName } from "@/lib/assetFolders";

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

// `kind` keeps audio and images out of each other's pickers. Audio lives in
// the same blob store, so without this a song shows up in the wallpaper
// picker as a broken image.
// `ownerAlterId` (+ ownerAlterName): the picker is choosing FOR an alter —
// it opens on that alter's "👤 Name" folder and anything uploaded here is
// filed into it (owner_alter_id), so per-alter images live with the alter.
// `allowFolders`: the picker can also hand back a WHOLE folder as a
// rotating source (folder://… — see lib/folderSource.js): pick a folder
// pill, then "Use this folder" with a rotation policy. Only for slots that
// resolve through useResolvedAvatarUrl / resolveImageUrl.
export default function AssetPickerModal({ open, onClose, onSelect, kind = "image", ownerAlterId = null, ownerAlterName = "", allowFolders = false }) {
  const qc = useQueryClient();
  const t = useTerms();
  const [rawImages, setRawImages] = useState({});
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState(() => (ownerAlterId ? `👤 ${ownerAlterName || "Unknown"}` : "all"));
  const [folderMode, setFolderMode] = useState("random");
  const [folderPickOpen, setFolderPickOpen] = useState(false);
  const [uploadFolder, setUploadFolder] = useState("");
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileRef = useRef(null);

  const { data: assets = [] } = useQuery({
    queryKey: ["imageAssets"],
    queryFn: () => base44.entities.ImageAsset.list("-created_date"),
    enabled: open,
  });
  // v0.88.1: pool images (owner_alter_id-tagged ImageAssets) synthesize
  // into per-alter "👤 Name" folders — same convention as the Assets
  // Library page — so an alter's avatar pool is directly pickable here
  // (tester: "wanna choose avatar images directly from my avatar pool").
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
    enabled: open,
  });
  const alterNameById = useMemo(
    () => Object.fromEntries(alters.map((a) => [a.id, a.name || "Unnamed"])),
    [alters]
  );
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list(), enabled: open });
  const rules = useMemo(() => resolveAssetRules(settingsList[0] || null), [settingsList]);
  const autoFolderFor = (id) => autoFolderForRules(id, rules);
  const ownerFolderFor = (asset) =>
    asset?.owner_alter_id && rules.perAlter ? alterFolderName(alterNameById[asset.owner_alter_id] || "Unknown", asset.owner_role, rules) : null;

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
        folder: ownerFolderFor(asset) || (asset?.folder || "").trim() || autoFolderFor(id),
        isGif: !!asset?.is_gif || (typeof data === "string" && data.startsWith("data:image/gif")),
        isAudio: asset?.kind === "audio" || id.startsWith("song-")
          || (typeof data === "string" && data.startsWith("data:audio")),
      });
    }
    for (const a of assets) {
      const lid = a.image_url ? getLocalImageId(a.image_url) : null;
      if (lid && rawImages[lid] !== undefined) continue;
      out.push({
        key: `asset-${a.id}`, url: a.image_url,
        name: a.name || "Image",
        folder: ownerFolderFor(a) || (a.folder || "").trim() || "Library uploads",
        isGif: !!a.is_gif,
      });
    }
    return out;
  }, [rawImages, assets, assetByImageId, alterNameById, rules]);

  // 👤 alter-pool folders first (most relevant when picking an avatar),
  // then the rest alphabetically, Other last.
  const folders = useMemo(
    () => [...new Set([...(ownerAlterId ? [`👤 ${ownerAlterName || "Unknown"}`] : []), ...items.map((i) => i.folder).filter(Boolean)])].sort((a, b) => {
      const aPool = a.startsWith("👤"), bPool = b.startsWith("👤");
      if (aPool !== bPool) return aPool ? -1 : 1;
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    }),
    [items, ownerAlterId, ownerAlterName]
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) =>
      (kind === "audio" ? i.isAudio : !i.isAudio) &&
      (folder === "all" || i.folder === folder) &&
      (!q || (i.name || "").toLowerCase().includes(q))
    );
  }, [items, folder, search, kind]);

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
          ...(ownerAlterId ? { owner_alter_id: ownerAlterId } : {}),
          folder: ownerAlterId ? "" : (folder !== "all" ? folder : uploadFolder).trim(),
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

  // Nested Radix dialog, NOT a hand-rolled portal. The opener is often a modal
  // Radix dialog (alter edit, group create, bulletin edit…), which sets
  // body{pointer-events:none} and traps focus inside itself — a plain portal
  // appended to <body> is un-tappable there, and even when taps are re-enabled
  // the parent's focus trap yanks focus out of the picker's search box.
  // Registering as a nested dialog gives the picker its own interactive layer
  // + focus scope that stacks above the parent (same fix as ColorPickerModal).
  // zIndex 110 keeps it above the inner-world map's fullscreen shell (z-[100]).
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false} style={{ zIndex: 110 }}
        className="max-w-lg p-0 gap-0 flex flex-col overflow-hidden rounded-2xl">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-2">
          <DialogTitle className="font-semibold text-sm flex items-center gap-1.5"><Images className="w-4 h-4" /> Choose an image</DialogTitle>
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
          {/* Whole-folder source: the slot shows one image from the folder
              and rotates by the chosen policy. */}
          {allowFolders && folder !== "all" && (
            <div className="rounded-lg border border-border/50 p-2 space-y-1.5">
              <button type="button" onClick={() => setFolderPickOpen((v) => !v)} aria-expanded={folderPickOpen}
                className="w-full flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> Use this whole folder (rotating)</span>
                <span className="text-muted-foreground">{folderPickOpen ? "−" : "+"}</span>
              </button>
              {folderPickOpen && (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-1">
                    {FOLDER_MODES.map((m) => (
                      <button key={m.id} type="button" aria-pressed={folderMode === m.id} onClick={() => setFolderMode(m.id)}
                        className={`text-[0.6875rem] px-2 py-1 rounded-full border ${folderMode === m.id ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={() => onSelect(makeFolderUrl(folder, { mode: folderMode }))}
                    className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium">
                    Use “{folder}” · {FOLDER_MODES.find((m) => m.id === folderMode)?.label.toLowerCase()}
                  </button>
                </div>
              )}
            </div>
          )}
          {/* …or paste a direct image URL */}
          <div className="flex items-center gap-2">
            <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="…or paste an image URL"
              onKeyDown={(e) => { if (e.key === "Enter" && urlInput.trim()) onSelect(urlInput.trim()); }}
              className="flex-1 h-8 px-2.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring" />
            <button type="button" disabled={!urlInput.trim()} onClick={() => { const u = urlInput.trim(); if (u) onSelect(u); }}
              className="h-8 px-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 text-xs font-medium disabled:opacity-50 flex-shrink-0">Use URL</button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3" style={{ WebkitOverflowScrolling: "touch" }}>
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
      </DialogContent>
    </Dialog>
  );
}

// Small trigger button that opens the picker and hands the chosen image
// URL back via onPick. Drop next to any upload control.
export function AssetButton({ onPick, className = "", title = "Choose from assets", style, allowFolders = false, ownerAlterId = null, ownerAlterName = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={title} aria-label={title} style={style}
        className={className || "h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors flex-shrink-0"}>
        <Images className="w-4 h-4 text-muted-foreground" />
      </button>
      <AssetPickerModal open={open} onClose={() => setOpen(false)} onSelect={(url) => { onPick(url); setOpen(false); }}
        allowFolders={allowFolders} ownerAlterId={ownerAlterId} ownerAlterName={ownerAlterName} />
    </>
  );
}
