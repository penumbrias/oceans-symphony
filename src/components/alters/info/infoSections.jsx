// The sections of an alter's info (v0.296.0), shared by the Alter info list
// and the profile widgets' Content tabs.
//
// Each section edits the alter through one useAlterInfoForm draft (`info`),
// which saves itself a moment after each change and only writes what
// changed, onto a fresh read. The Alter info list shows every section; a
// profile widget's Content tab shows the section it displays (the Groups
// widget edits groups, the Bio widget the bio…), so editing from either
// place changes the same info.

import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Undo2, Redo2, Check, Loader2, AlertCircle, User, Upload, Link2, X, Plus, ChevronUp, ChevronDown,
  Trash2, Folder, FolderPlus, ImagePlus, Images, MoreHorizontal,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { Row, StackedRow, SwitchRow, ChoiceRow, ColourRow } from "@/components/shared/SettingRows";
import { DebouncedText } from "@/components/shared/DebouncedFields";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import AlterImagePoolManager from "@/components/alters/AlterImagePoolManager";
import AlterPreferencesEditor, { PrefLevelIconsRow } from "@/components/alters/AlterPreferencesEditor";
import GroupPickerModal from "@/components/groups/GroupPickerModal";
import GroupIcon from "@/components/shared/GroupIcon";
import { useAlterGroups } from "@/components/alters/profile/ProfileSections";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PRESET_ANSWER_LABELS } from "@/lib/unblendQuestions";
import { extractYear, createOwnedSubsystem } from "@/lib/alterEntry";
import { uploadAlterImage, largeGifWarning, addAlterPicture, releaseAlterPicture, PICTURE_ROLE } from "@/lib/alterImageUpload";
import {
  FIELD_ORDER_KEY, hiddenEntryIdsOf, setSharedEntryHidden, updateSharedEntry,
} from "@/lib/alterInfoEntries";
import { confirm } from "@/components/shared/ConfirmDialog";
import { TRASH_HINT } from "@/lib/trashSettings";
import { groupNameColor } from "@/lib/contrast";
import { ENTRY_KINDS, KIND_LABEL, EntryInput, BioEntry, inputBase, inputCls, smallBtn } from "./entryEditors";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { AlterPictureFramer, PictureFramingRow } from "@/components/v2/pictureFramingFields";
import { withImageFraming, framedImageStyle, pictureStyle } from "@/lib/imageFraming";

const splitList = (raw) => (typeof raw === "string" ? raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean) : []);

