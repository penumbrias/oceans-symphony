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
  Trash2, Folder, FolderPlus, ImagePlus, Images,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { Row, StackedRow, SwitchRow, Segmented, Chips, ColourRow } from "@/components/shared/SettingRows";
import { DebouncedText } from "@/components/shared/DebouncedFields";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import RotationModeControl from "@/components/shared/RotationModeControl";
import AlterImagePoolManager from "@/components/alters/AlterImagePoolManager";
import AlterPreferencesEditor from "@/components/alters/AlterPreferencesEditor";
import GroupPickerModal from "@/components/groups/GroupPickerModal";
import GroupIcon from "@/components/shared/GroupIcon";
import { useAlterGroups } from "@/components/alters/profile/ProfileSections";
import { PRESET_ANSWER_LABELS } from "@/lib/unblendQuestions";
import { extractYear, createOwnedSubsystem } from "@/lib/alterEntry";
import { uploadAlterImage, largeGifWarning, addAlterPicture, releaseAlterPicture, PICTURE_ROLE } from "@/lib/alterImageUpload";
import { FIELD_ORDER_KEY } from "@/lib/alterInfoEntries";
import { groupNameColor } from "@/lib/contrast";
import { ENTRY_KINDS, KIND_LABEL, EntryInput, BioEntry, inputBase, inputCls, smallBtn } from "./entryEditors";

const splitList = (raw) => (typeof raw === "string" ? raw.split(/[,;|]/).map((s) => s.trim()).filter(Boolean) : []);

