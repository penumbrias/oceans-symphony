import React, { useState, useEffect, useMemo, useRef } from "react";
import { confirm, promptText } from "@/components/shared/ConfirmDialog";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Images, Upload, Loader2, Trash2, Pencil, FolderInput, FolderPlus, Search, SlidersHorizontal,
  ChevronRight, ArrowUp, ArrowDown, X, UserPlus2, Users, ArrowLeft, CheckSquare, Check, Folder,
} from "lucide-react";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useTerms } from "@/lib/useTerms";
import { useReferencedAssets, useImageUsage, BUILT_IN_FOLDER } from "@/lib/referencedAssets";
import {
  getAllLocalImages, deleteLocalImage, getLocalImageId, isLocalImageUrl,
  processUploadedImage, saveLocalImage, createLocalImageUrl,
} from "@/lib/localImageStorage";
import { isLocalMode } from "@/lib/storageMode";

// Auto-folder names + the user's overrides live in lib/assetFolders.js
// (shared with the picker so both file an image the same way).
import {
  resolveAssetRules, autoFolderFor as autoFolderForRules, autoFolderNames,
  ALTER_FOLDER_PREFIX, alterFolderName as alterFolderNameRules, DEFAULT_PREFIX_FOLDERS, PREFIX_LABELS,
} from "@/lib/assetFolders";
const ORDER_KEY = "asset_folder_order_v1";     // user-created folder order (incl. empty)
const PAGE = 24; // lazy-load page size per folder

const loadArr = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const saveArr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* off */ } };