function MoveButtons({ index, count, onMove, label }) {
  return (
    <span className="flex -my-1.5">
      <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move ${label} up`}
        className="w-9 h-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-20">
        <ChevronUp className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => onMove(index, 1)} disabled={index === count - 1} aria-label={`Move ${label} down`}
        className="w-9 h-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-20">
        <ChevronDown className="w-4 h-4" />
      </button>
    </span>
  );
}

// A labelled entry: name (+ kind) on top, the value under it. `menu` is
// the entry's ⋯ actions (rename, hide, delete…); `badge` a short state
// like "Hidden".
export function EntryRow({ name, kind, shared, children, onMove, index, count, onRemove, menu = null, badge = null }) {
  return (
    <div className="py-2 border-b border-border/30 last:border-b-0" data-info-entry={name}>
      <div className="flex items-center gap-1.5 min-h-[28px]">
        {onMove && <MoveButtons index={index} count={count} onMove={onMove} label={name} />}
        <span className="text-sm font-medium flex-1 min-w-0 truncate">{name}</span>
        {badge && <span className="text-[0.625rem] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground flex-shrink-0">{badge}</span>}
        <span className="text-[0.625rem] text-muted-foreground flex-shrink-0">{KIND_LABEL[kind] || "Text"}{shared ? ` · ${shared}` : ""}</span>
        {onRemove && !menu && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} title="Remove"
            className="w-11 h-11 -my-1.5 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive flex-shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        {menu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`More for ${name}`} title="More"
                className="w-11 h-11 -my-1.5 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground flex-shrink-0">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {menu.map((m) => (
                <DropdownMenuItem key={m.label} onClick={m.onClick} className={`min-h-[44px] ${m.destructive ? "text-destructive" : ""}`}>{m.label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {children && <div className="pt-1">{children}</div>}
    </div>
  );
}

// Rename an entry or change its kind, in place of its value.
function EntryEditForm({ draft, onDraft, onSave, onCancel, everyone }) {
  const t = useTerms();
  return (
    <div className="pt-1" data-edit-entry="">
      <StackedRow label="Name">
        <input value={draft.name} onChange={(e) => onDraft({ ...draft, name: e.target.value })} aria-label="Custom field name" autoFocus
          className={inputCls} onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }} />
      </StackedRow>
      <ChoiceRow label="Kind" options={ENTRY_KINDS} value={draft.kind} onChange={(v) => onDraft({ ...draft, kind: v })}
        hint="What's written stays; it's shown the new way." />
      {everyone && <p className="text-xs text-muted-foreground py-1">This changes it for every {t.alter}.</p>}
      <div className="flex justify-end gap-2 py-2">
        <button type="button" className={smallBtn} onClick={onCancel}>Cancel</button>
        <button type="button" className={smallBtn} onClick={onSave} disabled={!draft.name.trim()}><Check className="w-3.5 h-3.5" /> Save</button>
      </div>
    </div>
  );
}

export function StatusChip({ status }) {
  if (status === "draft") return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><AlertCircle className="w-3 h-3" /> Not added yet</span>;
  if (status === "saving") return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</span>;
  if (status === "needs-name") return <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><AlertCircle className="w-3 h-3" /> Saved, except the name: it needs one</span>;
  if (status === "error") return <span className="inline-flex items-center gap-1 text-xs text-destructive"><AlertCircle className="w-3 h-3" /> Not saved</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Check className="w-3 h-3" /> Saved</span>;
}

// ── Pictures: the images this alter owns ─────────────────────────────
function PictureThumb({ asset, isAvatar, onUseAsAvatar, onRelease, onFrame, framing }) {
  const src = useResolvedAvatarUrl(asset.image_url);
  const pool = asset.owner_role && asset.owner_role !== PICTURE_ROLE;
  // The menu is portaled, so a sheet or scrolling list never clips it.
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`${asset.name || "Picture"}${isAvatar ? " (avatar)" : ""}: options`}
          className={`block w-full aspect-square rounded-lg overflow-hidden border bg-muted/30 ${isAvatar || framing ? "border-primary ring-1 ring-primary" : "border-border/50"}`}>
          {src ? <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Images className="w-5 h-5 m-auto text-muted-foreground" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => onUseAsAvatar(asset.image_url)}>Use as avatar</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onFrame(asset.image_url)}>Frame this picture</DropdownMenuItem>
        {pool
          ? <DropdownMenuItem disabled>In the {asset.owner_role} pool</DropdownMenuItem>
          : <DropdownMenuItem onSelect={() => onRelease(asset)}>Remove from Pictures</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PicturesSection({ alter, avatarUrl, onUseAsAvatar }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  // The picture being framed (its URL); the framer saves onto the alter.
  const [framingUrl, setFramingUrl] = useState(null);
  const key = ["imageAssets", "owned", alter.id];
  const { data: pictures = [] } = useQuery({
    queryKey: key,
    queryFn: () => base44.entities.ImageAsset.filter({ owner_alter_id: alter.id }, "-created_date"),
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["imageAssets"] }); };
  const addUrl = async (url) => {
    const res = await addAlterPicture({ alterId: alter.id, url });
    if (res.taken) toast.info("That picture already belongs to another profile's folder.");
    refresh();
  };
  const upload = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        const out = await uploadAlterImage(file, { alterId: alter.id, role: PICTURE_ROLE, prefix: "picture", maxDim: 1600, quality: 0.85, register: false });
        const warn = largeGifWarning(out);
        if (warn) toast.warning(warn);
        await addAlterPicture({ alterId: alter.id, url: out.url, name: file.name || "" });
      }
      refresh();
    } catch { toast.error("Couldn't add that picture"); }
    finally { setBusy(false); }
  };
  const release = async (asset) => {
    await releaseAlterPicture(asset.id);
    refresh();
    toast.success("Removed from Pictures — it's still in your asset library");
  };
  return (
    <div className="space-y-2 py-2">
      {pictures.length > 0 ? (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {pictures.map((a) => (
            <PictureThumb key={a.id} asset={a} isAvatar={!!avatarUrl && a.image_url === avatarUrl} onUseAsAvatar={onUseAsAvatar} onRelease={release}
              onFrame={(url) => setFramingUrl((cur) => (cur === url ? null : url))} framing={framingUrl === a.image_url} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No pictures yet. Pictures added here can be shown by widgets on the profile.</p>
      )}
      {framingUrl && pictures.some((a) => a.image_url === framingUrl) && (
        <div className="rounded-lg border border-border/50 px-2">
          <AlterPictureFramer alter={alter} url={framingUrl} shape="box" label="Framing" always={false}
            open onOpenChange={(v) => { if (!v) setFramingUrl(null); }} />
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={smallBtn} onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} Add pictures
        </button>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <AssetButton onPick={addUrl} title="Add from your asset library"
            className={smallBtn} ownerAlterId={alter.id} ownerAlterName={alter.name || ""} />
          From your library
        </span>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={upload} />
      </div>
    </div>
  );
}

// What's saved, and undo / redo for everything edited through this draft.
// `menu`: rarely needed actions behind ⋯ ([{ label, onClick }]).
export function InfoBar({ info, title, sticky = false, menu = null }) {
  return (
    <div className={`${sticky ? "sticky top-0 z-20 -mx-1 px-1 bg-background/95 backdrop-blur border-b border-border/40 " : ""}py-2 flex items-center gap-2`}>
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-semibold truncate">{title}</p>}
        <StatusChip status={info.status} />
      </div>
      <button type="button" onClick={info.undo} disabled={!info.canUndo} aria-label="Undo" title="Undo"
        className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/60 disabled:opacity-30"><Undo2 className="w-4 h-4" /></button>
      <button type="button" onClick={info.redo} disabled={!info.canRedo} aria-label="Redo" title="Redo"
        className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/60 disabled:opacity-30"><Redo2 className="w-4 h-4" /></button>
      {menu?.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="More" title="More"
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/60"><MoreHorizontal className="w-4 h-4" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {menu.map((m) => <DropdownMenuItem key={m.label} onSelect={m.onClick}>{m.label}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// ── Basics: name, alias, pronouns, colour, avatar, role, first appearance ──
// Preferences & boundaries (how each pronoun set, name or term feels) open
// under Pronouns since v0.310.0 — they are the detail behind that answer.
export function BasicsSection({ alter, info }) {
  const t = useTerms();
  const { form, set, update, revision } = info;
  const [prefsOpen, setPrefsOpen] = useState(false);
  if (!form) return null;
  const k = (id) => `${revision}:${id}`;
  return (
    <>
      <Row label="Name">
        <DebouncedText key={k("name")} value={form.name} onCommit={(v) => set("name", v)} maxLength={120} ariaLabel="Name" className={`${inputBase} w-[12rem]`} />
      </Row>
      <Row label="Alias" hint="Shorthand for @ mentions and - signposts">
        <DebouncedText key={k("alias")} value={form.alias} onCommit={(v) => set("alias", v)} maxLength={60} ariaLabel="Alias" className={`${inputBase} w-[7.5rem]`} />
        <DebouncedText key={k("emoji")} value={form.emoji} onCommit={(v) => set("emoji", v)} maxLength={8} ariaLabel="Emoji" placeholder="😀" className={`${inputBase} w-12 text-center px-1`} />
      </Row>
      {form.emoji && (
        <SwitchRow label="Use the emoji as an alias" hint={`Type @${form.emoji} to mention`} checked={form.use_emoji_as_alias} onChange={(on) => set("use_emoji_as_alias", on)} />
      )}
      <Row label="Pronouns">
        <DebouncedText key={k("pronouns")} value={form.pronouns} onCommit={(v) => set("pronouns", v)} maxLength={80} ariaLabel="Pronouns" placeholder="they/them" className={`${inputBase} w-[12rem]`} />
      </Row>
      <button type="button" onClick={() => setPrefsOpen((o) => !o)} aria-expanded={prefsOpen} data-pronoun-preferences-toggle=""
        className="w-full min-h-[44px] flex items-center gap-2 pl-4 pr-1 text-left text-sm text-muted-foreground hover:text-foreground">
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${prefsOpen ? "" : "-rotate-90"}`} aria-hidden="true" />
        <span className="flex-1">Preferences & boundaries</span>
        {(form.preferences || []).length > 0 && <span className="text-xs tabular-nums">{form.preferences.length}</span>}
      </button>
      {prefsOpen && (
        <div className="pl-4 pb-2 border-l-2 border-border/50 ml-2" data-pronoun-preferences="">
          <PreferencesSection info={info} />
        </div>
      )}
      <ColourRow label="Colour" value={form.color} fallback="#8b5cf6" onChange={(hex) => set("color", hex)} onClear={() => set("color", "")} />
      <AvatarRows alter={alter} value={form.avatar_url} k={k("avatar_url")} onChange={(url) => set("avatar_url", url)}
        framing={alter ? undefined : form.image_framing?.[form.avatar_url]}
        onFraming={alter ? undefined : (f) => set("image_framing", withImageFraming(form.image_framing, form.avatar_url, f))}
        rotation={form.avatar_rotation_mode} onRotation={(m) => set("avatar_rotation_mode", m)} />
      <Row label="Role">
        <DebouncedText key={k("role")} value={form.role} onCommit={(v) => set("role", v)} maxLength={120} ariaLabel="Role" placeholder="Protector, host…" className={`${inputBase} w-[12rem]`} />
      </Row>
      <Row label="First appearance" hint={`Feeds the ${t.Alter} History timeline — a year is enough`}>
        <DebouncedText key={k("birthday")} value={form.birthday || ""} ariaLabel="First appearance" maxLength={60}
          onCommit={(v) => update((f) => ({ ...f, birthday: v, origin_year: extractYear(v) }))}
          placeholder={String(new Date().getFullYear() - 5)} className={`${inputBase} w-[9rem]`} />
      </Row>
    </>
  );
}

