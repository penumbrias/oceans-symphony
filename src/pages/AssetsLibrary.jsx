import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Images, Upload, Loader2, Trash2, Pencil, FolderInput, FolderPlus, Search,
  ChevronDown, ChevronRight, ArrowUp, ArrowDown, X,
} from "lucide-react";
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
  avatar: "Avatars", fixed: "Avatars",
  bg: "Backgrounds",
  header: "Headers & banners",
  bioimg: "Bio images",
  bulletinimg: "Bulletin images",
  chatimg: "Chat images",
  commentimg: "Comment images",
  group: "Group images",
  asset: "Library uploads",
};
const AUTO_FOLDERS = new Set([...Object.values(PREFIX_FOLDERS), "Other"]);
function autoFolderFor(id) {
  return PREFIX_FOLDERS[String(id).split("-")[0]] || "Other";
}

// Images uploaded into a specific alter's rotation pool (owner_alter_id set
// on the ImageAsset) get synthesized into their own folder here, labeled by
// the owning alter's CURRENT name (resolved live, not baked in, so a later
// rename doesn't orphan the group) rather than the manual `folder` string
// those images don't use.
const ALTER_FOLDER_PREFIX = "👤 ";
function folderIdAttr(folder) {
  return `asset-folder-${encodeURIComponent(folder)}`;
}

const ORDER_KEY = "asset_folder_order_v1";     // user-created folder order (incl. empty)
const COLLAPSED_KEY = "asset_collapsed_folders_v1";
const PAGE = 24; // lazy-load page size per folder