function MoveButtons({ index, count, onMove, label }) {
  return (
    <span className="flex flex-col">
      <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move ${label} up`}
        className="w-6 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20">
        <ChevronUp className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={() => onMove(index, 1)} disabled={index === count - 1} aria-label={`Move ${label} down`}
        className="w-6 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20">
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

// A labelled entry: name (+ kind) on top, the value under it.
export function EntryRow({ name, kind, shared, children, onMove, index, count, onRemove }) {
  return (
    <div className="py-2 border-b border-border/30 last:border-b-0" data-info-entry={name}>
      <div className="flex items-center gap-1.5 min-h-[28px]">
        {onMove && <MoveButtons index={index} count={count} onMove={onMove} label={name} />}
        <span className="text-sm font-medium flex-1 min-w-0 truncate">{name}</span>
        <span className="text-[0.625rem] text-muted-foreground flex-shrink-0">{KIND_LABEL[kind] || "Text"}{shared ? ` · ${shared}` : ""}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} title="Remove"
            className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive flex-shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="pt-1">{children}</div>
    </div>
  );
}

export function StatusChip({ status }) {
  if (status === "saving") return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</span>;
  if (status === "needs-name") return <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><AlertCircle className="w-3 h-3" /> Needs a name to save</span>;
  if (status === "error") return <span className="inline-flex items-center gap-1 text-xs text-destructive"><AlertCircle className="w-3 h-3" /> Not saved</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Check className="w-3 h-3" /> Saved</span>;
}

// ── Pictures: the images this alter owns ─────────────────────────────
function PictureThumb({ asset, isAvatar, onUseAsAvatar, onRelease }) {
  const src = useResolvedAvatarUrl(asset.image_url);
  const [open, setOpen] = useState(false);
  const pool = asset.owner_role && asset.owner_role !== PICTURE_ROLE;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={asset.name || "Picture"}
        className={`block w-full aspect-square rounded-lg overflow-hidden border bg-muted/30 ${isAvatar ? "border-primary ring-1 ring-primary" : "border-border/50"}`}>
        {src ? <img src={src} alt={asset.name || ""} className="w-full h-full object-cover" loading="lazy" /> : <Images className="w-5 h-5 m-auto text-muted-foreground" />}
      </button>
      {open && (
        <div className="absolute z-10 top-full mt-1 left-0 min-w-[10rem] rounded-lg border border-border bg-popover shadow-lg p-1 text-xs">
          <button type="button" className="w-full text-left px-2 py-1.5 rounded hover:bg-muted" onClick={() => { setOpen(false); onUseAsAvatar(asset.image_url); }}>Use as avatar</button>
          {pool
            ? <p className="px-2 py-1.5 text-muted-foreground">In the {asset.owner_role} pool</p>
            : <button type="button" className="w-full text-left px-2 py-1.5 rounded hover:bg-muted" onClick={() => { setOpen(false); onRelease(asset); }}>Remove from Pictures</button>}
        </div>
      )}
    </div>
  );
}

export function PicturesSection({ alter, avatarUrl, onUseAsAvatar }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
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
            <PictureThumb key={a.id} asset={a} isAvatar={!!avatarUrl && a.image_url === avatarUrl} onUseAsAvatar={onUseAsAvatar} onRelease={release} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No pictures yet. Pictures added here can be shown by widgets on the profile.</p>
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
export function InfoBar({ info, title, sticky = false }) {
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
    </div>
  );
}

// ── Basics: name, alias, pronouns, colour, avatar, role, first appearance ──
export function BasicsSection({ alter, info }) {
  const t = useTerms();
  const { form, set, update, revision } = info;
  const avatarFileRef = useRef(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [showAvatarUrl, setShowAvatarUrl] = useState(false);
  const [poolOpen, setPoolOpen] = useState(false);
  const avatarPreview = useResolvedAvatarUrl(form?.avatar_url || "");
  if (!form) return null;
  const k = (id) => `${revision}:${id}`;
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    try {
      const out = await uploadAlterImage(file, { alterId: alter.id, role: "avatar" });
      const warn = largeGifWarning(out);
      if (warn) toast.warning(warn);
      set("avatar_url", out.url);
    } catch { toast.error("Couldn't use that picture"); }
    finally { setAvatarBusy(false); }
  };
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
      <ColourRow label="Colour" value={form.color} fallback="#8b5cf6" onChange={(hex) => set("color", hex)} onClear={() => set("color", "")} />
      <Row label="Avatar" align="start">
        <div className="flex items-center gap-1.5">
          <span className="w-12 h-12 rounded-full overflow-hidden border border-border/60 bg-muted/40 flex items-center justify-center flex-shrink-0">
            {avatarPreview ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-muted-foreground" />}
          </span>
          <button type="button" onClick={() => avatarFileRef.current?.click()} aria-label="Upload avatar" title="Upload"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/60">{avatarBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}</button>
          <AssetButton onPick={(url) => set("avatar_url", url)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/60"
            allowFolders ownerAlterId={alter.id} ownerAlterName={alter.name || ""} />
          <button type="button" onClick={() => setShowAvatarUrl((s) => !s)} aria-label="Avatar link" title="Link"
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/60"><Link2 className="w-3.5 h-3.5" /></button>
          {form.avatar_url && (
            <button type="button" onClick={() => set("avatar_url", "")} aria-label="Remove avatar" title="Remove"
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
          )}
          <input ref={avatarFileRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
        </div>
      </Row>
      {showAvatarUrl && (
        <DebouncedText key={k("avatar_url")} value={form.avatar_url} onCommit={(v) => set("avatar_url", v)} maxLength={2000} ariaLabel="Avatar link" placeholder="https://…" className={inputCls} />
      )}
      <div className="py-1.5 border-b border-border/30">
        <RotationModeControl mode={form.avatar_rotation_mode} onChange={(m) => set("avatar_rotation_mode", m)} showManage onManagePool={() => setPoolOpen(true)}
          label="Avatar rotation" hint={`When on, the avatar cycles through a pool of pictures for this ${t.alter}.`} />
      </div>
      <Row label="Role">
        <DebouncedText key={k("role")} value={form.role} onCommit={(v) => set("role", v)} maxLength={120} ariaLabel="Role" placeholder="Protector, host…" className={`${inputBase} w-[12rem]`} />
      </Row>
      <Row label="First appearance" hint={`Feeds the ${t.Alter} History timeline — a year is enough`}>
        <DebouncedText key={k("birthday")} value={form.birthday || ""} ariaLabel="First appearance" maxLength={60}
          onCommit={(v) => update((f) => ({ ...f, birthday: v, origin_year: extractYear(v) }))}
          placeholder={String(new Date().getFullYear() - 5)} className={`${inputBase} w-[9rem]`} />
      </Row>
      <AlterImagePoolManager open={poolOpen} onClose={() => setPoolOpen(false)} alterId={alter.id} role="avatar" />
    </>
  );
}

// ── The bio ──
export function BioSection({ info, withRow = true }) {
  const { form, set, revision } = info;
  if (!form) return null;
  const editor = <BioEntry k={revision} value={form.description} onChange={(v) => set("description", v)} />;
  return withRow ? <EntryRow name="Bio" kind="richtext">{editor}</EntryRow> : editor;
}

// ── Entries: fields every alter has, then this alter's own ──
export function EntriesSection({ alter, info, bio = true }) {
  const t = useTerms();
  const qc = useQueryClient();
  const { form, update, setCustomField, revision } = info;
  const [adding, setAdding] = useState(null); // { name, kind, scope }
  const { data: systemFields = [] } = useQuery({
    queryKey: ["customFields"],
    queryFn: () => base44.entities.CustomField.list("order"),
  });
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
    const name = ownFields?.[index]?.name || "entry";
    update((f) => ({ ...f, alter_custom_fields: (f.alter_custom_fields || []).filter((_, i) => i !== index) }));
    info.reseed();
    toast(`Removed “${name}”`, { action: { label: "Undo", onClick: info.undo } });
  };
  const addEntry = async () => {
    const name = (adding?.name || "").trim();
    if (!name) return;
    const kind = adding.kind || "text";
    if (adding.scope === "everyone") {
      try {
        const created = await base44.entities.CustomField.create({ name, field_type: kind, order: systemFields.length });
        qc.invalidateQueries({ queryKey: ["customFields"] });
        if (created?.id && fieldOrder) setCustomField(FIELD_ORDER_KEY, [...fieldOrder, created.id]);
      } catch (e) { toast.error(e?.message || "Couldn't add that entry"); return; }
    } else {
      update((f) => ({ ...f, alter_custom_fields: [...(Array.isArray(f.alter_custom_fields) ? f.alter_custom_fields : []), { name, value: "", field_type: kind }] }));
    }
    setAdding(null);
  };
  const blockedOwn = !ownFields && Object.keys(legacyMap).length > 0;

  return (
    <>
      {bio && <BioSection info={info} />}
      {orderedFields.map((field, i) => (
        <EntryRow key={field.id} name={field.name} kind={field.field_type || "text"} shared={`every ${t.alter}`}
          index={i} count={orderedFields.length} onMove={moveField}>
          <EntryInput k={k(field.id)} type={field.field_type || "text"} label={field.name}
            value={cf[field.id] ?? legacyMap[field.id] ?? ""} onCommit={(v) => setCustomField(field.id, v)} />
        </EntryRow>
      ))}
      {(ownFields || []).map((field, i) => (
        <EntryRow key={`own-${i}-${field.name}`} name={field.name || "Untitled"} kind={field.field_type || "text"} shared={`just ${form.name || `this ${t.alter}`}`}
          index={i} count={ownFields.length} onMove={moveOwn} onRemove={() => removeOwn(i)}>
          <EntryInput k={k(`own-${i}`)} type={field.field_type || "text"} label={field.name} value={field.value} onCommit={(v) => setOwnValue(i, v)} />
        </EntryRow>
      ))}
      {adding ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 my-2 space-y-2">
          <input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} placeholder="Entry name, like Likes or Backstory"
            aria-label="Entry name" autoFocus className={inputCls} onKeyDown={(e) => { if (e.key === "Enter") addEntry(); }} />
          <Chips label="Kind" options={ENTRY_KINDS} value={adding.kind} onChange={(v) => setAdding({ ...adding, kind: v })} />
          <Segmented label="Who has it" value={adding.scope} onChange={(v) => setAdding({ ...adding, scope: v })}
            options={[
              { value: "this", label: `Just ${form.name || `this ${t.alter}`}` },
              { value: "everyone", label: `Every ${t.alter}` },
            ]} />
          {adding.scope === "this" && blockedOwn && (
            <p className="text-[0.6875rem] text-muted-foreground">This {t.alter} has fields from an older version; add it for every {t.alter} instead so nothing is written over.</p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className={smallBtn} onClick={() => setAdding(null)}>Cancel</button>
            <button type="button" onClick={addEntry}
              disabled={!adding.name.trim() || (adding.scope === "this" && blockedOwn)}
              className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40">Add entry</button>
          </div>
        </div>
      ) : (
        <button type="button" className={`${smallBtn} mt-2`} onClick={() => setAdding({ name: "", kind: "text", scope: "this" })}>
          <Plus className="w-3.5 h-3.5" /> Add an entry
        </button>
      )}
    </>
  );
}

function GroupChip({ group }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(`/group/${group.id}`)} title={`Open ${group.name}`}
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