const ROTATION_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "random", label: "Random" },
  { value: "sequential", label: "In order" },
];

// A picture with labelled Upload / Library / Link / Remove actions (v0.300.0).
// The Alter info list uses it for the avatar; an Image widget uses it for
// the profile picture and the pinned bar's picture. Pass `rotation` to
// offer the avatar's rotation through a pool of pictures.
export function AvatarRows({ alter, value, onChange, k = "", label = "Avatar", rotation, onRotation, role = "avatar", hint, shape = "circle", framing, onFraming }) {
  const t = useTerms();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [poolOpen, setPoolOpen] = useState(false);
  const preview = useResolvedAvatarUrl(value || "");
  // `alter` may be null for an alter that isn't saved yet (the new-alter
  // sheet): the picture goes into the library and is filed under the alter
  // once they exist; the pool (one alter's) is offered only for a saved one.
  const alterId = alter?.id || null;
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const out = await uploadAlterImage(file, { alterId, role });
      const warn = largeGifWarning(out);
      if (warn) toast.warning(warn);
      onChange(out.url);
    } catch { toast.error("Couldn't use that picture"); }
    finally { setBusy(false); }
  };
  const btn = "inline-flex items-center gap-1.5 h-11 px-3 rounded-lg border border-border/60 text-xs font-medium hover:bg-muted/50";
  return (
    <>
      <StackedRow label={label} hint={hint}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="w-14 h-14 rounded-full overflow-hidden border border-border/60 bg-muted/40 flex items-center justify-center flex-shrink-0">
            {preview ? <img src={preview} alt="" className="w-full h-full object-cover" style={onFraming ? framedImageStyle(framing) : pictureStyle(alter, value)} /> : <User className="w-5 h-5 text-muted-foreground" />}
          </span>
          <button type="button" onClick={() => fileRef.current?.click()} className={btn}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
          </button>
          <AssetButton onPick={onChange} title="Library" label="Library" className={btn}
            allowFolders ownerAlterId={alterId} ownerAlterName={alter?.name || ""} />
          <button type="button" onClick={() => setShowUrl((v) => !v)} aria-expanded={showUrl} className={btn}>
            <Link2 className="w-4 h-4" /> Link
          </button>
          {value && (
            <button type="button" onClick={() => onChange("")} className={`${btn} text-muted-foreground hover:text-destructive`}>
              <X className="w-4 h-4" /> Remove
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={upload} />
        </div>
        {showUrl && (
          <div className="pt-2">
            <DebouncedText key={k} value={value || ""} onCommit={onChange} maxLength={2000} ariaLabel={`${label} link`} placeholder="https://…" className={inputCls} />
          </div>
        )}
      </StackedRow>
      {/* Where the picture sits in its shape — saved on the alter by the
          picture, so it shows this way everywhere (v0.322.0). An alter that
          isn't saved yet (the new-alter sheet) keeps the frame on the draft. */}
      {onFraming
        ? <PictureFramingRow url={value} value={framing} onChange={onFraming} shape={shape} label="Framing" />
        : <AlterPictureFramer alter={alter} url={value} shape={shape} label="Framing" always={false}
            hint={rotation && rotation !== "off" ? "This frames the main picture; each rotating picture is framed in the pool" : undefined} />}
      {onRotation && alterId && (
        <>
          <ChoiceRow label="Rotate through pictures" options={ROTATION_OPTIONS} value={rotation || "off"} onChange={onRotation}
            hint={`Shows a different picture from a pool for this ${t.alter} each time the app opens.`} />
          {(rotation || "off") !== "off" && (
            <Row label="Pictures in the pool">
              <button type="button" onClick={() => setPoolOpen(true)} className={btn}><Images className="w-4 h-4" /> Manage</button>
            </Row>
          )}
          <AlterImagePoolManager open={poolOpen} onClose={() => setPoolOpen(false)} alterId={alterId} role={role} />
        </>
      )}
    </>
  );
}

// ── The bio ──
export function BioSection({ alter = null, info, withRow = true }) {
  const { form, set, revision } = info;
  if (!form) return null;
  const editor = (
    <BioEntry k={revision} value={form.description} onChange={(v) => set("description", v)} />
  );
  return withRow ? <EntryRow name="Bio" kind="richtext">{editor}</EntryRow> : editor;
}

// ── Entries: fields every alter has, then this alter's own ──
export function EntriesSection({ alter, info, bio = true }) {
  const t = useTerms();
  const qc = useQueryClient();
  const { form, update, setCustomField, revision } = info;
  const [adding, setAdding] = useState(null); // { name, kind, scope }
  const [editing, setEditing] = useState(null); // { key, name, kind } — key "field:<id>" or "own:<index>"
  const navigate = useNavigate();
  const { data: systemFields = [] } = useQuery({
    queryKey: ["customFields"],
    queryFn: () => base44.entities.CustomField.list("order"),
  });
  const { data: settingsRows = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const hiddenIds = hiddenEntryIdsOf(pickPrimarySystemSettings(settingsRows));
  const cf = form?.custom_fields || {};
  const fieldOrder = Array.isArray(cf[FIELD_ORDER_KEY]) ? cf[FIELD_ORDER_KEY] : null;
  const orderedFields = useMemo(() => {
    if (!fieldOrder) return systemFields;
    const at = Object.fromEntries(fieldOrder.map((id, i) => [id, i]));
    return [...systemFields].sort((a, b) => (at[a.id] ?? 9999) - (at[b.id] ?? 9999));
  }, [systemFields, fieldOrder]);
  if (!form) return null;
  const k = (id) => `${revision}:${id}`;
  // Values older Get to know me rows kept in an id-keyed map (read-only
  // fallback, exactly as the Info widget and unblendQuestions read it).
  const legacyMap = alter?.alter_custom_fields && typeof alter.alter_custom_fields === "object" && !Array.isArray(alter.alter_custom_fields)
    ? alter.alter_custom_fields : {};
  const ownFields = Array.isArray(form.alter_custom_fields) ? form.alter_custom_fields : null;

  const moveField = (index, dir) => {
    const ids = orderedFields.map((f) => f.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setCustomField(FIELD_ORDER_KEY, ids);
    info.reseed();
  };
  const moveOwn = (index, dir) => {
    update((f) => {
      const list = [...(f.alter_custom_fields || [])];
      const j = index + dir;
      if (j < 0 || j >= list.length) return f;
      [list[index], list[j]] = [list[j], list[index]];
      return { ...f, alter_custom_fields: list };
    });
    info.reseed();
  };
  const setOwnValue = (index, value) => update((f) => {
    const list = [...(f.alter_custom_fields || [])];
    if (!list[index]) return f;
    list[index] = { ...list[index], value };
    return { ...f, alter_custom_fields: list };
  });
  const removeOwn = (index) => {
    const name = ownFields?.[index]?.name || "custom field";
    update((f) => ({ ...f, alter_custom_fields: (f.alter_custom_fields || []).filter((_, i) => i !== index) }));
    info.reseed();
    toast(`Removed “${name}”`, { action: { label: "Undo", onClick: info.undo } });
  };
  const addEntry = async () => {
    const name = (adding?.name || "").trim();
    if (!name) return;
    const kind = adding.kind || "text";
    // Entries are found by name (own:<name>), so two with one name would
    // share a value.
    const taken = adding.scope === "everyone"
      ? systemFields.some((f) => (f.name || "").trim().toLowerCase() === name.toLowerCase())
      : (ownFields || []).some((f) => (f?.name || "").trim().toLowerCase() === name.toLowerCase());
    if (taken) { toast.error(`There's already a custom field called “${name}”`); return; }
    if (adding.scope === "everyone") {
      try {
        const created = await base44.entities.CustomField.create({ name, field_type: kind, order: systemFields.length });
        qc.invalidateQueries({ queryKey: ["customFields"] });
        if (created?.id && fieldOrder) setCustomField(FIELD_ORDER_KEY, [...fieldOrder, created.id]);
      } catch (e) { toast.error(e?.message || "Couldn't add that custom field"); return; }
    } else {
      update((f) => ({ ...f, alter_custom_fields: [...(Array.isArray(f.alter_custom_fields) ? f.alter_custom_fields : []), { name, value: "", field_type: kind }] }));
    }
    setAdding(null);
  };
  const blockedOwn = !ownFields && Object.keys(legacyMap).length > 0;

  // Managing entries (v0.310.0): the same things Settings → Alter setup →
  // Entries can do, without leaving the profile.
  const toggleHidden = async (field) => {
    const hide = !hiddenIds.includes(field.id);
    try {
      await setSharedEntryHidden(field.id, hide);
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
      toast.success(hide ? `“${field.name}” is hidden on profiles; what's written is kept` : `“${field.name}” shows on profiles again`);
    } catch (e) { toast.error(e?.message || "That didn't save"); }
  };
  const deleteShared = async (field) => {
    if (!(await confirm(`Delete the custom field “${field.name}” for every ${t.alter}? It stops showing on profiles. ${TRASH_HINT}`))) return;
    try {
      await base44.entities.CustomField.delete(field.id);
      qc.invalidateQueries({ queryKey: ["customFields"] });
    } catch (e) { toast.error(e?.message || "Couldn't delete it"); }
  };
  const saveEdit = async () => {
    const name = (editing?.name || "").trim();
    if (!name) return;
    if (editing.key.startsWith("field:")) {
      try {
        await updateSharedEntry(editing.key.slice(6), { name, kind: editing.kind });
        qc.invalidateQueries({ queryKey: ["customFields"] });
      } catch (e) { toast.error(e?.message || "That didn't save"); return; }
    } else {
      const index = Number(editing.key.slice(4));
      if ((ownFields || []).some((f, j) => j !== index && (f?.name || "").trim().toLowerCase() === name.toLowerCase())) {
        toast.error(`There's already a custom field called “${name}”`); return;
      }
      update((f) => {
        const list = [...(f.alter_custom_fields || [])];
        if (!list[index]) return f;
        list[index] = { ...list[index], name, field_type: editing.kind };
        return { ...f, alter_custom_fields: list };
      });
      info.reseed();
    }
    setEditing(null);
  };
  const editForm = (key) => editing?.key === key && (
    <EntryEditForm draft={editing} onDraft={setEditing} onSave={saveEdit} onCancel={() => setEditing(null)} everyone={key.startsWith("field:")} />
  );

  return (
    <>
      {bio && <BioSection alter={alter} info={info} />}
      {orderedFields.map((field, i) => {
        const hidden = hiddenIds.includes(field.id);
        return (
          <EntryRow key={field.id} name={field.name} kind={field.field_type || "text"} shared={`every ${t.alter}`}
            index={i} count={orderedFields.length} onMove={moveField} badge={hidden ? "Hidden" : null}
            menu={[
              { label: "Rename or change kind", onClick: () => setEditing({ key: `field:${field.id}`, name: field.name || "", kind: field.field_type || "text" }) },
              { label: hidden ? "Show on profiles" : "Hide on profiles", onClick: () => toggleHidden(field) },
              { label: `Delete for every ${t.alter}…`, onClick: () => deleteShared(field), destructive: true },
            ]}>
            {editForm(`field:${field.id}`) || (
              <EntryInput k={k(field.id)} type={field.field_type || "text"} label={field.name}
                value={cf[field.id] ?? legacyMap[field.id] ?? ""} onCommit={(v) => setCustomField(field.id, v)} />
            )}
          </EntryRow>
        );
      })}
      {(ownFields || []).map((field, i) => (
        <EntryRow key={`own-${i}-${field.name}`} name={field.name || "Untitled"} kind={field.field_type || "text"} shared={`just ${form.name || `this ${t.alter}`}`}
          index={i} count={ownFields.length} onMove={moveOwn}
          menu={[
            { label: "Rename or change kind", onClick: () => setEditing({ key: `own:${i}`, name: field.name || "", kind: field.field_type || "text" }) },
            { label: "Remove", onClick: () => removeOwn(i), destructive: true },
          ]}>
          {editForm(`own:${i}`) || (
            <EntryInput k={k(`own-${i}`)} type={field.field_type || "text"} label={field.name} value={field.value} onCommit={(v) => setOwnValue(i, v)} />
          )}
        </EntryRow>
      ))}
      {adding ? (
        <NewEntryForm draft={adding} onDraft={setAdding} onAdd={addEntry} onCancel={() => setAdding(null)}
          alterName={form.name} blockedOwn={blockedOwn} />
      ) : (
        <div className="flex flex-wrap gap-2 mt-2">
          <button type="button" className={smallBtn} onClick={() => setAdding({ name: "", kind: "text", scope: "this" })}>
            <Plus className="w-3.5 h-3.5" /> Add a custom field
          </button>
          {fieldOrder && (
            <button type="button" className={smallBtn} title={`Use the order Settings sets for every ${t.alter}`}
              onClick={() => { setCustomField(FIELD_ORDER_KEY, undefined); info.reseed(); }}>
              Use the usual order
            </button>
          )}
          <button type="button" className={smallBtn} onClick={() => navigate("/settings#alter-entries")}>
            Custom fields for every {t.alter}…
          </button>
        </div>
      )}
    </>
  );
}

// The "new entry" form (v0.300.0): name, kind, and who has it — just this
// alter (one of their own entries) or every alter (a custom field). The
// Alter info list and the Field widget's options both use it.
export function NewEntryForm({ draft, onDraft, onAdd, onCancel, alterName, blockedOwn = false, addLabel = "Add custom field" }) {
  const t = useTerms();
  const who = alterName || `this ${t.alter}`;
  return (
    <div className="mt-2 pt-1 border-t border-border/50" data-add-entry="">
      <StackedRow label="New custom field's name">
        <input value={draft.name} onChange={(e) => onDraft({ ...draft, name: e.target.value })} placeholder="Like Likes or Backstory"
          aria-label="New custom field's name" autoFocus className={inputCls} onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }} />
      </StackedRow>
      <ChoiceRow label="Kind" options={ENTRY_KINDS} value={draft.kind} onChange={(v) => onDraft({ ...draft, kind: v })} />
      <ChoiceRow label="Who has it" value={draft.scope} onChange={(v) => onDraft({ ...draft, scope: v })}
        hint={draft.scope === "this" && blockedOwn ? `This ${t.alter} has fields from an older version; add it for every ${t.alter} so nothing is written over.` : null}
        options={[
          { value: "this", label: `Just ${who}` },
          { value: "everyone", label: `Every ${t.alter}` },
        ]} />
      <div className="flex justify-end gap-2 py-2">
        <button type="button" className={smallBtn} onClick={onCancel}>Cancel</button>
        <button type="button" onClick={onAdd}
          disabled={!draft.name.trim() || (draft.scope === "this" && blockedOwn)}
          className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40">{addLabel}</button>
      </div>
    </div>
  );
}

// A group as a chip. Opens the group's page unless `link` is false (a
// group that isn't joined yet, in the new-alter sheet).
export function GroupChip({ group, link = true }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={link ? () => navigate(`/group/${group.id}`) : undefined} title={link ? `Open ${group.name}` : undefined}
      disabled={!link}
      className="px-2 py-0.5 rounded-full text-xs font-medium border inline-flex items-center gap-1"
      style={{ borderColor: group.color ? `${group.color}55` : "hsl(var(--border))", color: groupNameColor(group.color) || "hsl(var(--foreground))" }}>
      <GroupIcon group={group} className="w-3 h-3" /> {group.name}
    </button>
  );
}

