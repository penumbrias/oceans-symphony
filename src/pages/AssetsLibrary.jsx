import React, { useState, useEffect, useMemo, useRef } from "react";
import MediaPlayer from "@/components/shared/MediaPlayer";
import MediaTuningPanel from "@/components/shared/MediaTuningPanel";
import { useMediaTuning } from "@/lib/mediaTuning";
import { confirm, promptText } from "@/components/shared/ConfirmDialog";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Images, Upload, Loader2, Trash2, Pencil, FolderInput, FolderPlus, Search, SlidersHorizontal,
  ChevronRight, ArrowUp, ArrowDown, X, UserPlus2, Users, ArrowLeft, CheckSquare, Check, Folder,
  Download, Film, Music, FileText, Play, Info, Cloud, CloudOff,
} from "lucide-react";
import ImageViewer from "@/components/shared/ImageViewer";
import AssetInfoDialog from "@/components/shared/AssetInfoDialog";
import { skipKeyForImage, setBackupSkipKeys, skipSetFromSettings } from "@/lib/backupSkip";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useTerms } from "@/lib/useTerms";
import { deleteLocalImageIfUnused } from "@/lib/localImageUsage";
import { useReferencedAssets, useImageUsage, BUILT_IN_FOLDER } from "@/lib/referencedAssets";
import {
  listLocalImageMeta, getLocalImageId, isLocalImageUrl,
  processUploadedImage, saveLocalImage, createLocalImageUrl,
} from "@/lib/localImageStorage";
import {
  assetKind, resolveMime, extForMime, saveAssetToDevice, findStoredFileUses, MAX_FILE_BYTES, classifyFile,
} from "@/lib/assetFiles";
import { isLocalMode } from "@/lib/storageMode";

// Auto-folder names + the user's overrides live in lib/assetFolders.js
// (shared with the picker so both file an image the same way).
import {
  resolveAssetRules, autoFolderNames,
  ALTER_FOLDER_PREFIX, alterFolderName as alterFolderNameRules, DEFAULT_PREFIX_FOLDERS, PREFIX_LABELS,
  autoFolderForItem, explicitFolderOf, kindFolderFor,
  VIDEOS_FOLDER, AUDIO_FOLDER, OTHERS_FOLDER, SONGS_AUDIO_FOLDER, UNORGANIZED_FOLDER, BUILT_IN_KIND_FOLDERS,
} from "@/lib/assetFolders";
const ORDER_KEY = "asset_folder_order_v1";     // user-created folder order (incl. empty)
const PAGE = 24; // lazy-load page size per folder

const loadArr = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const saveArr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* off */ } };

const KIND_ICON = { video: Film, audio: Music, file: FileText, image: Images };
const KIND_WORD = { video: "video", audio: "audio file", file: "file", image: "image" };

