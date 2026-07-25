import React, { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Upload, Loader2, Trash2, Images, FolderOpen, FolderInput, Link2, Link2Off, ImagePlus, Plus } from "lucide-react";
import { isLocalMode } from "@/lib/storageMode";
import { processUploadedImage, saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import AssetPickerModal from "@/components/shared/AssetPickerModal";

const ROLE_LABEL = { avatar: "avatar", background: "background" };
// Where each role's linked folder name lives on the Alter record. These
// are read by useRotatingImageUrl to decide which pool to draw from.
const ROLE_FOLDER_FIELD = { avatar: "avatar_pool_folder", background: "background_pool_folder" };

function PoolThumb({ item, onDelete, linkedToFolder, folderName }) {
  const resolved = useResolvedAvatarUrl(item.image_url);
  return (
    <div className="relative aspect-square rounded-lg overflow-hidden border border-border/50 bg-muted/30 group">
      {resolved
        ? <img src={resolved} alt={item.name || "pool image"} className="w-full h-full object-cover" loading="lazy" />
        : <span className="w-full h-full flex items-center justify-center text-muted-foreground"><Images className="w-5 h-5" /></span>}
      <button
        type="button"
        onClick={() => onDelete(item)}
        title={linkedToFolder ? `Remove from “${folderName}” folder` : "Remove from pool"}
        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// Manages exactly ONE alter+role image pool.
//
// v0.87.5: pools can now be LINKED TO A FOLDER in the Asset Library. When
// linked, the pool == the folder contents; adding to the folder from
// anywhere in the app auto-syncs into the pool. When unlinked (the
// original behaviour), the pool holds owner-tagged ImageAsset rows
// specific to this alter+role. Every entry point (Add images / Pick from
// library) works in both modes.
export default function AlterImagePoolManager({ open, onClose, alterId, role }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkingOpen, setLinkingOpen] = useState(false);
  const fileRef = useRef(null);
  const roleLabel = ROLE_LABEL[role] || role;

  const { data: alter } = useQuery({
    queryKey: ["alter", alterId],
    queryFn: () => base44.entities.Alter.get(alterId),
    enabled: open && !!alterId,
  });
  const linkedFolder = (alter?.[ROLE_FOLDER_FIELD[role]] || "").trim() || null;

  const queryKey = ["imageAssets", "pool", alterId, role, linkedFolder || "own"];
  const { data: pool = [] } = useQuery({
    queryKey,
    queryFn: () => linkedFolder
      ? base44.entities.ImageAsset.filter({ folder: linkedFolder }, "-created_date")
      : base44.entities.ImageAsset.filter({ owner_alter_id: alterId, owner_role: role }, "-created_date"),
    enabled: open && !!alterId,
  });

  // For the "Link to a folder…" picker: every distinct folder currently
  // in the library, so the user can attach to something that already
  // exists instead of typing.
  const { data: allAssets = [] } = useQuery({
    queryKey: ["imageAssets"],
    queryFn: () => base44.entities.ImageAsset.list("-created_date"),
    enabled: open && linkingOpen,
  });
  const existingFolders = useMemo(() => {
    const s = new Set();
    for (const a of allAssets) { const f = (a.folder || "").trim(); if (f) s.add(f); }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [allAssets]);

  const invalidatePool = () => {
    qc.invalidateQueries({ queryKey: ["imageAssets"] });
    qc.invalidateQueries({ queryKey: ["imageAssets", "pool", alterId, role, "own"] });
    if (linkedFolder) qc.invalidateQueries({ queryKey: ["imageAssets", "pool", alterId, role, linkedFolder] });
    // Rotation resolver reads via its own query key.
    qc.invalidateQueries({ queryKey: ["imageAssets", "pool", alterId, role] });
  };

  // ── Add images ─────────────────────────────────────────────────────────
  // In linked mode → tag files with the folder name so they land in the
  // folder and are picked up by every other pool linked to the same folder.
  // In unlinked mode → tag with owner_alter_id + owner_role like before.
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
          folder: linkedFolder || "",
          is_gif: isGif,
          owner_alter_id: linkedFolder ? null : alterId,
          owner_role: linkedFolder ? null : role,
        });
        added++;
      } catch { /* skip this file, keep going */ }
    }
    invalidatePool();
    setUploading(false);
    if (added) toast.success(`${added} image${added === 1 ? "" : "s"} added to the pool`);
  };

  // ── Pick from Asset Library ────────────────────────────────────────────
  // Two behaviours:
  //   1. Unlinked: create a NEW pool-tagged ImageAsset pointing at the
  //      same image_url as the picked one (share the underlying blob,
  //      no duplicate binary data — just a second reference row).
  //   2. Linked: RETAG the picked ImageAsset with the folder so it
  //      becomes a member of the linked folder (i.e. joins the pool).
  //      This is the auto-sync behaviour the tester asked for.
  const handleLibraryPick = async (url) => {
    setPickerOpen(false);
    if (!url) return;
    try {
      if (linkedFolder) {
        // Find the asset by url and retag its folder.
        const existing = allAssets.find((a) => a.image_url === url);
        if (existing) {
          if ((existing.folder || "").trim() === linkedFolder) {
            toast.info("Already in this pool");
            return;
          }
          await base44.entities.ImageAsset.update(existing.id, { folder: linkedFolder });
          toast.success(`Added to “${linkedFolder}”`);
        } else {
          // Picked an external URL — create a new asset row in the folder.
          await base44.entities.ImageAsset.create({
            name: "Image", image_url: url, folder: linkedFolder, is_gif: false,
          });
          toast.success(`Added to “${linkedFolder}”`);
        }
      } else {
        // Unlinked pool — create a new owner-tagged pool row referencing
        // the same image_url. No blob copy.
        await base44.entities.ImageAsset.create({
          name: "Image", image_url: url, folder: "", is_gif: false,
          owner_alter_id: alterId, owner_role: role,
        });
        toast.success("Added to the pool");
      }
    } catch (e) {
      toast.error(e?.message || "Couldn't add that image");
    }
    invalidatePool();
  };

  // ── Remove from pool ───────────────────────────────────────────────────
  // Linked mode: prefer to keep the underlying asset in the library — just
  // drop the folder tag (so it exits THIS pool without vanishing). If the
  // asset has no other identifying data (a bare folder-only row), fall
  // through to delete.
  // Unlinked mode: delete the owner-tagged row entirely.
  const handleDelete = async (item) => {
    try {
      if (linkedFolder && item.folder === linkedFolder) {
        await base44.entities.ImageAsset.update(item.id, { folder: "" });
      } else {
        await base44.entities.ImageAsset.delete(item.id);
      }
      invalidatePool();
    } catch (e) {
      toast.error(e?.message || "Couldn't remove that image");
    }
  };

  // ── Link / unlink folder ───────────────────────────────────────────────
  const linkTo = async (folderName) => {
    const trimmed = (folderName || "").trim();
    if (!trimmed) return;
    try {
      // Migrate any currently-owned pool items into the folder so the
      // linked view shows them (kept owner tags too for back-reference).
      const owned = await base44.entities.ImageAsset.filter({ owner_alter_id: alterId, owner_role: role });
      for (const a of owned) {
        if ((a.folder || "").trim() !== trimmed) {
          await base44.entities.ImageAsset.update(a.id, { folder: trimmed });
        }
      }
      await base44.entities.Alter.update(alterId, { [ROLE_FOLDER_FIELD[role]]: trimmed });
      qc.invalidateQueries({ queryKey: ["alter", alterId] });
      qc.invalidateQueries({ queryKey: ["alters"] });
      invalidatePool();
      setLinkingOpen(false);
      toast.success(`Pool linked to “${trimmed}”`);
    } catch (e) {
      toast.error(e?.message || "Couldn't link that folder");
    }
  };
  const unlink = async () => {
    try {
      await base44.entities.Alter.update(alterId, { [ROLE_FOLDER_FIELD[role]]: "" });
      qc.invalidateQueries({ queryKey: ["alter", alterId] });
      qc.invalidateQueries({ queryKey: ["alters"] });
      invalidatePool();
      toast.success("Pool unlinked — folder contents stay in the library");
    } catch (e) {
      toast.error(e?.message || "Couldn't unlink");
    }
  };

  if (!open) return null;

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent showCloseButton={false} style={{ zIndex: 110 }} className="max-w-lg p-0 gap-0 flex flex-col overflow-hidden rounded-2xl">
          <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-2">
            <DialogTitle className="font-semibold text-sm flex items-center gap-1.5">
              <Images className="w-4 h-4" /> {roleLabel[0].toUpperCase() + roleLabel.slice(1)} image pool
            </DialogTitle>
            <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>

          <div className="px-4 py-2.5 border-b border-border/50 space-y-2">
            <p className="text-xs text-muted-foreground">
              Add a few images here, then set rotation to Random or Sequential — the {roleLabel} shown will change to one of these each time the app reloads.
            </p>

            {/* Folder link chip */}
            {linkedFolder ? (
              <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1.5">
                <FolderOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="text-xs flex-1 min-w-0 truncate">
                  Linked to <span className="font-medium text-primary">“{linkedFolder}”</span> — anything added to that folder is in this pool.
                </span>
                <button type="button" onClick={unlink} title="Unlink folder" className="text-xs px-2 py-0.5 rounded border border-border/50 hover:bg-muted/50 flex items-center gap-1 flex-shrink-0">
                  <Link2Off className="w-3 h-3" /> Unlink
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setLinkingOpen(true)}
                className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-dashed border-border/60 hover:border-primary/60 hover:bg-primary/5 flex items-center gap-1.5 justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <Link2 className="w-3.5 h-3.5" /> Link to a folder from the Asset Library…
              </button>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="h-8 px-3 flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-60"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Add images
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 text-xs font-medium"
              >
                <ImagePlus className="w-3.5 h-3.5" /> Pick from library
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3" style={{ WebkitOverflowScrolling: "touch" }}>
            {pool.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                {linkedFolder
                  ? <>No images in <span className="font-medium">“{linkedFolder}”</span> yet — add above, or open the library to move existing images into it.</>
                  : "No images in this pool yet — add some above."}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {pool.map((item) => (
                  <PoolThumb key={item.id} item={item} onDelete={handleDelete}
                    linkedToFolder={!!linkedFolder} folderName={linkedFolder} />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AssetPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleLibraryPick} />

      {/* Link-folder chooser */}
      {linkingOpen && (
        <LinkFolderDialog
          existingFolders={existingFolders}
          onCancel={() => setLinkingOpen(false)}
          onPick={linkTo}
          defaultNewName={`${alter?.name || "This " + (roleLabel === "avatar" ? "alter" : "alter")}'s ${roleLabel}s`}
        />
      )}
    </>
  );
}

function LinkFolderDialog({ existingFolders, onCancel, onPick, defaultNewName }) {
  const [newName, setNewName] = useState(defaultNewName);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent showCloseButton={false} style={{ zIndex: 120 }} className="max-w-sm p-0 gap-0 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-2">
          <DialogTitle className="font-semibold text-sm flex items-center gap-1.5">
            <FolderInput className="w-4 h-4" /> Link to a folder
          </DialogTitle>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <p className="text-xs text-muted-foreground">
            The pool will always mirror this folder's contents — adding an image to the folder anywhere in the app adds it to the pool.
          </p>

          {existingFolders.length > 0 && (
            <div className="space-y-1">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">Pick an existing folder</p>
              <div className="rounded-lg border border-border/50 divide-y divide-border/40 overflow-hidden max-h-48 overflow-y-auto">
                {existingFolders.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onPick(f)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 truncate">{f}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">Or create a new one</p>
            <div className="flex items-center gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) onPick(newName.trim()); }}
                placeholder="Folder name"
                className="flex-1 h-8 px-2.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => newName.trim() && onPick(newName.trim())}
                disabled={!newName.trim()}
                className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-60 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Create &amp; link
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