// ── Groups this alter is in ──
export function GroupsSection({ alter }) {
  const [open, setOpen] = useState(false);
  const { resolvedGroups } = useAlterGroups(alter);
  return (
    <StackedRow label="Groups">
      <div className="flex flex-wrap gap-1.5 items-center">
        {resolvedGroups.map((g) => <GroupChip key={g.id} group={g} />)}
        {resolvedGroups.length === 0 && <span className="text-xs text-muted-foreground">Not in any groups</span>}
        <button type="button" className={smallBtn} onClick={() => setOpen(true)}>Change groups</button>
      </div>
      <GroupPickerModal alter={alter} open={open} onClose={() => setOpen(false)} />
    </StackedRow>
  );
}

// ── Subsystems this alter owns ──
export function SubsystemsSection({ alter, info }) {
  const t = useTerms();
  const qc = useQueryClient();
  const { form, set } = info;
  const [creating, setCreating] = useState(false);
  const { ownedSubsystems } = useAlterGroups(alter);
  const iconPreview = useResolvedAvatarUrl(form?.subsystems_icon || "");
  if (!form) return null;
  const subsystemTerm = `sub${t.system}`;
  const createSub = async () => {
    setCreating(true);
    try {
      const name = `${alter.name}'s ${subsystemTerm}`;
      await createOwnedSubsystem(alter, name);
      qc.invalidateQueries({ queryKey: ["groups"] });
      toast.success(`Created ${name}`);
    } catch (e) { toast.error(e?.message || `Couldn't create the ${subsystemTerm}`); }
    finally { setCreating(false); }
  };
  return (
    <>
      <StackedRow label={`${form.name || t.Alter}'s ${subsystemTerm}s`}>
        <div className="flex flex-wrap gap-1.5 items-center">
          {ownedSubsystems.map((g) => <GroupChip key={g.id} group={g} />)}
          <button type="button" className={smallBtn} onClick={createSub} disabled={creating}>
            <FolderPlus className="w-3.5 h-3.5" /> Create {subsystemTerm}
          </button>
        </div>
      </StackedRow>
      {ownedSubsystems.length > 1 && (
        <Row label={`Icon for the ${subsystemTerm}s chip`}>
          <span className="w-8 h-8 rounded-full overflow-hidden border border-border/50 flex items-center justify-center bg-muted/30">
            {iconPreview ? <img src={iconPreview} alt="" className="w-full h-full object-cover" /> : <Folder className="w-3.5 h-3.5 text-muted-foreground" />}
          </span>
          <AssetButton onPick={(url) => set("subsystems_icon", url)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/60" />
          {form.subsystems_icon && (
            <button type="button" onClick={() => set("subsystems_icon", "")} aria-label="Remove icon" className="w-8 h-8 flex items-center justify-center text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
          )}
        </Row>
      )}
    </>
  );
}

// ── Preferences & boundaries ──
export function PreferencesSection({ info }) {
  const { form, set } = info;
  if (!form) return null;
  return (
    <>
      <p className="text-xs text-muted-foreground py-1">How each pronoun set, name or term feels, from hate to love.</p>
      <AlterPreferencesEditor value={form.preferences || []} onChange={(next) => set("preferences", next)} />
      <PrefLevelIconsRow />
    </>
  );
}

// ── Tags ──
export function TagsSection({ info }) {
  const { form, set } = info;
  const [newTag, setNewTag] = useState("");
  if (!form) return null;
  const addTag = () => {
    const tag = newTag.trim();
    if (!tag) return;
    if (!(form.tags || []).includes(tag)) set("tags", [...(form.tags || []), tag]);
    setNewTag("");
  };
  return (
    <>
      <div className="flex flex-wrap gap-1.5 py-1.5">
        {(form.tags || []).map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-muted/50 border border-border/40">
            {tag}
            <button type="button" onClick={() => set("tags", form.tags.filter((x) => x !== tag))} aria-label={`Remove tag ${tag}`}
              className="-mr-1 p-0.5 rounded-full text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5 pb-1">
        <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTag(); }}
          placeholder="Add a tag" aria-label="New tag" className={`${inputCls} flex-1`} />
        <button type="button" className={smallBtn} onClick={addTag} disabled={!newTag.trim()}><Plus className="w-3.5 h-3.5" /> Add</button>
      </div>
    </>
  );
}