const formatSize = (n) => {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

// One small icon button on a tile — always titled + aria-labelled.
function TileButton({ icon: Icon, label, onClick, danger = false, disabled = false, disabledTitle, active = false }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      title={disabled && disabledTitle ? disabledTitle : label} aria-label={label}
      {...(active ? { "aria-pressed": true } : {})}
      className={`p-1 rounded hover:bg-muted/60 disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed ${active ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"} ${danger ? "hover:text-destructive" : "hover:text-foreground"}`}>
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

// A video tile shows a frame from the video itself (metadata only — the
// whole file isn't loaded); audio and other files show an icon.
function VideoPoster({ url }) {
  const src = useResolvedAvatarUrl(url);
  if (!src) return null;
  return <video src={`${src}#t=0.1`} preload="metadata" muted playsInline aria-hidden="true" tabIndex={-1}
    className="absolute inset-0 w-full h-full object-cover pointer-events-none" />;
}

function Thumb({ item, onOpen, onRename, onSave, onMove, onDelete, moveBlockedTitle, backupSkipped = false, onToggleBackup, selecting = false, selected = false, onToggle, showFolder = false }) {
  // Only pictures are drawn as pictures — a song or video "as an image"
  // was a broken-picture icon.
  const isImage = item.kind === "image";
  const resolved = useResolvedAvatarUrl(isImage ? item.url : null);
  const [panel, setPanel] = useState(null); // "view" | "info" | null
  const KindIcon = KIND_ICON[item.kind] || FileText;
  // Pictures only referenced by a record / built into the app can't be
  // moved or deleted from here — in select mode they're dimmed, not pickable.
  const pickable = !item.refOnly;
  const ext = !isImage ? (extForMime(item.mime) || (/\.([A-Za-z0-9]{1,6})$/.exec(item.asset?.file_name || "") || [])[1] || "") : "";
  const image = (
    <div className={`relative w-full aspect-square rounded-lg overflow-hidden border bg-muted/30 ${
      selected ? "border-primary ring-2 ring-primary" : "border-border/50"} ${selecting && !pickable ? "opacity-40" : ""}`}>
      {isImage
        ? (resolved
          ? <img src={resolved} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
          : <span className="w-full h-full flex items-center justify-center text-muted-foreground"><Images className="w-5 h-5" /></span>)
        : (
          <span className="relative w-full h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
            {item.kind === "video" && <VideoPoster url={item.url} />}
            <span className={item.kind === "video" ? "relative rounded-full bg-black/50 p-1.5 text-white" : ""}>
              <KindIcon className={item.kind === "video" ? "w-5 h-5" : "w-7 h-7 text-primary/80"} />
            </span>
            {ext && <span className={`relative text-[0.5625rem] font-semibold uppercase tracking-wide ${item.kind === "video" ? "px-1 rounded bg-black/50 text-white" : ""}`}>{ext}</span>}
            {item.kind === "video" && !selecting && <Play className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 text-white drop-shadow" />}
          </span>
        )}
      {item.isGif && <span className="absolute top-1 left-1 text-[0.5rem] font-bold px-1 rounded bg-black/60 text-white">GIF</span>}
      {backupSkipped && <span title="Left out of backups" className="absolute bottom-1 left-1 rounded-full bg-black/60 text-white p-0.5"><CloudOff className="w-3 h-3" /></span>}
      {selecting && pickable && (
        <span className={`absolute top-1 right-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          selected ? "bg-primary border-primary text-primary-foreground" : "bg-black/40 border-white/80"}`}>
          {selected && <Check className="w-3 h-3" />}
        </span>
      )}
    </div>
  );
  return (
    <div className="relative group min-w-0">
      {selecting ? (
        <button type="button" disabled={!pickable} onClick={() => onToggle(item)} aria-pressed={selected}
          aria-label={`${selected ? "Deselect" : "Select"} ${item.name}`} className="block w-full text-left">
          {image}
        </button>
      ) : !isImage ? (
        <button type="button" onClick={() => onOpen(item)} aria-label={`Open ${item.name}`} className="block w-full text-left">
          {image}
        </button>
      ) : resolved ? (
        // Pictures open full screen, with zoom.
        <button type="button" onClick={() => setPanel("view")} aria-label={`View ${item.name}`} className="block w-full text-left">
          {image}
        </button>
      ) : image}
      <p className="text-[0.625rem] text-muted-foreground truncate mt-0.5 px-0.5" title={item.name}>{item.name}</p>
      {showFolder && <p className="text-[0.5625rem] text-muted-foreground/70 truncate px-0.5">{item.folder}</p>}
      {!selecting && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-0.5">
          <TileButton icon={Info} label={`Details for ${item.name}`} onClick={() => setPanel("info")} />
          <TileButton icon={Pencil} label={`Rename ${item.name}`} onClick={() => onRename(item)} />
          <TileButton icon={Download} label={`Save ${item.name} to device`} onClick={() => onSave(item)} />
          {onToggleBackup && (
            <TileButton icon={backupSkipped ? CloudOff : Cloud} onClick={() => onToggleBackup(item)}
              label={backupSkipped ? `Include ${item.name} in backups again` : `Leave ${item.name} out of backups`}
              active={backupSkipped} />
          )}
          <TileButton icon={FolderInput} label={`Move ${item.name} to a folder`} onClick={() => onMove(item)}
            disabled={!!moveBlockedTitle} disabledTitle={moveBlockedTitle} />
          <TileButton icon={Trash2} label={`Delete ${item.name}`} onClick={() => onDelete(item)} danger
            disabled={!!item.refOnly} disabledTitle="In use on a record, not stored in Assets — change it where it's used" />
        </div>
      )}
      {panel === "view" && <ImageViewer open src={resolved || item.url} name={item.name} isGif={item.isGif} onClose={() => setPanel(null)} />}
      {panel === "info" && <AssetInfoDialog item={item} backupSkipped={backupSkipped} onClose={() => setPanel(null)} />}
    </div>
  );
}

// A song or video played from the library, with the same controls (seek,
// loop, full screen) and tempo & pitch panel the chat player has.
function StoredMedia({ item, src }) {
  const ref = useRef(null);
  const tuning = useMediaTuning(ref, item.key || item.id || item.url);
  return (
    <div className="w-full rounded-xl border border-border/50 bg-muted/20 p-2 space-y-1.5">
      <MediaPlayer mediaRef={ref} src={src} kind={item.kind === "video" ? "video" : "audio"} tuning={tuning} />
      <MediaTuningPanel tuning={tuning} />
    </div>
  );
}

// A song, video or file opened from its tile: play it here, or save it.
function PreviewDialog({ item, onClose, onSave }) {
  const src = useResolvedAvatarUrl(item.kind === "audio" || item.kind === "video" ? item.url : null);
  const KindIcon = KIND_ICON[item.kind] || FileText;
  const size = formatSize(item.size);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-sm flex items-center gap-1.5 min-w-0 pr-6">
          <KindIcon className="w-4 h-4 flex-shrink-0 text-primary" /> <span className="truncate">{item.name}</span>
        </DialogTitle>
        {item.kind === "video" && (src
          ? <StoredMedia item={item} src={src} />
          : <p className="text-xs text-muted-foreground">This video isn&apos;t stored on this device.</p>)}
        {item.kind === "audio" && (src
          ? <StoredMedia item={item} src={src} />
          : <p className="text-xs text-muted-foreground">This audio isn&apos;t stored on this device.</p>)}
        {item.kind === "file" && (
          <div className="flex flex-col items-center gap-1 py-6 text-muted-foreground">
            <FileText className="w-10 h-10 text-primary/80" />
            <p className="text-xs">{(extForMime(item.mime) || "file").toUpperCase()}{size ? ` · ${size}` : ""}</p>
          </div>
        )}
        <p className="text-[0.6875rem] text-muted-foreground">{item.folder}{size && item.kind !== "file" ? ` · ${size}` : ""}</p>
        <button type="button" onClick={() => onSave(item)}
          className="h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5">
          <Download className="w-4 h-4" /> Save to device
        </button>
      </DialogContent>
    </Dialog>
  );
}

// A folder in the folder grid: its first picture as the cover, name, count.
const FOLDER_ICONS = { [VIDEOS_FOLDER]: Film, [AUDIO_FOLDER]: Music, [SONGS_AUDIO_FOLDER]: Music, [OTHERS_FOLDER]: FileText };

// In select mode a folder the person made can be ticked (to delete it); the
// built-in folders still just open.
function FolderTile({ name, items, onOpen, selecting = false, selectable = false, selected = false, onToggle }) {
  const cover = items.find((i) => i.url && i.kind === "image")?.url || "";
  const resolved = useResolvedAvatarUrl(cover);
  const allImages = items.length > 0 && items.every((i) => i.kind === "image");
  const word = allImages ? "image" : "item";
  const Icon = FOLDER_ICONS[name] || Folder;
  const pick = selecting && selectable;
  return (
    <button type="button" onClick={pick ? onToggle : onOpen} className="text-left group min-w-0"
      aria-pressed={pick ? selected : undefined}
      aria-label={pick ? `${selected ? "Deselect" : "Select"} folder ${name}` : undefined}>
      <div className={`relative w-full aspect-square rounded-xl overflow-hidden border bg-muted/30 flex items-center justify-center transition-colors ${
        selected ? "border-primary ring-2 ring-primary" : "border-border/50 group-hover:border-primary/50"} ${selecting && !selectable ? "opacity-50" : ""}`}>
        {pick && (
          <span className={`absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
            selected ? "bg-primary border-primary text-primary-foreground" : "bg-black/40 border-white/80"}`}>
            {selected && <Check className="w-3 h-3" />}
          </span>
        )}
        {resolved
          ? <img src={resolved} alt="" className="w-full h-full object-cover" loading="lazy" />
          : <Icon className="w-8 h-8 text-muted-foreground/60" />}
      </div>
      <p className="text-xs font-medium truncate mt-1 px-0.5">{name}</p>
      <p className="text-[0.625rem] text-muted-foreground px-0.5">{items.length} {word}{items.length === 1 ? "" : "s"}</p>
    </button>
  );
}

// Confirm deleting folders: either just the folder (its files are kept and
// land in Unorganized) or the folder AND everything in it.
function FolderDeleteDialog({ folders, onCancel, onKeepFiles, onDeleteAll }) {
  const totalFiles = folders.reduce((n, f) => n + f.count, 0);
  const many = folders.length > 1;
  const shown = folders.slice(0, 5);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm" aria-describedby={undefined}>
        <DialogTitle className="text-sm">Delete {many ? `${folders.length} folders` : "this folder"}?</DialogTitle>
        <div className="text-xs text-muted-foreground space-y-0.5">
          {shown.map((f) => (
            <p key={f.name} className="flex items-center justify-between gap-2">
              <span className="truncate text-foreground">{f.name}</span>
              <span className="flex-shrink-0">{f.count} item{f.count === 1 ? "" : "s"}</span>
            </p>
          ))}
          {folders.length > shown.length && <p>+ {folders.length - shown.length} more</p>}
        </div>
        <p className="text-xs text-muted-foreground">
          {totalFiles === 0 ? `${many ? "These folders are" : "This folder is"} empty.` : "Choose what happens to what's inside."}
        </p>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={onKeepFiles}
            className="w-full rounded-lg border border-border px-3 py-2 text-left hover:bg-muted/40">
            <span className="block text-sm font-medium">{totalFiles === 0 ? `Delete ${many ? "folders" : "folder"}` : `Delete ${many ? "folders" : "folder"} only`}</span>
            {totalFiles > 0 && <span className="block text-xs text-muted-foreground">Keeps everything inside — it moves to “{UNORGANIZED_FOLDER}”.</span>}
          </button>
          {totalFiles > 0 && (
            <button type="button" onClick={onDeleteAll}
              className="w-full rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-left text-destructive hover:bg-destructive/15">
              <span className="block text-sm font-medium">Delete {many ? "folders" : "folder"} and everything in {many ? "them" : "it"}</span>
              <span className="block text-xs opacity-80">Permanently deletes {totalFiles} item{totalFiles === 1 ? "" : "s"}. Anything still in use elsewhere is kept on this device.</span>
            </button>
          )}
          <button type="button" onClick={onCancel} className="w-full h-9 rounded-lg border border-border text-sm">Cancel</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Pick a destination folder for moved items: any folder, a new one, or
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
        <DialogTitle className="text-sm">Move {count} item{count === 1 ? "" : "s"} to…</DialogTitle>
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
  const [preview, setPreview] = useState(null); // song / video / file opened from its tile
  // Folders ticked in select mode (on the folder grid), to delete.
  const [selectedFolders, setSelectedFolders] = useState(() => new Set());
  const [folderDeleteOpen, setFolderDeleteOpen] = useState(false);
  const stopSelecting = () => { setSelecting(false); setSelectedKeys(new Set()); setSelectedFolders(new Set()); setFolderDeleteOpen(false); };

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
    try { setRawImages(await listLocalImageMeta()); } catch { setRawImages({}); }
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
      const meta = rawImages[id];
      const kind = assetKind({ asset, meta, id });
      const mime = resolveMime({ recordMime: asset?.mime, storedMime: meta?.mime, head: meta?.head });
      out.push({
        key: id, id,
        url: `/local-image/${encodeURIComponent(id)}`,
        asset: asset || null,
        kind, mime, size: meta?.size || asset?.size || 0,
        name: asset?.name || usage[id]?.name || id,
        folder: asset?.owner_alter_id && rules.perAlter ? alterFolderName(asset.owner_alter_id, asset.owner_role)
          : (explicitFolderOf(asset, id, rules) || usage[id]?.folder || autoFolderForItem(id, kind, rules)),
        ...(usage[id]?.ownerAlterId && !asset ? { ownerAlterId: usage[id].ownerAlterId, role: usage[id].role } : {}),
        isGif: !!asset?.is_gif || mime === "image/gif",
      });
    }
    for (const a of assets) {
      const lid = a.image_url ? getLocalImageId(a.image_url) : null;
      if (lid && rawImages[lid] !== undefined) continue;
      const kind = assetKind({ asset: a });
      out.push({
        key: `asset-${a.id}`, id: a.id, url: a.image_url, asset: a,
        kind, mime: a.mime || "", size: a.size || 0,
        name: a.name || (kind === "image" ? "Image" : "File"),
        folder: a.owner_alter_id && rules.perAlter ? alterFolderName(a.owner_alter_id, a.owner_role)
          : (explicitFolderOf(a, lid, rules) || (kind === "image" ? "Library uploads" : kindFolderFor(kind, lid))),
        isGif: !!a.is_gif,
      });
    }
    // Referenced pictures, skipping any already covered by a stored asset.
    const known = new Set(out.map((i) => i.url));
    for (const r of referenced) if (!known.has(r.url)) out.push({ ...r, id: r.key, asset: null, kind: "image", mime: "", isGif: false });
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
    // A saved folder name that is now a built-in one (an old "Audio" folder
    // made before Audio was built in) would show up twice — keep the built-in.
    const userNames = folderOrder.filter((n, i, arr) => n && !AUTO_FOLDERS.has(n) && !isAlterFolder(n) && arr.indexOf(n) === i);
    for (const n of userFromItems) if (!userNames.includes(n)) userNames.push(n);

    const alterFolderNames = Object.keys(map).filter(isAlterFolder).sort((a, b) => a.localeCompare(b));

    const autoNames = Object.keys(map)
      .filter((f) => AUTO_FOLDERS.has(f) && !BUILT_IN_KIND_FOLDERS.includes(f))
      .sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));

    // Videos, Audio and Others are always listed (even empty) so it's clear
    // where each kind of file goes — except while searching, when only hits show.
    const kindFolders = BUILT_IN_KIND_FOLDERS.filter((f) => !search.trim() || (map[f] || []).length > 0);
    let ordered = [...userNames, ...kindFolders, ...alterFolderNames, ...autoNames];
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
  }, [filtered, folderOrder, ownerFilter, assetFolderByName, search, AUTO_FOLDERS]);

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

  // Pictures are compressed like every upload. Videos, audio and any other
  // file are stored exactly as they are (original quality) and file
  // themselves into Videos / Audio / Others — or the open folder.
  const targetFolder = () => (openFolder && isUser(openFolder) ? openFolder : uploadFolder).trim();
  const handleFiles = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    let added = 0, addedFiles = 0, tooBig = 0, notLocal = 0;
    for (const file of files) {
      try {
        const picked = classifyFile(file.type, file.name);
        if (picked !== "image") {
          if (!isLocalMode()) { notLocal++; continue; }
          if (file.size > MAX_FILE_BYTES) { tooBig++; continue; }
          const id = `file-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const mime = file.type || "";
          await saveLocalImage(id, file, mime || undefined);
          const kind = mime ? assetKind({ asset: { mime }, id }) : picked;
          await base44.entities.ImageAsset.create({
            name: file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "File",
            image_url: createLocalImageUrl(id), folder: targetFolder(),
            kind, mime, file_name: file.name, size: file.size,
            is_gif: false, created_date: new Date().toISOString(),
          });
          addedFiles++;
          continue;
        }
        const { dataUrl, isGif } = await processUploadedImage(file, 1200, 0.85);
        let url = dataUrl;
        if (isLocalMode()) {
          const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          await saveLocalImage(id, dataUrl);
          url = createLocalImageUrl(id);
        }
        await base44.entities.ImageAsset.create({
          name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Image",
          image_url: url, folder: targetFolder(), is_gif: isGif, created_date: new Date().toISOString(),
        });
        added++;
      } catch { /* skip */ }
    }
    qc.invalidateQueries({ queryKey: ["imageAssets"] });
    await loadImages();
    setUploading(false);
    const bits = [];
    if (added) bits.push(`${added} image${added === 1 ? "" : "s"}`);
    if (addedFiles) bits.push(`${addedFiles} file${addedFiles === 1 ? "" : "s"}`);
    if (bits.length) toast.success(`${bits.join(" and ")} uploaded`);
    if (tooBig) toast.error(`${tooBig} file${tooBig === 1 ? " is" : "s are"} over ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB and ${tooBig === 1 ? "wasn't" : "weren't"} stored.`);
    if (notLocal) toast.error("Videos, audio and other files can only be stored on this device in local mode.");
  };

  // The fields a new library record for this item needs, so a picture that
  // had no record yet (a chat image, an imported avatar) keeps its type and
  // its owner when it gets one.
  const recordFor = (item, extra) => ({
    name: item.name && item.name !== item.id ? item.name : (item.kind === "image" ? "Image" : "File"),
    image_url: item.url, is_gif: !!item.isGif, created_date: new Date().toISOString(),
    ...(item.kind && item.kind !== "image" ? { kind: item.kind, mime: item.mime || "" } : {}),
    ...(item.ownerAlterId ? { owner_alter_id: item.ownerAlterId, owner_role: item.role || "avatar" } : {}),
    ...extra,
  });

  // Rename anything — a picture with no record yet gets one, filed where
  // it already shows (a stored one keeps filing automatically).
  const renameItem = async (item) => {
    const current = item.name && item.name !== item.id ? item.name : "";
    const name = await promptText({ title: `Rename ${KIND_WORD[item.kind] || "item"}`, defaultValue: current, placeholder: "Name" });
    if (name === null) return;
    const clean = name.trim() || (item.kind === "image" ? "Image" : "File");
    try {
      if (item.asset) await base44.entities.ImageAsset.update(item.asset.id, { name: clean });
      else await base44.entities.ImageAsset.create(recordFor(item, { name: clean, folder: item.refOnly && isUser(item.folder) ? item.folder : "" }));
      qc.invalidateQueries({ queryKey: ["imageAssets"] });
      toast.success("Renamed");
    } catch (e) { toast.error(e?.message || "Couldn't rename"); }
  };

  const saveItem = async (item) => {
    const res = await saveAssetToDevice({
      url: item.url, name: item.name && item.name !== item.id ? item.name : "",
      mime: item.mime, kind: item.kind, originalName: item.asset?.file_name || "",
    });
    if (res.ok) toast.success(res.location ? `Saved to ${res.location}` : "Saved to device");
    else if (res.error === "not_on_device") toast.error(`That ${KIND_WORD[item.kind] || "file"} isn't stored on this device.`);
    else if (res.error !== "cancelled") toast.error("Couldn't save it to the device.");
  };

  // Why an item can't be moved, or null when it can.
  const moveBlockedFor = (item) => (item.asset?.owner_alter_id && rules.perAlter
    ? `Filed under its ${t.alter}'s 👤 folder — turn that off in the auto-organisation panel to move it`
    : null);

  // Words for where a file is still used, for the delete warning.
  const placeWord = (entity, n) => {
    const words = {
      SystemChatMessage: ["chat message", "chat messages"], Bulletin: ["bulletin", "bulletins"],
      BulletinComment: ["comment", "comments"], JournalEntry: ["journal entry", "journal entries"],
      Alter: [t.alter, t.alters], AlterNote: [`${t.alter} note`, `${t.alter} notes`], Group: ["group", "groups"],
      Contact: ["contact", "contacts"], SystemSettings: ["setting", "settings"],
      ImageAsset: [`${t.alter} image-pool entry`, `${t.alter} image-pool entries`],
    }[entity];
    if (words) return `${n} ${n === 1 ? words[0] : words[1]}`;
    const plain = entity.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    return `${n} ${plain} record${n === 1 ? "" : "s"}`;
  };
  const usesSummary = (uses) => Object.entries(uses || {}).map(([e, n]) => placeWord(e, n)).join(", ");

  // Folders an alter's avatar/background pool is linked to — rows filed
  // there are that pool's pictures, not spare library copies.
  const linkedPoolFolders = useMemo(() => new Set(alters
    .flatMap((a) => [a.avatar_pool_folder, a.background_pool_folder])
    .map((f) => (f || "").trim()).filter(Boolean)), [alters]);
  const isPoolRow = (a) => !!a.owner_alter_id || linkedPoolFolders.has((a.folder || "").trim());

  // The library records a delete removes: the tile's own record, plus
  // plain duplicate library rows for the same file. Rows that belong to an
  // alter's image pool ("Pick from library" makes a second row pointing at
  // the same picture) are never removed from here — they're a use of it.
  const rowsToRemove = (item) => {
    if (!item.asset) return assets.filter((a) => a.image_url && a.image_url === item.url && !isPoolRow(a));
    if (isPoolRow(item.asset)) return [item.asset];
    return assets.filter((a) => a.id === item.asset.id || (a.image_url && a.image_url === item.url && !isPoolRow(a)));
  };
  const storedIdFor = (item) => (isLocalImageUrl(item.url) ? getLocalImageId(item.url) : (item.asset ? null : item.id));

  // Where the file stays in use once this delete is done: records that
  // show it, plus library / pool rows that aren't being removed.
  const usesAfterDelete = (item) => {
    const lid = storedIdFor(item) || item.id;
    const uses = { ...(findStoredFileUses([lid])[lid] || {}) };
    const removing = new Set(rowsToRemove(item).map((a) => a.id));
    const otherRows = assets.filter((a) => !removing.has(a.id) && a.image_url && getLocalImageId(a.image_url) === lid).length;
    if (otherRows) uses.ImageAsset = otherRows;
    return uses;
  };

  // Remove one library item. With library record(s), those go to the
  // trash and the stored file stays, so it can be put back; the trash
  // removes the file later, once nothing uses it. A file with no record
  // (only in the picture store) is deleted now, but ONLY when nothing else
  // still uses it (another library or pool row, an avatar, a background,
  // a message, another system…). Returns { keptFile, trashed }.
  const removeStored = async (item) => {
    const lid = storedIdFor(item);
    const rows = rowsToRemove(item);
    if (rows.length) {
      for (const a of rows) await base44.entities.ImageAsset.delete(a.id);
      return { keptFile: false, trashed: true };
    }
    if (!lid) return { keptFile: false };
    const { deleted } = await deleteLocalImageIfUnused(lid, { deletedRecords: rows.map((a) => ({ entity: "ImageAsset", id: a.id })) });
    return { keptFile: !deleted };
  };

  const del = async (item) => {
    if (item.refOnly) return;
    const where = usesSummary(usesAfterDelete(item));
    const word = KIND_WORD[item.kind] || "item";
    const ok = await confirm({
      title: `Delete “${item.name}”?`,
      body: where
        ? `This ${word} is still used in ${where}, so it stays stored on this device for those — only this library entry is removed.`
        : rowsToRemove(item).length
          ? `This moves the ${word} to the trash. You can put it back from Settings → Trash until the trash empties.`
          : `This permanently removes the ${word} from this device. This can't be undone — save it to the device first if you want a copy.`,
      confirmLabel: "Delete", destructive: true,
    });
    if (!ok) return;
    try {
      const { keptFile, trashed } = await removeStored(item);
      qc.invalidateQueries({ queryKey: ["imageAssets"] });
      await loadImages();
      if (trashed) toast.success("Moved to the trash");
      else if (keptFile) toast.success(`Removed from the library — the ${word} is kept because it's still used elsewhere`);
      else toast.success("Deleted");
    } catch (e) { toast.error(e?.message || "Couldn't delete"); }
  };

  // ── Moving (one item from its tile, or the selection) ───────────────
  const [moveItems, setMoveItems] = useState(null); // null | item[]
  const openMove = (item) => {
    const blocked = moveBlockedFor(item);
    if (blocked) { toast.info(blocked); return; }
    setMoveItems([item]);
  };
  const doMove = async (list, folder) => {
    let moved = 0, skipped = 0;
    for (const item of list) {
      try {
        if (moveBlockedFor(item)) { skipped++; continue; } // filed under its alter
        if (item.asset) await base44.entities.ImageAsset.update(item.asset.id, { folder });
        else await base44.entities.ImageAsset.create(recordFor(item, { folder }));
        moved++;
      } catch { skipped++; }
    }
    if (folder && isUser(folder) && !folderOrder.includes(folder)) setFolderOrder((o) => [...o, folder]);
    qc.invalidateQueries({ queryKey: ["imageAssets"] });
    return { moved, skipped };
  };

  // ── Bulk actions ────────────────────────────────────────────────────
  const selectedItems = useMemo(() => items.filter((i) => selectedKeys.has(i.key)), [items, selectedKeys]);
  const toggleSelect = (item) => setSelectedKeys((s) => { const n = new Set(s); n.has(item.key) ? n.delete(item.key) : n.add(item.key); return n; });
  const runMove = async (folder) => {
    const list = moveItems || selectedItems;
    const single = !!moveItems;
    setMoveOpen(false);
    setMoveItems(null);
    setBulkBusy(true);
    const { moved, skipped } = await doMove(list, folder);
    setBulkBusy(false);
    if (!single) stopSelecting();
    toast.success(`Moved ${moved} item${moved === 1 ? "" : "s"}${skipped ? ` · ${skipped} filed under their ${t.alter} stayed put` : ""}`);
  };
  const bulkDelete = async () => {
    const n = selectedItems.length;
    const inUse = selectedItems.filter((i) => Object.keys(usesAfterDelete(i)).length).length;
    const warn = inUse ? ` ${inUse} of them ${inUse === 1 ? "is" : "are"} still in use (an avatar, background, image pool, post or message), so ${inUse === 1 ? "it stays" : "those stay"} stored on this device — only the library ${inUse === 1 ? "entry is" : "entries are"} removed.` : "";
    if (!(await confirm({ title: `Delete ${n} item${n === 1 ? "" : "s"}?`, body: `This permanently removes them from this device.${warn} This can't be undone.`, confirmLabel: "Delete", destructive: true }))) return;
    setBulkBusy(true);
    let failed = 0, kept = 0;
    for (const item of selectedItems) {
      try { if ((await removeStored(item)).keptFile) kept++; } catch { failed++; }
    }
    qc.invalidateQueries({ queryKey: ["imageAssets"] });
    await loadImages();
    setBulkBusy(false);
    stopSelecting();
    if (failed) toast.error(`${failed} couldn't be deleted`);
    else toast.success(`Deleted ${n} item${n === 1 ? "" : "s"}${kept ? ` · ${kept} kept on this device because ${kept === 1 ? "it's" : "they're"} still used elsewhere` : ""}`);
  };

  // ── "Skip in backups" (per file, or every file in a folder) ─────────
  // Everything is backed up unless marked here. Marking only leaves a file
  // OUT of backups — it is never deleted or changed — so a skipped file
  // lives only on this device.
  const backupSkipSet = useMemo(() => skipSetFromSettings(settingsRow), [settingsRow]);
  const backupKeyOf = (item) => { const lid = item.refOnly ? null : storedIdFor(item); return lid ? skipKeyForImage(lid) : null; };
  const isBackupSkipped = (item) => { const k = backupKeyOf(item); return !!k && backupSkipSet.has(k); };
  const toggleBackupSkip = async (item) => {
    const k = backupKeyOf(item);
    if (!k) return;
    const skip = !backupSkipSet.has(k);
    if (skip && !(await confirm({
      title: `Leave “${item.name}” out of backups?`,
      body: "It stays on this device, but it won't be in an exported or automatic backup. If this device is lost or wiped, it can't be restored.",
      confirmLabel: "Leave it out",
    }))) return;
    try {
      await setBackupSkipKeys([k], skip);
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
      toast.success(skip ? "Left out of backups (it stays on this device only)" : "Included in backups again");
    } catch (e) { toast.error(e?.message || "Couldn't change that"); }
  };
  // Applies to what's in the folder right now; files added later are
  // included by default.
  const setFolderBackupSkip = async (list, skip) => {
    const keys = [...new Set(list.map(backupKeyOf).filter(Boolean))];
    if (!keys.length) return;
    if (skip && !(await confirm({
      title: `Leave ${keys.length} file${keys.length === 1 ? "" : "s"} out of backups?`,
      body: "They stay on this device, but they won't be in an exported or automatic backup. If this device is lost or wiped, they can't be restored. Files you add to this folder later are still included.",
      confirmLabel: "Leave them out",
    }))) return;
    try {
      await setBackupSkipKeys(keys, skip);
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
      toast.success(skip ? `${keys.length} left out of backups` : `${keys.length} included in backups again`);
    } catch (e) { toast.error(e?.message || "Couldn't change that"); }
  };

  // ── Deleting folders (select mode, folder grid) ─────────────────────
  const toggleFolderSelect = (name) => setSelectedFolders((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n; });
  // Forget a folder once it's empty: drop it from the saved order and clear its owners.
  const forgetFolder = async (name) => {
    setFolderOrder((o) => o.filter((n) => n !== name));
    const rec = assetFolderByName[name];
    if (rec) { try { await base44.entities.AssetFolder.delete(rec.id); } catch { /* owner note only */ } }
  };
  const folderFiles = (name) => items.filter((i) => i.folder === name && !i.refOnly);
  const deleteSelectedFolders = async (mode) => {
    const names = [...selectedFolders].filter(isUser);
    if (!names.length) return;
    setFolderDeleteOpen(false);
    if (mode === "all") {
      const files = names.flatMap(folderFiles);
      const inUse = files.filter((i) => Object.keys(usesAfterDelete(i)).length).length;
      const warn = inUse ? ` ${inUse} of them ${inUse === 1 ? "is" : "are"} still in use elsewhere, so ${inUse === 1 ? "it stays" : "those stay"} stored on this device.` : "";
      if (!(await confirm({
        title: `Delete ${names.length === 1 ? "this folder" : `${names.length} folders`} and ${files.length} item${files.length === 1 ? "" : "s"}?`,
        body: `This permanently removes them from this device.${warn} This can't be undone.`,
        confirmLabel: "Delete", destructive: true,
      }))) { setFolderDeleteOpen(true); return; }
    }
    setBulkBusy(true);
    let removed = 0, moved = 0, deleted = 0, failed = 0;
    for (const name of names) {
      const list = folderFiles(name);
      let bad = 0;
      for (const item of list) {
        try {
          if (mode === "all") { await removeStored(item); deleted++; }
          else if (item.asset) { await base44.entities.ImageAsset.update(item.asset.id, { folder: UNORGANIZED_FOLDER }); moved++; }
          else { await base44.entities.ImageAsset.create(recordFor(item, { folder: UNORGANIZED_FOLDER })); moved++; }
        } catch { bad++; }
      }
      failed += bad;
      // Only forget the folder once nothing is left in it.
      if (bad === 0) { await forgetFolder(name); removed++; }
    }
    qc.invalidateQueries({ queryKey: ["imageAssets"] });
    qc.invalidateQueries({ queryKey: ["assetFolders"] });
    await loadImages();
    setBulkBusy(false);
    stopSelecting();
    if (failed) toast.error(`${failed} item${failed === 1 ? "" : "s"} couldn't be ${mode === "all" ? "deleted" : "moved"}, so ${failed === 1 ? "its folder was" : "their folders were"} kept.`);
    else toast.success(`Deleted ${removed} folder${removed === 1 ? "" : "s"}${mode === "all" ? (deleted ? ` and ${deleted} item${deleted === 1 ? "" : "s"}` : "") : (moved ? ` · ${moved} item${moved === 1 ? "" : "s"} moved to “${UNORGANIZED_FOLDER}”` : "")}`);
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
  const folderBackupKeys = inFolder ? [...new Set(folderList.map(backupKeyOf).filter(Boolean))] : [];
  const folderAllSkipped = folderBackupKeys.length > 0 && folderBackupKeys.every((k) => backupSkipSet.has(k));

  const imageGrid = (list, showFolder) => (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {list.slice(0, limit).map((item) => (
          <Thumb key={item.key} item={item} onOpen={setPreview} onRename={renameItem} onSave={saveItem} onMove={openMove} onDelete={del}
            moveBlockedTitle={moveBlockedFor(item)}
            backupSkipped={isBackupSkipped(item)} onToggleBackup={backupKeyOf(item) ? toggleBackupSkip : undefined}
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
        <h1 className="text-lg font-semibold">Assets</h1>
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
            <input ref={fileRef} type="file" multiple hidden onChange={handleFiles} />
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
              {Object.keys(DEFAULT_PREFIX_FOLDERS).filter((k) => k !== "fixed" && k !== "file" && k !== "chatfile").map((k) => (
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
            {!selecting && folderBackupKeys.length > 0 && (
              <button type="button" onClick={() => setFolderBackupSkip(folderList, !folderAllSkipped)}
                aria-label={folderAllSkipped ? "Include this folder in backups again" : "Leave this folder out of backups"}
                title={folderAllSkipped ? "Left out of backups — tap to include again" : "Included in backups — tap to leave this folder's files out"}
                className={`p-1 rounded hover:bg-muted/60 flex-shrink-0 ${folderAllSkipped ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground hover:text-foreground"}`}>
                {folderAllSkipped ? <CloudOff className="w-3.5 h-3.5" /> : <Cloud className="w-3.5 h-3.5" />}
              </button>
            )}
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
          ? <div className="text-center py-16 text-sm text-muted-foreground">Nothing matches.</div>
          : imageGrid(filtered, true)
      ) : inFolder ? (
        folderList.length === 0
          ? <p className="text-center py-16 text-sm text-muted-foreground">{BUILT_IN_KIND_FOLDERS.includes(openFolder)
            ? `Empty — ${openFolder === VIDEOS_FOLDER ? "videos" : openFolder === AUDIO_FOLDER ? "audio" : "other files"} you upload or attach in chat show up here.`
            : "Empty — upload into this folder, or move items here."}</p>
          : imageGrid(folderList, false)
      ) : orderedFolders.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          {items.length === 0 ? "Nothing stored yet — upload some, or add avatars/backgrounds anywhere in the app." : "No folders for that owner."}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {orderedFolders.map((folder) => (
            <FolderTile key={folder} name={folder} items={byFolder[folder] || []}
              selecting={selecting} selectable={isUser(folder)} selected={selectedFolders.has(folder)} onToggle={() => toggleFolderSelect(folder)}
              onOpen={() => { goFolder(folder); setSelectedKeys(new Set()); setSelectedFolders(new Set()); }} />
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {selecting && (
        <div className="fixed left-0 right-0 z-40 px-3" style={{ bottom: "calc(var(--bottom-nav-height, 56px) + var(--os-sab, 0px) + 8px)" }}>
          <div className="max-w-3xl mx-auto rounded-2xl border border-border bg-card shadow-2xl p-2 flex items-center gap-1.5">
            {!inFolder && !searching ? (
              <span className="text-xs font-medium px-1.5 flex-shrink-0 min-w-0 truncate">
                {selectedFolders.size ? `${selectedFolders.size} folder${selectedFolders.size === 1 ? "" : "s"} selected` : "Tap your own folders to delete them, or open one"}
              </span>
            ) : (
              <span className="text-xs font-medium px-1.5 flex-shrink-0">{selectedKeys.size} selected</span>
            )}
            {(inFolder || searching) && selectableInView.length > 0 && (
              <button type="button" onClick={() => setSelectedKeys(allSelected ? new Set() : new Set(selectableInView.map((i) => i.key)))}
                className="text-xs px-2 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 flex-shrink-0">
                {allSelected ? "None" : "All"}
              </button>
            )}
            <span className="flex-1" />
            {!inFolder && !searching ? (
              <button type="button" disabled={!selectedFolders.size || bulkBusy} onClick={() => setFolderDeleteOpen(true)}
                className="h-8 px-2.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 text-xs flex items-center gap-1 disabled:opacity-40 flex-shrink-0">
                {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
              </button>
            ) : (
              <>
                <button type="button" disabled={!selectedKeys.size || bulkBusy} onClick={() => setMoveOpen(true)}
                  className="h-8 px-2.5 rounded-lg border border-border text-xs flex items-center gap-1 disabled:opacity-40">
                  <FolderInput className="w-3.5 h-3.5" /> Move
                </button>
                <button type="button" disabled={!selectedKeys.size || bulkBusy} onClick={bulkDelete}
                  className="h-8 px-2.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/30 text-xs flex items-center gap-1 disabled:opacity-40">
                  {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
                </button>
              </>
            )}
            <button type="button" onClick={stopSelecting} aria-label="Stop selecting" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}
      {(moveOpen || moveItems) && (
        <MoveDialog count={moveItems ? moveItems.length : selectedKeys.size} folders={userFolderNames}
          onCancel={() => { setMoveOpen(false); setMoveItems(null); }} onMove={runMove} />
      )}
      {preview && <PreviewDialog item={preview} onClose={() => setPreview(null)} onSave={saveItem} />}
      {folderDeleteOpen && (
        <FolderDeleteDialog
          folders={[...selectedFolders].filter(isUser).map((name) => ({ name, count: folderFiles(name).length }))}
          onCancel={() => setFolderDeleteOpen(false)}
          onKeepFiles={() => deleteSelectedFolders("keep")}
          onDeleteAll={() => deleteSelectedFolders("all")}
        />
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
