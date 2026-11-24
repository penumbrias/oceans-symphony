// Assets in the pixel look — the "Assets" desktop board: folders down the
// left (each {alter}'s 👤 folders gathered under one heading), the open
// folder's files as a grid in the middle (search every folder, kind chips,
// owner, Select, Upload), and the picked file's details on the right (Used
// by, size, folder; Move, Rename, Delete and the rest under ⋯). A status
// line counts what's stored. On a phone the same pieces stack.
//
// Rendering only: every action is AssetsLibrary's own handler, passed in, so
// the delete warnings, trash, backup-skip and filing rules are unchanged.
import React, { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Download, Cloud, CloudOff, Info, Maximize2, Check, Loader2, ArrowLeft, UserPlus2, ArrowUp, ArrowDown, Pencil } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import ImageViewer from "@/components/shared/ImageViewer";
import AssetInfoDialog, { loadAssetDetails } from "@/components/shared/AssetInfoDialog";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useTerms } from "@/lib/useTerms";
import { usePixelDesk } from "@/lib/uiLook";
import { formatBytes, extForMime } from "@/lib/assetFiles";
import { ALTER_FOLDER_PREFIX } from "@/lib/assetFolders";
import { PxPanel, useDeskHeight } from "@/components/pixel/PxDesk";
import "@/styles/pixel/groups.css";

const KINDS = [["all", "All"], ["image", "Image"], ["audio", "Audio"], ["video", "Video"], ["file", "File"]];

function TileFace({ item, big = false }) {
  const isImage = item.kind === "image";
  const src = useResolvedAvatarUrl(isImage || item.kind === "video" ? item.url : null);
  if (isImage && src) return <img src={src} alt="" loading="lazy" />;
  if (item.kind === "video" && src) return <video src={`${src}#t=0.1`} preload="metadata" muted playsInline aria-hidden="true" tabIndex={-1} />;
  const ext = extForMime(item.mime) || (/\.([A-Za-z0-9]{1,6})$/.exec(item.asset?.file_name || "") || [])[1] || "";
  return <span style={big ? { fontSize: 16 } : undefined}>{item.kind === "image" ? "picture" : item.kind}{ext ? ` · ${ext}` : ""}</span>;
}

function FileTile({ item, selected, picked, selecting, dim, showFolder, onClick, onOpen }) {
  return (
    <button type="button" className={`pg-tile${selected ? " sel" : ""}`} onClick={onClick} onDoubleClick={onOpen}
      disabled={dim} aria-pressed={selecting ? picked : selected} aria-label={item.name}
      style={dim ? { opacity: 0.4 } : undefined}>
      <span className="pg-tile-img">
        <TileFace item={item} />
        {item.isGif && <span className="pg-tile-badge">GIF</span>}
        {selecting && !dim && <span className={`pg-tile-tick${picked ? " y" : ""}`}>{picked && <Check className="w-3 h-3" />}</span>}
      </span>
      <span className="pg-tile-name" title={item.name}>{item.name}</span>
      {(showFolder || item.asset?.owner_role || item.role) && (
        <span className="pg-tile-sub">{showFolder ? item.folder : (item.asset?.owner_role || item.role)}</span>
      )}
    </button>
  );
}

function FolderFace({ items }) {
  const cover = items.find((i) => i.url && i.kind === "image")?.url || "";
  const src = useResolvedAvatarUrl(cover || null);
  return src ? <img src={src} alt="" loading="lazy" /> : <span>folder</span>;
}