// ── Get to know me answers (answers come from Get to know me; here they
// can be taken out) ──
export function answerRowsOf(form) {
  return Object.entries(form?.preset_answers || {})
    .map(([key, raw]) => ({ key, label: PRESET_ANSWER_LABELS[key] || key.replace(/_/g, " "), values: splitList(raw) }))
    .filter((r) => r.values.length > 0);
}
export function AnswersSection({ info }) {
  const { form, update } = info;
  if (!form) return null;
  const answers = answerRowsOf(form);
  const removeAnswer = (key, value) => update((f) => {
    const next = { ...(f.preset_answers || {}) };
    const left = splitList(next[key]).filter((v) => v !== value);
    if (left.length) next[key] = left.join(", ");
    else delete next[key];
    return { ...f, preset_answers: next };
  });
  if (!answers.length) {
    return <p className="text-xs text-muted-foreground py-1.5">No answers yet. They're added through Get to know me.</p>;
  }
  return answers.map((row) => (
    <StackedRow key={row.key} label={row.label}>
      <div className="flex flex-wrap gap-1.5">
        {row.values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-muted/50 border border-border/40">
            {v}
            <button type="button" onClick={() => removeAnswer(row.key, v)} aria-label={`Remove ${v}`}
              className="-mr-1 p-0.5 rounded-full text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
    </StackedRow>
  ));
}