function Thumb({ item, onSaveToLibrary, onRename, onMove, onDelete, selecting = false, selected = false, onToggle, showFolder = false }) {
  const resolved = useResolvedAvatarUrl(item.url);
  // Pictures only referenced by a record / built into the app can't be
  // moved or deleted from here — in select mode they're dimmed, not pickable.
  const pickable = !item.refOnly;
  const image = (
    <div className={`relative w-full aspect-square rounded-lg overflow-hidden border bg-muted/30 ${
      selected ? "border-primary ring-2 ring-primary" : "border-border/50"} ${selecting && !pickable ? "opacity-40" : ""}`}>
      {resolved
        ? <img src={resolved} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
        : <span className="w-full h-full flex items-center justify-center text-muted-foreground"><Images className="w-5 h-5" /></span>}
      {item.isGif && <span className="absolute top-1 left-1 text-[0.5rem] font-bold px-1 rounded bg-black/60 text-white">GIF</span>}
      {selecting && pickable && (
        <span className={`absolute top-1 right-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          selected ? "bg-primary border-primary text-primary-foreground" : "bg-black/40 border-white/80"}`}>
          {selected && <Check className="w-3 h-3" />}
        </span>
      )}
    </div>
  );
  return (
    <div className="relative group">
      {selecting ? (
        <button type="button" disabled={!pickable} onClick={() => onToggle(item)} aria-pressed={selected}
          aria-label={`${selected ? "Deselect" : "Select"} ${item.name}`} className="block w-full text-left">
          {image}
        </button>
      ) : image}
      <p className="text-[0.625rem] text-muted-foreground truncate mt-0.5 px-0.5">{item.name}</p>
      {showFolder && <p className="text-[0.5625rem] text-muted-foreground/70 truncate px-0.5">{item.folder}</p>}
      {!selecting && (
        <div className="mt-1 flex items-center justify-center gap-1">
          {item.refOnly ? (
            // In use on a record / built into the app — can be copied into the
            // library (to name / organise / reuse), not deleted from here.
            <button type="button" onClick={() => onSaveToLibrary(item)} title="Save a copy to the library" className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-muted/60"><FolderPlus className="w-3.5 h-3.5" /></button>
          ) : item.asset?.owner_alter_id ? null : item.asset ? (
            <>
              <button type="button" onClick={() => onRename(item)} title="Rename" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"><Pencil className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => onMove(item)} title="Move to folder" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"><FolderInput className="w-3.5 h-3.5" /></button>
            </>
          ) : (
            <button type="button" onClick={() => onSaveToLibrary(item)} title="Save to library (name & organise it)" className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-muted/60"><FolderPlus className="w-3.5 h-3.5" /></button>
          )}
          {!item.refOnly && (
            <button type="button" onClick={() => onDelete(item)} title="Delete image" className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted/60"><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      )}
    </div>
  );
}

// A folder in the folder grid: its first image as the cover, name, count.
function FolderTile({ name, items, onOpen }) {
  const cover = items.find((i) => i.url)?.url || "";
  const resolved = useResolvedAvatarUrl(cover);
  return (
    <button type="button" onClick={onOpen} className="text-left group">
      <div className="w-full aspect-square rounded-xl overflow-hidden border border-border/50 bg-muted/30 flex items-center justify-center group-hover:border-primary/50 transition-colors">
        {resolved
          ? <img src={resolved} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <Folder className="w-8 h-8 text-muted-foreground/60" />}
      </div>
      <p className="text-xs font-medium truncate mt-1 px-0.5">{name}</p>
      <p className="text-[0.625rem] text-muted-foreground px-0.5">{items.length} image{items.length === 1 ? "" : "s"}</p>
    </button>
  );
}

// Pick a destination folder for moved images: any folder, a new one, or
// back to automatic filing.
function MoveDialog({ count, folders, onCancel, onMove }) {
  const [target, setTarget] = useState(null);
  const AUTO = "__auto__";
  const options = [{ id: AUTO, label: "No folder (file automatically)" }, ...folders.map((f) => ({ id: f, label: f }))];
  const newFolder = async () => {
    const name = (await promptText({ title: "New folder", placeholder: "Folder name" }))?.trim();
    if (name) onMove(name);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="text-sm">Move {count} image{count === 1 ? "" : "s"} to…</DialogTitle>
        <SearchableSelect value={target} onChange={setTarget} options={options} placeholder="Choose a folder" searchPlaceholder="Search folders…" />
        <button type="button" onClick={newFolder} className="text-xs text-primary hover:underline self-start flex items-center gap-1">
          <FolderPlus className="w-3.5 h-3.5" /> New folder…
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 h-9 rounded-lg border border-border text-sm">Cancel</button>
          <button type="button" disabled={!target} onClick={() => onMove(target === AUTO ? "" : target)}
            className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Move</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AssetsLibrary() {
  const qc = useQueryClient();
  const t = useTerms();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rawImages, setRawImages] = useState({});
  const [loadingImages, setLoadingImages] = useState(true);
  const [search, setSearch] = useState("");
  const [uploadFolder, setUploadFolder] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const [folderOrder, setFolderOrder] = useState(() => loadArr(ORDER_KEY));   // user folder names, ordered
  const [limits, setLimits] = useState({}); // per-folder render cap
  // The open folder lives in the URL (?folder=…), so the system back
  // gesture steps out of a folder instead of leaving the page.
  const openFolder = searchParams.get("folder");
  const goFolder = (name) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (name) next.set("folder", name); else next.delete("folder");
    return next;
  });
  // Select mode: tap images to pick them, then move or delete in bulk.
  const [selecting, setSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const stopSelecting = () => { setSelecting(false); setSelectedKeys(new Set()); };

  useEffect(() => { saveArr(ORDER_KEY, folderOrder); }, [folderOrder]);
  // Uploads filed from elsewhere (an alter's avatar) announce themselves.
  useEffect(() => {
    const on = () => qc.invalidateQueries({ queryKey: ["imageAssets"] });
    window.addEventListener("symphony-assets-changed", on);
    return () => window.removeEventListener("symphony-assets-changed", on);
  }, [qc]);

  const { data: assets = [] } = useQuery({
    queryKey: ["imageAssets"],
    queryFn: () => base44.entities.ImageAsset.list("-created_date"),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const alterNameById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a.name || "Unnamed"])), [alters]);
  // The organisation rules (auto-folder names, per-alter filing) — the
  // user's overrides on SystemSettings.asset_folder_rules over the defaults.
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settingsRow = settingsList[0] || null;
  const rules = useMemo(() => resolveAssetRules(settingsRow), [settingsRow]);
  const AUTO_FOLDERS = useMemo(() => new Set([...autoFolderNames(rules), BUILT_IN_FOLDER]), [rules]);
  const autoFolderFor = (id) => autoFolderForRules(id, rules);
  const alterFolderName = (alterId, role) => alterFolderNameRules(alterNameById[alterId] || "Unknown alter", role, rules);
  const [orgOpen, setOrgOpen] = useState(false);
  const saveRules = async (patch) => {
    if (!settingsRow?.id) return;
    const cur = settingsRow.asset_folder_rules && typeof settingsRow.asset_folder_rules === "object" ? settingsRow.asset_folder_rules : {};
    await base44.entities.SystemSettings.update(settingsRow.id, { asset_folder_rules: { ...cur, ...patch, folders: { ...(cur.folders || {}), ...(patch.folders || {}) } } });
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
  };

  // v0.87.6: user-assigned folder ownership. AssetFolder is optional
  // metadata attached to a folder by NAME; a folder only gets a record
  // once the user explicitly assigns an owner (or otherwise adopts it).
  // Auto folders and un-adopted user folders have no record and simply
  // render without ownership chips. Backed up + restored via the
  // ImageAsset export category.
  const { data: assetFolders = [] } = useQuery({
    queryKey: ["assetFolders"],
    queryFn: () => base44.entities.AssetFolder.list(),
  });
  const assetFolderByName = useMemo(() => {
    const m = {};
    for (const f of assetFolders) m[(f.name || "").trim()] = f;
    return m;
  }, [assetFolders]);
  const [ownerFilter, setOwnerFilter] = useState("all"); // "all" | alterId
  const [ownershipDialog, setOwnershipDialog] = useState(null); // folder name or null

  // Deep link from an alter's edit screen (?alter=<id>) — default-open and
  // scroll to that alter's synthesized folder, then strip the param so a
  // refresh/back-nav doesn't re-fire.
  useEffect(() => {
    const alterId = searchParams.get("alter");
    if (!alterId || loadingImages || alters.length === 0) return;
    const folderName = alterFolderName(alterId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("alter");
      next.set("folder", folderName);
      return next;
    }, { replace: true });
     
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

  // Pictures in use on records (imported / pasted-URL avatars, the system
  // picture, group & contact pictures) and the app's built-in images —
  // not in the image store, but part of "all the app's assets".
  const referenced = useReferencedAssets(rules, alterNameById);
  const usage = useImageUsage(rules, alterNameById);
  const items = useMemo(() => {
    const out = [];
    for (const id of Object.keys(rawImages)) {
      const asset = assetByImageId[id];
      const data = rawImages[id];
      out.push({
        key: id, id,
        url: `/local-image/${encodeURIComponent(id)}`,
        asset: asset || null,
        name: asset?.name || usage[id]?.name || id,
        folder: asset?.owner_alter_id && rules.perAlter ? alterFolderName(asset.owner_alter_id, asset.owner_role)
          : ((asset?.folder || "").trim() || usage[id]?.folder || autoFolderFor(id)),
        ...(usage[id]?.ownerAlterId && !asset ? { ownerAlterId: usage[id].ownerAlterId, role: usage[id].role } : {}),
        isGif: !!asset?.is_gif || (typeof data === "string" && data.startsWith("data:image/gif")),
      });
    }
    for (const a of assets) {
      const lid = a.image_url ? getLocalImageId(a.image_url) : null;
      if (lid && rawImages[lid] !== undefined) continue;
      out.push({
        key: `asset-${a.id}`, id: a.id, url: a.image_url, asset: a,
        name: a.name || "Image",
        folder: a.owner_alter_id && rules.perAlter ? alterFolderName(a.owner_alter_id, a.owner_role) : ((a.folder || "").trim() || "Library uploads"),
        isGif: !!a.is_gif,
      });
    }
    // Referenced pictures, skipping any already covered by a stored asset.
    const known = new Set(out.map((i) => i.url));
    for (const r of referenced) if (!known.has(r.url)) out.push({ ...r, id: r.key, asset: null, isGif: false });
    return out;
  }, [rawImages, assets, assetByImageId, alterNameById, rules, referenced, usage]);

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

    let ordered = [...userNames, ...alterFolderNames, ...autoNames];
    // Owner-filter narrows to just folders whose AssetFolder record lists
    // the chosen alter (and the synthetic 👤 folder for that alter, which
    // always belongs to them).
    if (ownerFilter !== "all") {
      const alterOwnedName = alterFolderName(ownerFilter);
      ordered = ordered.filter((f) => {
        if (f === alterOwnedName) return true;
        const rec = assetFolderByName[f];
        return rec && Array.isArray(rec.owner_alter_ids) && rec.owner_alter_ids.includes(ownerFilter);
      });
    }
    return { byFolder: map, orderedFolders: ordered };
  }, [filtered, folderOrder, ownerFilter, assetFolderByName]);

  // Assign / update / clear the alter-owners set for a user folder. Creates
  // an AssetFolder record on first assignment; deletes it when the user
  // clears all owners (keeps the store tidy — no zombie zero-owner rows).
  const saveOwners = async (folderName, ownerAlterIds) => {
    const existing = assetFolderByName[folderName];
    try {
      if ((ownerAlterIds || []).length === 0) {
        if (existing) await base44.entities.AssetFolder.delete(existing.id);
      } else if (existing) {
        await base44.entities.AssetFolder.update(existing.id, { owner_alter_ids: ownerAlterIds });
      } else {
        await base44.entities.AssetFolder.create({ name: folderName, owner_alter_ids: ownerAlterIds });
      }
      qc.invalidateQueries({ queryKey: ["assetFolders"] });
      toast.success((ownerAlterIds || []).length === 0 ? "Ownership cleared" : "Ownership saved");
    } catch (e) {
      toast.error(e?.message || "Couldn't save ownership");
    }
  };

  const isUser = (name) => !AUTO_FOLDERS.has(name) && !name.startsWith(ALTER_FOLDER_PREFIX);

  const createFolder = async () => {
    const name = (await promptText({ title: "New folder", placeholder: "Folder name" }))?.trim();
    if (!name) return;
    if (AUTO_FOLDERS.has(name)) { toast.error("That name is reserved."); return; }
    if (folderOrder.includes(name)) { toast.info("Folder already exists."); return; }
    setFolderOrder((o) => [...o, name]);
  };

  const renameFolder = async (oldName) => {
    if (!isUser(oldName)) return;
    const next = (await promptText({ title: "Rename folder", defaultValue: oldName }))?.trim();
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
    // Also carry the ownership record over so a rename doesn't silently
    // detach the alter-owner metadata from the folder.
    const rec = assetFolderByName[oldName];
    if (rec) {
      try { await base44.entities.AssetFolder.update(rec.id, { name: next }); } catch { /* skip */ }
      qc.invalidateQueries({ queryKey: ["assetFolders"] });
    }
    qc.invalidateQueries({ queryKey: ["imageAssets"] });
    // Don't claim success when some items were left behind in the old folder.
    if (openFolder === oldName) goFolder(next);
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
          image_url: url, folder: (openFolder && isUser(openFolder) ? openFolder : uploadFolder).trim(), is_gif: isGif, created_date: new Date().toISOString(),
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
    const name = await promptText({ title: "Name this image", defaultValue: item.name && item.name !== item.id ? item.name : "" });
    if (name === null) return;
    const folder = (await promptText({ title: "Folder (optional)", placeholder: "Leave blank for none", defaultValue: item.folder === autoFolderFor(item.id) ? "" : item.folder })) || "";
    try {
      await base44.entities.ImageAsset.create({
        name: name.trim() || "Image", image_url: item.url, folder: folder.trim(), is_gif: item.isGif, created_date: new Date().toISOString(),
        // A picture in use on an alter keeps its owner so it files under 👤.
        ...(item.ownerAlterId ? { owner_alter_id: item.ownerAlterId, owner_role: item.role || "avatar" } : {}),
      });
      qc.invalidateQueries({ queryKey: ["imageAssets"] });
      toast.success("Saved to your library");
    } catch (e) { toast.error(e?.message || "Couldn't save"); }
  };
  const renameAsset = async (item) => {
    if (!item.asset) return;
    const name = await promptText({ title: "Rename", defaultValue: item.name });
    if (name === null) return;
    try { await base44.entities.ImageAsset.update(item.asset.id, { name: name.trim() || "Image" }); qc.invalidateQueries({ queryKey: ["imageAssets"] }); } catch (e) { toast.error(e?.message || "Failed"); }
  };
  const moveAsset = async (item) => {
    if (!item.asset) return;
    const folder = await promptText({ title: "Move to folder", placeholder: "Leave blank for none", defaultValue: item.asset.folder || "" });
    if (folder === null) return;
    try { await base44.entities.ImageAsset.update(item.asset.id, { folder: folder.trim() }); qc.invalidateQueries({ queryKey: ["imageAssets"] }); } catch (e) { toast.error(e?.message || "Failed"); }
  };
  const del = async (item) => {
    if (!(await confirm("Permanently delete this image? If it's used as an avatar, background, or in a post, that will break. This can't be undone."))) return;
    try {
      if (item.asset) await base44.entities.ImageAsset.delete(item.asset.id);
      const lid = isLocalImageUrl(item.url) ? getLocalImageId(item.url) : item.id;
      if (lid) await deleteLocalImage(lid);
      qc.invalidateQueries({ queryKey: ["imageAssets"] });
      await loadImages();
    } catch (e) { toast.error(e?.message || "Couldn't delete"); }
  };

  // ── Bulk actions ────────────────────────────────────────────────────
  const selectedItems = useMemo(() => items.filter((i) => selectedKeys.has(i.key)), [items, selectedKeys]);
  const toggleSelect = (item) => setSelectedKeys((s) => { const n = new Set(s); n.has(item.key) ? n.delete(item.key) : n.add(item.key); return n; });
  const bulkMove = async (folder) => {
    setMoveOpen(false);
    setBulkBusy(true);
    let moved = 0, skipped = 0;
    for (const item of selectedItems) {
      try {
        if (item.asset?.owner_alter_id && rules.perAlter) { skipped++; continue; } // filed under its alter
        if (item.asset) await base44.entities.ImageAsset.update(item.asset.id, { folder });
        else await base44.entities.ImageAsset.create({ name: item.name && item.name !== item.id ? item.name : "Image", image_url: item.url, folder, is_gif: item.isGif, created_date: new Date().toISOString() });
        moved++;
      } catch { skipped++; }
    }
    if (folder && isUser(folder) && !folderOrder.includes(folder)) setFolderOrder((o) => [...o, folder]);
    qc.invalidateQueries({ queryKey: ["imageAssets"] });
    setBulkBusy(false);
    stopSelecting();
    toast.success(`Moved ${moved} image${moved === 1 ? "" : "s"}${skipped ? ` · ${skipped} filed under their ${t.alter} stayed put` : ""}`);
  };
  const bulkDelete = async () => {
    const n = selectedItems.length;
    const inUse = selectedItems.filter((i) => usage[i.id]).length;
    const warn = inUse ? ` ${inUse} of them ${inUse === 1 ? "is" : "are"} in use (an avatar, background or post) and will show as missing there.` : "";
    if (!(await confirm(`Permanently delete ${n} image${n === 1 ? "" : "s"}?${warn} This can't be undone.`))) return;
    setBulkBusy(true);
    let failed = 0;
    for (const item of selectedItems) {
      try {
        if (item.asset) await base44.entities.ImageAsset.delete(item.asset.id);
        const lid = isLocalImageUrl(item.url) ? getLocalImageId(item.url) : item.id;
        if (lid) await deleteLocalImage(lid);
      } catch { failed++; }
    }
    qc.invalidateQueries({ queryKey: ["imageAssets"] });
    await loadImages();
    setBulkBusy(false);
    stopSelecting();
    if (failed) toast.error(`${failed} couldn't be deleted`);
    else toast.success(`Deleted ${n} image${n === 1 ? "" : "s"}`);
  };

  // What the grid shows: search results (across every folder), the open
  // folder's images, or the folder tiles.
  const searching = !!search.trim();
  const inFolder = !searching && openFolder != null;
  const folderList = inFolder ? (byFolder[openFolder] || []) : [];
  const limitKey = searching ? "__search__" : openFolder || "";
  const limit = limits[limitKey] || PAGE;
  const gridItems = searching ? filtered : folderList;
  const selectableInView = gridItems.filter((i) => !i.refOnly);
  const allSelected = selectableInView.length > 0 && selectableInView.every((i) => selectedKeys.has(i.key));
  const userFolderNames = orderedFolders.filter(isUser);
  const openUser = inFolder && isUser(openFolder);
  const ownerRec = openUser ? assetFolderByName[openFolder] : null;
  const ownerIds = (ownerRec && Array.isArray(ownerRec.owner_alter_ids)) ? ownerRec.owner_alter_ids : [];

  const imageGrid = (list, showFolder) => (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {list.slice(0, limit).map((item) => (
          <Thumb key={item.key} item={item} onSaveToLibrary={saveToLibrary} onRename={renameAsset} onMove={moveAsset} onDelete={del}
            selecting={selecting} selected={selectedKeys.has(item.key)} onToggle={toggleSelect} showFolder={showFolder} />
        ))}
      </div>
      {list.length > limit && (
        <button type="button" onClick={() => setLimits((m) => ({ ...m, [limitKey]: limit + PAGE }))}
          className="mt-2 w-full py-2 rounded-lg border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30">
          Show {Math.min(PAGE, list.length - limit)} more ({list.length - limit} left)
        </button>
      )}
    </>
  );

  return (
    <div className="max-w-3xl mx-auto pb-28" data-tour="assets-library">
      <div className="flex items-center gap-2 mb-3">
        <Images className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-semibold">Image assets</h1>
      </div>

      <div className="space-y-2 mb-4 sticky top-0 bg-background/95 backdrop-blur z-10 py-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search every folder…" className="pl-9 h-9" />
          </div>
          <button type="button" onClick={() => (selecting ? stopSelecting() : setSelecting(true))} aria-pressed={selecting}
            className={`h-9 px-2.5 flex items-center gap-1 rounded-lg border text-xs flex-shrink-0 ${selecting ? "border-primary/60 text-primary bg-primary/10" : "border-border bg-card/50 text-muted-foreground hover:text-foreground"}`}>
            <CheckSquare className="w-4 h-4" /> {selecting ? "Done" : "Select"}
          </button>
        </div>
        {!selecting && (
          <div className="flex items-center gap-2">
            {!openUser && (
              <Input value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)} placeholder="Upload into folder (optional)" className="flex-1 h-9 text-sm" />
            )}
            {openUser && <span className="flex-1 text-xs text-muted-foreground truncate">Uploads go into “{openFolder}”</span>}
            <button type="button" onClick={createFolder} title="New folder"
              className="h-9 px-2.5 flex items-center gap-1 rounded-lg border border-border bg-card/50 text-xs text-muted-foreground hover:text-foreground hover:bg-accent flex-shrink-0">
              <FolderPlus className="w-4 h-4" /> Folder
            </button>
            <button type="button" onClick={() => setOrgOpen((v) => !v)} aria-expanded={orgOpen} aria-label="How images are filed automatically"
              className={`h-9 w-9 flex items-center justify-center rounded-lg border flex-shrink-0 ${orgOpen ? "border-primary/60 text-primary" : "border-border bg-card/50 text-muted-foreground hover:text-foreground"}`}>
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="h-9 px-3 flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60 flex-shrink-0">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
          </div>
        )}
        {/* Organisation rules: where each kind of image is filed by default
            (rename any auto folder; blank = Other), and whether an alter's
            uploads go under its own 👤 folder, split by role or not. The
            user's own folders always win over these. */}
        {orgOpen && !selecting && (
          <div className="rounded-xl border border-border/50 bg-card/50 p-3 space-y-3">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Auto-organisation</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={rules.perAlter} onChange={(e) => saveRules({ perAlter: e.target.checked })} className="w-4 h-4 rounded" />
              File an {t.alter}'s own images under its 👤 folder
            </label>
            {rules.perAlter && (
              <label className="flex items-center gap-2 text-sm cursor-pointer pl-6">
                <input type="checkbox" checked={rules.alterRoleSplit} onChange={(e) => saveRules({ alterRoleSplit: e.target.checked })} className="w-4 h-4 rounded" />
                Split those by kind (· Avatars / · Banners / · Backgrounds)
              </label>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {Object.keys(DEFAULT_PREFIX_FOLDERS).filter((k) => k !== "fixed").map((k) => (
                <label key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-36 flex-shrink-0 text-muted-foreground truncate" title={PREFIX_LABELS[k] || k}>{PREFIX_LABELS[k] || k}</span>
                  <Input value={rules.folders[k] ?? ""} placeholder="Other"
                    onChange={(e) => saveRules({ folders: { [k]: e.target.value } })}
                    className="h-7 text-xs flex-1" />
                </label>
              ))}
            </div>
            <button type="button" onClick={() => saveRules({ folders: { ...DEFAULT_PREFIX_FOLDERS }, perAlter: true, alterRoleSplit: false })}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">Reset to defaults</button>
          </div>
        )}
        {/* Owner filter (folder grid only) — once any folder has owners. A
            searchable picker: a pill per alter didn't scale. */}
        {assetFolders.length > 0 && !inFolder && !searching && (
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <AlterSearchSelect alters={alters.filter((a) => !a.is_archived)} value={ownerFilter === "all" ? null : ownerFilter}
                onChange={(id) => setOwnerFilter(id || "all")} terms={t}
                placeholder="All owners" noneLabel="All owners" frontingFirst={false} />
            </div>
          </div>
        )}
        {/* Breadcrumb + the open folder's own actions */}
        {inFolder && (
          <div className="flex items-center gap-1 text-sm min-w-0">
            <button type="button" onClick={() => { goFolder(null); stopSelecting(); }} className="flex items-center gap-1 text-muted-foreground hover:text-foreground flex-shrink-0">
              <ArrowLeft className="w-4 h-4" /> All folders
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
            <span className="font-medium truncate flex-1 min-w-0">{openFolder}</span>
            <span className="text-[0.625rem] text-muted-foreground flex-shrink-0">{folderList.length}</span>
            {openUser && !selecting && (
              <span className="flex items-center gap-0.5 flex-shrink-0">
                <button type="button" onClick={() => setOwnershipDialog(openFolder)} aria-label={ownerIds.length ? "Change owners" : "Assign owner"}
                  className={`p-1 rounded hover:bg-muted/60 ${ownerIds.length ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}><UserPlus2 className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => moveFolder(openFolder, -1)} aria-label="Move folder up" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => moveFolder(openFolder, 1)} aria-label="Move folder down" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => renameFolder(openFolder)} aria-label="Rename folder" className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"><Pencil className="w-3.5 h-3.5" /></button>
              </span>
            )}
          </div>
        )}
      </div>

      {loadingImages ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : searching ? (
        filtered.length === 0
          ? <div className="text-center py-16 text-sm text-muted-foreground">No images match.</div>
          : imageGrid(filtered, true)
      ) : inFolder ? (
        folderList.length === 0
          ? <p className="text-center py-16 text-sm text-muted-foreground">Empty — upload into this folder, or move images here.</p>
          : imageGrid(folderList, false)
      ) : orderedFolders.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          {items.length === 0 ? "No images stored yet — upload some, or add avatars/backgrounds anywhere in the app." : "No folders for that owner."}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {orderedFolders.map((folder) => (
            <FolderTile key={folder} name={folder} items={byFolder[folder] || []} onOpen={() => { goFolder(folder); setSelectedKeys(new Set()); }} />
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {selecting && (
        <div className="fixed left-0 right-0 z-40 px-3" style={{ bottom: "calc(var(--bottom-nav-height, 56px) + var(--os-sab, 0px) + 8px)" }}>
          <div className="max-w-3xl mx-auto rounded-2xl border border-border bg-card shadow-2xl p-2 flex items-center gap-1.5">
            <span className="text-xs font-medium px-1.5 flex-shrink-0">{selectedKeys.size} selected</span>
            {(inFolder || searching) && selectableInView.length > 0 && (
              <button type="button" onClick={() => setSelectedKeys(allSelected ? new Set() : new Set(selectableInView.map((i) => i.key)))}
                className="text-xs px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 flex-shrink-0">
                {allSelected ? "None" : "All"}
              </button>
            )}
            <span className="flex-1" />
            <button type="button" disabled={!selectedKeys.size || bulkBusy} onClick={() => setMoveOpen(true)}
              className="h-8 px-2.5 rounded-lg border border-border text-xs flex items-center gap-1 disabled:opacity-40">
              <FolderInput className="w-3.5 h-3.5" /> Move
            </button>
            <button type="button" disabled={!selectedKeys.size || bulkBusy} onClick={bulkDelete}
              className="h-8 px-2.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 text-xs flex items-center gap-1 disabled:opacity-40">
              {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
            </button>
            <button type="button" onClick={stopSelecting} aria-label="Stop selecting" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}
      {moveOpen && (
        <MoveDialog count={selectedKeys.size} folders={userFolderNames} onCancel={() => setMoveOpen(false)} onMove={bulkMove} />
      )}

      {ownershipDialog && (
        <FolderOwnershipDialog
          folderName={ownershipDialog}
          alters={alters.filter((a) => !a.is_archived)}
          initialOwnerIds={(assetFolderByName[ownershipDialog]?.owner_alter_ids) || []}
          onCancel={() => setOwnershipDialog(null)}
          onSave={async (ids) => { await saveOwners(ownershipDialog, ids); setOwnershipDialog(null); }}
        />
      )}
    </div>
  );
}

function FolderOwnershipDialog({ folderName, alters, initialOwnerIds, onCancel, onSave }) {
  const [selected, setSelected] = useState(() => new Set(initialOwnerIds || []));
  const [search, setSearch] = useState("");
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const q = search.trim().toLowerCase();
  const filtered = q ? alters.filter((a) => (a.name || "").toLowerCase().includes(q)) : alters;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent showCloseButton={false} style={{ zIndex: 120 }} className="max-w-sm p-0 gap-0 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-2">
          <DialogTitle className="font-semibold text-sm flex items-center gap-1.5">
            <Users className="w-4 h-4" /> Folder owners
          </DialogTitle>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Pick who this folder belongs to. Once assigned, filter the top of the library to see just that alter's folders.
          </p>
          <div className="text-xs text-foreground">
            Folder: <span className="font-medium">{folderName}</span>
          </div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search alters…" className="h-8 text-sm" />
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border/50 divide-y divide-border/40">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No alters match.</p>
            ) : (
              filtered.map((a) => {
                const checked = selected.has(a.id);
                return (
                  <label key={a.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30 text-sm">
                    <input type="checkbox" checked={checked} onChange={() => toggle(a.id)} className="w-4 h-4 accent-primary flex-shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{a.name || "Unnamed"}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 p-4 border-t border-border/50">
          <button type="button" onClick={onCancel} className="flex-1 h-8 rounded-lg border border-border text-xs font-medium">Cancel</button>
          <button type="button" onClick={() => onSave([...selected])} className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-medium">
            {selected.size === 0 ? "Clear ownership" : `Assign ${selected.size} owner${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