const loadArr = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const saveArr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* off */ } };

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
        {item.asset?.owner_alter_id ? null : item.asset ? (
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [rawImages, setRawImages] = useState({});
  const [loadingImages, setLoadingImages] = useState(true);
  const [search, setSearch] = useState("");
  const [uploadFolder, setUploadFolder] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const [folderOrder, setFolderOrder] = useState(() => loadArr(ORDER_KEY));   // user folder names, ordered
  const [collapsed, setCollapsed] = useState(() => new Set(loadArr(COLLAPSED_KEY)));
  const [limits, setLimits] = useState({}); // per-folder render cap

  useEffect(() => { saveArr(ORDER_KEY, folderOrder); }, [folderOrder]);
  useEffect(() => { saveArr(COLLAPSED_KEY, [...collapsed]); }, [collapsed]);

  const { data: assets = [] } = useQuery({
    queryKey: ["imageAssets"],
    queryFn: () => base44.entities.ImageAsset.list("-created_date"),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const alterNameById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a.name || "Unnamed"])), [alters]);
  const alterFolderName = (alterId) => `${ALTER_FOLDER_PREFIX}${alterNameById[alterId] || "Unknown alter"}`;

  // Deep link from an alter's edit screen (?alter=<id>) — default-open and
  // scroll to that alter's synthesized folder, then strip the param so a
  // refresh/back-nav doesn't re-fire.
  useEffect(() => {
    const alterId = searchParams.get("alter");
    if (!alterId || loadingImages || alters.length === 0) return;
    const folderName = alterFolderName(alterId);
    setCollapsed((s) => {
      if (!s.has(folderName)) return s;
      const n = new Set(s);
      n.delete(folderName);
      return n;
    });
    requestAnimationFrame(() => {
      document.getElementById(folderIdAttr(folderName))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("alter");
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loadingImages, alters.length]);

  const loadImages = async () => {
    setLoadingImages(true);
    try { setRawImages(await getAllLocalImages()); } catch { setRawImages({}); }
    setLoadingImages(false);
  };
  useEffect(() => { loadImages(); }, []);

  const assetByImageId = useMemo(() => {
    const m = {};
    for (const a of assets) { const id = a.image_url ? getLocalImageId(a.image_url) : null; if (id) m[id] = a; }
    return m;
  }, [assets]);

  const items = useMemo(() => {
    const out = [];
    for (const id of Object.keys(rawImages)) {
      const asset = assetByImageId[id];
      const data = rawImages[id];
      out.push({
        key: id, id,
        url: `/local-image/${encodeURIComponent(id)}`,
        asset: asset || null,
        name: asset?.name || id,
        folder: asset?.owner_alter_id ? alterFolderName(asset.owner_alter_id) : ((asset?.folder || "").trim() || autoFolderFor(id)),
        isGif: !!asset?.is_gif || (typeof data === "string" && data.startsWith("data:image/gif")),
      });
    }
    for (const a of assets) {
      const lid = a.image_url ? getLocalImageId(a.image_url) : null;
      if (lid && rawImages[lid] !== undefined) continue;
      out.push({
        key: `asset-${a.id}`, id: a.id, url: a.image_url, asset: a,
        name: a.name || "Image",
        folder: a.owner_alter_id ? alterFolderName(a.owner_alter_id) : ((a.folder || "").trim() || "Library uploads"),
        isGif: !!a.is_gif,
      });
    }
    return out;
  }, [rawImages, assets, assetByImageId, alterNameById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((i) => (i.name || "").toLowerCase().includes(q) || i.folder.toLowerCase().includes(q)) : items;
  }, [items, search]);

  // Group items by folder, then build the ordered folder list: user
  // folders (in saved order, even if empty) first, then auto folders that
  // have items (Other last).
  const { byFolder, orderedFolders } = useMemo(() => {
    const map = {};
    for (const it of filtered) (map[it.folder] ||= []).push(it);

    const isAlterFolder = (f) => f.startsWith(ALTER_FOLDER_PREFIX);
    const userFromItems = [...new Set(filtered.map((i) => i.folder).filter((f) => !AUTO_FOLDERS.has(f) && !isAlterFolder(f)))];
    const userNames = [...folderOrder];
    for (const n of userFromItems) if (!userNames.includes(n)) userNames.push(n);

    const alterFolderNames = Object.keys(map).filter(isAlterFolder).sort((a, b) => a.localeCompare(b));

    const autoNames = Object.keys(map)
      .filter((f) => AUTO_FOLDERS.has(f))
      .sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));

    return { byFolder: map, orderedFolders: [...userNames, ...alterFolderNames, ...autoNames] };
  }, [filtered, folderOrder]);

  const toggleCollapse = (name) => setCollapsed((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const isUser = (name) => !AUTO_FOLDERS.has(name) && !name.startsWith(ALTER_FOLDER_PREFIX);

  const createFolder = () => {
    const name = window.prompt("New folder name:")?.trim();
    if (!name) return;
    if (AUTO_FOLDERS.has(name)) { toast.error("That name is reserved."); return; }
    if (folderOrder.includes(name)) { toast.info("Folder already exists."); return; }
    setFolderOrder((o) => [...o, name]);
  };

  const renameFolder = async (oldName) => {
    if (!isUser(oldName)) return;
    const next = window.prompt("Rename folder:", oldName)?.trim();
    if (!next || next === oldName) return;
    if (AUTO_FOLDERS.has(next)) { toast.error("That name is reserved."); return; }
    // Move every asset in the folder, then update the order list.
    const moving = assets.filter((a) => (a.folder || "") === oldName);
    let failed = 0;
    for (const a of moving) {
      try { await base44.entities.ImageAsset.update(a.id, { folder: next }); }
      catch { failed += 1; }
    }
    setFolderOrder((o) => o.map((n) => (n === oldName ? next : n)).filter((n, i, arr) => arr.indexOf(n) === i));
    qc.invalidateQueries({ queryKey: ["imageAssets"] });
    // Don't claim success when some items were left behind in the old folder.
    if (failed > 0) toast.error(`Renamed, but ${failed} item${failed === 1 ? "" : "s"} couldn't be moved.`);
    else toast.success("Folder renamed");
  };

  const moveFolder = (name, dir) => {
    setFolderOrder((o) => {
      const arr = [...new Set([...o, ...orderedFolders.filter(isUser)])]; // ensure all user folders present
      const i = arr.indexOf(name);
      if (i === -1) return o;
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  };

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
          image_url: url, folder: uploadFolder.trim(), is_gif: isGif, created_date: new Date().toISOString(),
        });
        added++;
      } catch { /* skip */ }
    }
    qc.invalidateQueries({ queryKey: ["imageAssets"] });
    await loadImages();
    setUploading(false);
    if (added) toast.success(`${added} image${added === 1 ? "" : "s"} uploaded`);
  };

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
  const renameAsset = async (item) => {
    if (!item.asset) return;
    const name = window.prompt("Rename:", item.name);
    if (name === null) return;
    try { await base44.entities.ImageAsset.update(item.asset.id, { name: name.trim() || "Image" }); qc.invalidateQueries({ queryKey: ["imageAssets"] }); } catch (e) { toast.error(e?.message || "Failed"); }
  };
  const moveAsset = async (item) => {
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
    <div className="max-w-3xl mx-auto pb-24" data-tour="assets-library">
      <div className="flex items-center gap-2 mb-1">
        <Images className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-semibold">Image assets</h1>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Every image stored in the app, in collapsible folders. Make your own folders, reorder them, and reuse any image anywhere a picture is accepted (the 🖼 button there).</p>

      <div className="space-y-2 mb-4 sticky top-0 bg-background/95 backdrop-blur z-10 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search images & folders…" className="pl-9 h-9" />
        </div>
        <div className="flex items-center gap-2">
          <Input value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)} placeholder="Upload into folder (optional)" className="flex-1 h-9 text-sm" />
          <button type="button" onClick={createFolder} title="New folder"
            className="h-9 px-2.5 flex items-center gap-1 rounded-lg border border-border bg-card/50 text-xs text-muted-foreground hover:text-foreground hover:bg-accent flex-shrink-0">
            <FolderPlus className="w-4 h-4" /> Folder
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60 flex-shrink-0">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
        </div>
      </div>

      {loadingImages ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : orderedFolders.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          {items.length === 0 ? "No images stored yet — upload some, or add avatars/backgrounds anywhere in the app." : "No images match."}
        </div>
      ) : (
        <div className="space-y-2">
          {orderedFolders.map((folder, idx) => {
            const list = byFolder[folder] || [];
            const open = !collapsed.has(folder);
            const limit = limits[folder] || PAGE;
            const userFolder = isUser(folder);
            return (
              <div key={folder} id={folderIdAttr(folder)} className="rounded-xl border border-border/40 overflow-hidden">
                <div className="flex items-center gap-1 px-2 py-2 bg-muted/20">
                  <button type="button" onClick={() => toggleCollapse(folder)} className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
                    {open ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                    <span className="text-sm font-medium truncate">{folder}</span>
                    <span className="text-[0.625rem] text-muted-foreground flex-shrink-0">· {list.length}</span>
                  </button>
                  {userFolder && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button type="button" onClick={() => moveFolder(folder, -1)} title="Move up" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => moveFolder(folder, 1)} title="Move down" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"><ArrowDown className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => renameFolder(folder)} title="Rename folder" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"><Pencil className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
                {open && (
                  <div className="p-3">
                    {list.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">Empty — upload into this folder, or move images here with the folder button on a thumbnail.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                          {list.slice(0, limit).map((item) => (
                            <Thumb key={item.key} item={item} onSaveToLibrary={saveToLibrary} onRename={renameAsset} onMove={moveAsset} onDelete={del} />
                          ))}
                        </div>
                        {list.length > limit && (
                          <button type="button" onClick={() => setLimits((m) => ({ ...m, [folder]: limit + PAGE }))}
                            className="mt-2 w-full py-2 rounded-lg border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30">
                            Show {Math.min(PAGE, list.length - limit)} more ({list.length - limit} left)
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