// The right-hand panel: one file's picture and facts, and what you can do.
function Detail({ item, p }) {
  const [viewing, setViewing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [dims, setDims] = useState(null);
  const src = useResolvedAvatarUrl(item?.kind === "image" ? item.url : null);
  useEffect(() => {
    let alive = true;
    setDims(null);
    if (item && item.kind !== "file") loadAssetDetails(item).then((v) => { if (alive) setDims(v); }).catch(() => {});
    return () => { alive = false; };
  }, [item]);
  if (!item) {
    return (
      <PxPanel as="aside" className="pg-detail" title="Details">
        <p className="pg-empty">Pick a file to see where it's used and what you can do with it.</p>
      </PxPanel>
    );
  }
  const size = dims?.size || item.size;
  const sizeText = [size ? formatBytes(size) : "", dims?.width && dims?.height ? `${dims.width} x ${dims.height}` : ""].filter(Boolean).join(", ");
  const used = p.usedBy(item) || p.usageName(item);
  const skipped = p.isBackupSkipped(item);
  const blocked = p.moveBlockedFor(item);
  const open = () => (item.kind === "image" ? setViewing(true) : p.onView(item));
  return (
    <PxPanel as="aside" className="pg-detail" title={item.name} actions={(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="pg-btn sm" aria-label={`More for ${item.name}`}><MoreHorizontal className="w-4 h-4" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 z-[60]">
            <DropdownMenuItem onSelect={open} className="gap-2 cursor-pointer"><Maximize2 className="w-4 h-4" /> {item.kind === "image" ? "View full screen" : "Open"}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setInfoOpen(true)} className="gap-2 cursor-pointer"><Info className="w-4 h-4" /> All details</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => p.onSave(item)} className="gap-2 cursor-pointer"><Download className="w-4 h-4" /> Save to device</DropdownMenuItem>
            {p.canSkipBackup(item) && (
              <DropdownMenuItem onSelect={() => p.onToggleBackup(item)} className="gap-2 cursor-pointer">
                {skipped ? <Cloud className="w-4 h-4" /> : <CloudOff className="w-4 h-4" />} {skipped ? "Include in backups again" : "Leave out of backups"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
    )}>
      <button type="button" className="pg-detail-img" onClick={open} aria-label={`Open ${item.name}`}>
        {src ? <img src={src} alt="" /> : <TileFace item={item} big />}
      </button>
      <dl className="pg-facts">
        <dt>Used by</dt><dd>{used || "Nothing yet"}</dd>
        {sizeText && <><dt>Size</dt><dd>{sizeText}</dd></>}
        <dt>Folder</dt>
        <dd>
          <button type="button" className="pg-btn sm" onClick={() => p.goFolder(item.folder)}>{item.folder}</button>
        </dd>
        <dt>Backups</dt><dd>{item.refOnly ? "Follows its profile" : skipped ? "Left out" : "Included"}</dd>
      </dl>
      <span className="flex-1" />
      <div className="pg-detail-acts">
        <button type="button" className="pg-btn tall" disabled={!!blocked} title={blocked || undefined} onClick={() => p.onMove(item)}>Move</button>
        <button type="button" className="pg-btn tall" onClick={() => p.onRename(item)}>Rename</button>
        <button type="button" className="pg-btn tall danger" disabled={!!item.refOnly}
          title={item.refOnly ? "In use on a record, not stored in Assets — change it where it's used" : undefined}
          onClick={() => p.onDelete(item)}>Delete</button>
      </div>
      {viewing && <ImageViewer open src={src || item.url} name={item.name} isGif={item.isGif} onClose={() => setViewing(false)} />}
      {infoOpen && <AssetInfoDialog item={item} backupSkipped={skipped} onClose={() => setInfoOpen(false)} />}
    </PxPanel>
  );
}

export default function AssetsPixelDesk(p) {
  const t = useTerms();
  const desk = usePixelDesk();
  const [deskRef, height] = useDeskHeight();
  const [folderQuery, setFolderQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [selKey, setSelKey] = useState(null);
  const [altersOpen, setAltersOpen] = useState(true);

  const { items, byFolder, orderedFolders, openFolder, inFolder, searching, selecting } = p;
  const base = searching ? p.filtered : inFolder ? (byFolder[openFolder] || []) : [];
  const grid = useMemo(() => (kind === "all" ? base : base.filter((i) => i.kind === kind)), [base, kind]);
  const selected = grid.find((i) => i.key === selKey) || items.find((i) => i.key === selKey) || null;
  useEffect(() => { setSelKey(null); }, [openFolder]);
  useEffect(() => {
    if (desk && !selKey && grid.length) setSelKey(grid[0].key);
  }, [desk, selKey, grid]);

  const fq = folderQuery.trim().toLowerCase();
  const shown = orderedFolders.filter((f) => !fq || f.toLowerCase().includes(fq));
  const alterFolders = shown.filter((f) => f.startsWith(ALTER_FOLDER_PREFIX));
  const otherFolders = shown.filter((f) => !f.startsWith(ALTER_FOLDER_PREFIX));
  const kindFolderEnd = otherFolders.findIndex((f) => !p.isUser(f));
  const alterTotal = alterFolders.reduce((n, f) => n + (byFolder[f] || []).length, 0);
  const totalBytes = items.reduce((n, i) => n + (i.refOnly ? 0 : (i.size || 0)), 0);
  const storedCount = items.filter((i) => !i.refOnly).length;

  const folderRow = (name, kid = false) => {
    const pickable = selecting && p.isUser(name);
    const label = kid ? name.slice(ALTER_FOLDER_PREFIX.length) : name;
    return (
      <button key={name} type="button"
        className={`pg-arow${kid ? " kid" : ""}${openFolder === name && !searching ? " sel" : ""}${pickable && p.selectedFolders.has(name) ? " picked" : ""}`}
        onClick={() => (pickable ? p.toggleFolderSelect(name) : (p.goFolder(name), p.clearPicks()))}
        aria-current={openFolder === name ? "true" : undefined}>
        <span className="pg-row-name">{label}</span>
        {p.folderSkipped(name) && <span className="pg-row-tag" title="Left out of backups">skip</span>}
        <span className="pg-row-num">{(byFolder[name] || []).length}</span>
      </button>
    );
  };

  const folderMenu = inFolder && (p.isUser(openFolder) || p.folderHasBackupKeys(openFolder)) && !selecting && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="pg-btn sm" aria-label={`Folder actions for ${openFolder}`}><MoreHorizontal className="w-3.5 h-3.5" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 z-[60]">
        {p.isUser(openFolder) && <>
          <DropdownMenuItem onSelect={() => p.openOwners(openFolder)} className="gap-2 cursor-pointer"><UserPlus2 className="w-4 h-4" /> {p.ownerIds.length ? "Change owners" : "Assign owner"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => p.renameFolder(openFolder)} className="gap-2 cursor-pointer"><Pencil className="w-4 h-4" /> Rename folder</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => p.moveFolder(openFolder, -1)} className="gap-2 cursor-pointer"><ArrowUp className="w-4 h-4" /> Move folder up</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => p.moveFolder(openFolder, 1)} className="gap-2 cursor-pointer"><ArrowDown className="w-4 h-4" /> Move folder down</DropdownMenuItem>
        </>}
        {p.folderHasBackupKeys(openFolder) && <>
          {p.isUser(openFolder) && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => p.setFolderBackupSkip(byFolder[openFolder] || [], !p.folderSkipped(openFolder))} className="gap-2 cursor-pointer">
            {p.folderSkipped(openFolder) ? <Cloud className="w-4 h-4" /> : <CloudOff className="w-4 h-4" />}
            {p.folderSkipped(openFolder) ? "Include this folder in backups" : "Leave this folder out of backups"}
          </DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const crumb = searching ? `Search: “${p.search.trim()}”`
    : inFolder ? (openFolder.startsWith(ALTER_FOLDER_PREFIX) ? `${t.Alters} / ${openFolder.slice(ALTER_FOLDER_PREFIX.length)}` : openFolder)
      : "All folders";

  const side = (
    <PxPanel as="aside" className="pg-side" title="Folders"
      actions={<button type="button" className="pg-ttl-link" onClick={p.createFolder}>+ folder</button>}>
      <div className="pg-pad">
        <label className="pg-input">
          <input value={folderQuery} onChange={(e) => setFolderQuery(e.target.value)} placeholder="Search folders…" aria-label="Search folders" />
        </label>
      </div>
      <div className="pg-list" style={{ padding: "0 0 6px" }}>
        <button type="button" className={`pg-arow${!inFolder && !searching ? " sel" : ""}`} onClick={() => { p.goFolder(null); p.clearPicks(); }}>
          <span className="pg-row-name">All folders</span>
          <span className="pg-row-num">{orderedFolders.length}</span>
        </button>
        {(kindFolderEnd === -1 ? otherFolders : otherFolders.slice(0, kindFolderEnd)).map((f) => folderRow(f))}
        {alterFolders.length > 0 && (
          <>
            <button type="button" className="pg-arow" onClick={() => setAltersOpen((v) => !v)} aria-expanded={altersOpen}>
              <span className="pg-row-name">{t.Alters}</span>
              <span className="pg-row-num">{alterTotal}</span>
            </button>
            {altersOpen && alterFolders.map((f) => folderRow(f, true))}
          </>
        )}
        {kindFolderEnd !== -1 && otherFolders.slice(kindFolderEnd).map((f) => folderRow(f))}
        {shown.length === 0 && <p className="pg-empty">{fq ? "No folders match." : "No folders yet."}</p>}
      </div>
      <button type="button" className="pg-foot text-left" onClick={() => p.setOrgOpen((v) => !v)} aria-expanded={p.orgOpen}>
        <b>Auto-organisation</b>
        New pictures file themselves by owner and kind. Reset to defaults any time.
      </button>
    </PxPanel>
  );

  const toolbar = (
    <div className="pg-toolbar">
      <label className="pg-input">
        <input value={p.search} onChange={(e) => p.setSearch(e.target.value)} placeholder="Search every folder…" aria-label="Search every folder" />
      </label>
      <div className="pg-chips" role="group" aria-label="Kind">
        {KINDS.map(([id, label]) => (
          <button key={id} type="button" className={`pg-chip${kind === id ? " on" : ""}`} aria-pressed={kind === id} onClick={() => setKind(id)}>{label}</button>
        ))}
      </div>
      <span className="flex-1" />
      {p.ownersOn && !inFolder && !searching && (
        <span className="inline-flex items-center gap-2" style={{ minWidth: 180 }}>
          <span className="pg-count">Owner</span>
          <span className="flex-1 min-w-0">
            <AlterSearchSelect alters={p.alters.filter((a) => !a.is_archived)} value={p.ownerFilter === "all" ? null : p.ownerFilter}
              onChange={(id) => p.setOwnerFilter(id || "all")} terms={t}
              placeholder="All owners" noneLabel="All owners" frontingFirst={false} />
          </span>
        </span>
      )}
      {!p.openUser && !selecting && (
        <label className="pg-input" style={{ flex: "0 1 170px" }} title="Uploads go into this folder (optional)">
          <input value={p.uploadFolder} onChange={(e) => p.setUploadFolder(e.target.value)} placeholder="Upload into folder…" aria-label="Upload into folder (optional)" />
        </label>
      )}
    </div>
  );

  const body = p.loading ? (
    <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin" /></div>
  ) : (inFolder || searching) ? (
    grid.length === 0 ? (
      <p className="pg-empty">{searching ? "Nothing matches." : kind !== "all" ? "Nothing of that kind here." : "Empty — upload into this folder, or move items here."}</p>
    ) : (
      <>
        <div className="pg-tiles">
          {grid.slice(0, p.limit).map((item) => (
            <FileTile key={item.key} item={item} showFolder={searching}
              selecting={selecting} picked={p.selectedKeys.has(item.key)} dim={selecting && !!item.refOnly}
              selected={!selecting && selected?.key === item.key}
              onClick={() => (selecting ? p.toggleSelect(item) : setSelKey(item.key))}
              onOpen={() => { if (!selecting && item.kind !== "image") p.onView(item); }} />
          ))}
        </div>
        {grid.length > p.limit && (
          <button type="button" className="pg-btn pg-more" onClick={() => p.showMore(p.page)}>
            Show {Math.min(p.page, grid.length - p.limit)} more ({grid.length - p.limit} left)
          </button>
        )}
      </>
    )
  ) : orderedFolders.length === 0 ? (
    <p className="pg-empty">{items.length === 0 ? "Nothing stored yet — upload some, or add avatars and backgrounds anywhere in the app." : "No folders for that owner."}</p>
  ) : (
    <div className="pg-tiles">
      {orderedFolders.map((f) => {
        const pickable = selecting && p.isUser(f);
        return (
          <button key={f} type="button" className={`pg-tile${pickable && p.selectedFolders.has(f) ? " sel" : ""}`}
            style={selecting && !pickable ? { opacity: 0.5 } : undefined}
            aria-pressed={pickable ? p.selectedFolders.has(f) : undefined}
            onClick={() => (pickable ? p.toggleFolderSelect(f) : (p.goFolder(f), p.clearPicks()))}>
            <span className="pg-tile-img"><FolderFace items={byFolder[f] || []} /></span>
            <span className="pg-tile-name">{f}</span>
            <span className="pg-tile-sub">{(byFolder[f] || []).length} items</span>
          </button>
        );
      })}
    </div>
  );

  const main = (
    <PxPanel className="pg-main" title={crumb}
      actions={<>
        {folderMenu}
        <button type="button" className="pg-btn sm" aria-pressed={selecting} onClick={() => (selecting ? p.stopSelecting() : p.startSelecting())}>{selecting ? "Done" : "Select"}</button>
        <button type="button" className="pg-btn sm on" onClick={p.onUpload} disabled={p.uploading}>
          {p.uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Upload
        </button>
      </>}>
      {toolbar}
      {p.orgOpen && !selecting && <div className="pg-org pg-sunk">{p.orgBody}</div>}
      <div className="pg-body" style={{ padding: 0 }}>{body}</div>
      <div className="pg-status">
        <span>{storedCount} {storedCount === 1 ? "file" : "files"}{totalBytes ? ` · ${formatBytes(totalBytes)} on this device` : ""}</span>
        <span>Folders marked “skip” are left out of backups</span>
      </div>
    </PxPanel>
  );

  if (!desk) {
    return (
      <div className="pg-phone pb-24" data-tour="assets-library">
        {(inFolder || searching) && (
          <button type="button" className="pg-back" onClick={() => { p.setSearch(""); p.goFolder(null); p.clearPicks(); }}>
            <ArrowLeft className="w-4 h-4" /> All folders
          </button>
        )}
        {!inFolder && !searching && side}
        {main}
        {(inFolder || searching) && selected && !selecting && <Detail item={selected} p={p} />}
        {p.children}
      </div>
    );
  }

  return (
    <div className="pb-2" data-tour="assets-library">
      <div ref={deskRef} className="pg-desk assets" style={height ? { height } : undefined}>
        {side}
        {main}
        <Detail item={(inFolder || searching) ? selected : null} p={p} />
      </div>
      {p.children}
    </div>
  );
}
