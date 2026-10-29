// Content-tab editors for the Info and Media widgets (v0.295.0).
//
// Both edit the alter's INFO, not just the widget: an Info widget's entries
// are written to the alter's record (alterInfoEntries.writeEntry), and a
// picture uploaded into a Media widget on a profile becomes one of that
// alter's Pictures. The widget itself only stores what to show and how.

import React, { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, X, Plus, ImagePlus, Loader2, Film } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { StackedRow, Row } from "@/components/shared/SettingRows";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import { DebouncedText } from "@/components/shared/DebouncedFields";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { EntryInput, BioEntry, inputCls, smallBtn } from "@/components/alters/info/entryEditors";
import { useInfoAlter, useSystemFields, DEFAULT_INFO_ENTRIES, ALL_FIELDS_ENTRY, ALL_FIELDS_LABEL } from "@/v2/infoWidgets";
import { infoEntriesFor, entryValue, writeEntry, addOwnEntry, addSharedEntry } from "@/lib/alterInfoEntries";
import { refreshAlter } from "@/lib/alterEntry";
import { mediaItemsOf, parseVideoLink } from "@/lib/mediaItems";
import { uploadAlterImage, largeGifWarning, addAlterPicture } from "@/lib/alterImageUpload";
import { PicturesSection, NewEntryForm, AvatarRows } from "@/components/alters/info/infoSections";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { setAlterFields } from "@/lib/alterEntry";
import { barPictureOverride, setBarPicture } from "@/lib/barPicture";

function MoveRemove({ index, count, onMove, onRemove, label }) {
  return (
    <span className="flex items-center gap-0.5 flex-shrink-0">
      <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} aria-label={`Move ${label} up`}
        className="w-9 h-11 flex items-center justify-center rounded text-muted-foreground disabled:opacity-25"><ChevronUp className="w-4 h-4" /></button>
      <button type="button" onClick={() => onMove(index, 1)} disabled={index === count - 1} aria-label={`Move ${label} down`}
        className="w-9 h-11 flex items-center justify-center rounded text-muted-foreground disabled:opacity-25"><ChevronDown className="w-4 h-4" /></button>
      <button type="button" onClick={() => onRemove(index)} aria-label={`Stop showing ${label}`} title="Stop showing (the info is kept)"
        className="w-11 h-11 flex items-center justify-center rounded text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
    </span>
  );
}

const move = (list, index, dir) => {
  const j = index + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
};

// "Whose info" — on the home screen only; on a profile it's that alter.
function WhoseRow({ settings, set }) {
  const t = useTerms();
  const { onProfile } = useInfoAlter(settings);
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  if (onProfile) return null;
  return (
    <StackedRow label={`Whose info`}>
      <AlterSearchSelect alters={alters.filter((a) => !a.is_archived)} value={settings.alterId || null}
        onChange={(id) => set({ alterId: id || "" })} terms={t} showNone={false} zIndex={120}
        placeholder={`Choose an ${t.alter}…`} />
    </StackedRow>
  );
}

export function InfoEntriesField({ settings, set }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();
  const { alter, alterId } = useInfoAlter(settings);
  const systemFields = useSystemFields();
  const [adding, setAdding] = useState(null);
  const all = useMemo(() => infoEntriesFor(alter, systemFields), [alter, systemFields]);
  const ids = Array.isArray(settings.entries) && settings.entries.length ? settings.entries : DEFAULT_INFO_ENTRIES;
  const allFields = { id: ALL_FIELDS_ENTRY, label: ALL_FIELDS_LABEL, kind: "all" };
  const shown = ids.map((id) => (id === ALL_FIELDS_ENTRY ? allFields : all.find((e) => e.id === id))).filter(Boolean);
  const setIds = (next) => set({ entries: next });

  const commit = async (entryId, value) => {
    try {
      await writeEntry(alterId, entryId, value);
      refreshAlter(qc, alterId);
    } catch (e) { toast.error(e?.message || "Couldn't save that"); }
  };
  // "New field…": makes the entry in the alter's info (theirs alone, or a
  // custom field every alter has) and shows it here.
  const addNew = async () => {
    if (!adding?.name?.trim()) return;
    try {
      const id = adding.scope === "everyone"
        ? await addSharedEntry({ name: adding.name, kind: adding.kind })
        : await addOwnEntry(alterId, { name: adding.name, kind: adding.kind });
      if (adding.scope === "everyone") qc.invalidateQueries({ queryKey: ["customFields"] });
      refreshAlter(qc, alterId);
      setIds([...ids.filter((x) => x !== id), id]);
      setAdding(null);
    } catch (e) { toast.error(e?.message || "Couldn't add that custom field"); }
  };
  const blockedOwn = !!alter?.alter_custom_fields && !Array.isArray(alter.alter_custom_fields);

  return (
    <div className="space-y-1">
      <WhoseRow settings={settings} set={set} />
      {alter && (
        <>
          <p className="text-[0.6875rem] text-muted-foreground pt-1">
            Saved in {formatAlter(alter)}'s info, so it's kept even if this widget is removed.
          </p>
          {shown.map((entry, i) => (
            <div key={entry.id} className="py-2 border-b border-border/30">
              <div className="flex items-center gap-1 min-h-[28px]">
                <span className="text-sm font-medium flex-1 min-w-0 truncate">{entry.label}</span>
                <MoveRemove index={i} count={shown.length} label={entry.label}
                  onMove={(idx, dir) => setIds(move(shown.map((e) => e.id), idx, dir))}
                  onRemove={(idx) => setIds(shown.filter((_, j) => j !== idx).map((e) => e.id))} />
              </div>
              {entry.kind === "all"
                ? <p className="text-xs text-muted-foreground">Every custom field that's filled in and not listed on its own, including ones added later.</p>
                : entry.kind === "bio"
                ? <BioEntry k={`${alterId}`} value={entryValue(alter, "bio")} onChange={(v) => commit("bio", v)} />
                : <EntryInput k={`${alterId}:${entry.id}`} type={entry.kind} label={entry.label}
                    value={entryValue(alter, entry.id)} onCommit={(v) => commit(entry.id, v)} />}
            </div>
          ))}
          <StackedRow label={shown.length ? "Show another field" : "Show a field"}>
            <SearchableSelect value={null} placeholder="Pick what to show…" searchPlaceholder="Search…"
              options={[
                ...(ids.includes(ALL_FIELDS_ENTRY) ? [] : [{ id: ALL_FIELDS_ENTRY, label: `${ALL_FIELDS_LABEL} (custom fields)` }]),
                ...all.filter((e) => !ids.includes(e.id)).map((e) => ({ id: e.id, label: e.label })),
              ]}
              onChange={(id) => { if (id) setIds([...ids, id]); }} />
          </StackedRow>
          {adding ? (
            <NewEntryForm draft={adding} onDraft={setAdding} onAdd={addNew} onCancel={() => setAdding(null)}
              alterName={formatAlter(alter)} blockedOwn={blockedOwn} addLabel="Add and show it" />
          ) : (
            <button type="button" className={`${smallBtn} h-11 mt-2`} onClick={() => setAdding({ name: "", kind: "text", scope: "this" })}>
              <Plus className="w-3.5 h-3.5" /> New field…
            </button>
          )}
        </>
      )}
      {!alter && alterId && <p className="text-xs text-muted-foreground">That {t.alter} isn't here any more.</p>}
    </div>
  );
}

// ── Media ────────────────────────────────────────────────────────────

function ItemThumb({ item }) {
  const src = useResolvedAvatarUrl(item.kind === "image" ? item.src : "");
  return (
    <span className="w-12 h-12 rounded-lg overflow-hidden border border-border/50 bg-muted/30 flex items-center justify-center flex-shrink-0">
      {item.kind === "video" ? <Film className="w-5 h-5 text-muted-foreground" />
        : src ? <img src={src} alt="" className="w-full h-full object-cover" /> : null}
    </span>
  );
}

function OwnedPicture({ asset, onPick }) {
  const src = useResolvedAvatarUrl(asset.image_url);
  return (
    <button type="button" onClick={() => onPick(asset.image_url)} aria-label={`Add ${asset.name || "picture"}`}
      className="aspect-square rounded-lg overflow-hidden border border-border/50 bg-muted/30">
      {src && <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />}
    </button>
  );
}

export function MediaItemsField({ settings, set }) {
  const { alter, alterId, onProfile } = useInfoAlter(settings);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const items = mediaItemsOf(settings);
  const owner = onProfile ? alterId : null;
  const { data: pictures = [] } = useQuery({
    queryKey: ["imageAssets", "owned", alterId],
    queryFn: () => base44.entities.ImageAsset.filter({ owner_alter_id: alterId }, "-created_date"),
    enabled: !!owner,
  });
  const setItems = (next) => set({ items: next });
  const addImage = async (url) => {
    if (!url) return;
    setItems([...items, { src: url, kind: "image", caption: "" }]);
    // Stored in the info too: one of this alter's Pictures (or the library).
    try { await addAlterPicture({ alterId: owner, url }); } catch { /* the widget still shows it */ }
  };
  const upload = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    try {
      const added = [];
      for (const file of files) {
        const out = await uploadAlterImage(file, { alterId: owner, role: "picture", prefix: "picture", maxDim: 1600, quality: 0.85, register: false });
        const warn = largeGifWarning(out);
        if (warn) toast.warning(warn);
        await addAlterPicture({ alterId: owner, url: out.url, name: file.name || "" });
        added.push({ src: out.url, kind: "image", caption: "" });
      }
      setItems([...items, ...added]);
    } catch { toast.error("Couldn't add that picture"); }
    finally { setBusy(false); }
  };
  const addLink = () => {
    const url = link.trim();
    if (!url) return;
    const video = parseVideoLink(url);
    setItems([...items, { src: url, kind: video ? "video" : "image", caption: "" }]);
    setLink("");
  };
  const setCaption = (i, caption) => setItems(items.map((it, j) => (j === i ? { ...it, caption } : it)));

  return (
    <div className="space-y-1">
      {items.map((it, i) => (
        <div key={`${i}:${it.src}`} className="flex items-center gap-2 py-1.5 border-b border-border/30">
          <ItemThumb item={it} />
          <div className="flex-1 min-w-0">
            <DebouncedText value={it.caption} onCommit={(v) => setCaption(i, v)} maxLength={200}
              placeholder="Caption (optional)" ariaLabel={`Caption ${i + 1}`} className={inputCls} />
          </div>
          <MoveRemove index={i} count={items.length} label={`item ${i + 1}`}
            onMove={(idx, dir) => setItems(move(items, idx, dir))}
            onRemove={(idx) => setItems(items.filter((_, j) => j !== idx))} />
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5 pt-2">
        <button type="button" className={smallBtn} onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />} Upload
        </button>
        <AssetButton onPick={addImage} title="From your library" label="From your library" className={smallBtn}
          ownerAlterId={owner} ownerAlterName={alter?.name || ""} />
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={upload} />
      </div>
      <Row label="Link" hint="A picture, GIF or video (YouTube, Vimeo, .mp4)">
        <input value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addLink(); }}
          placeholder="https://…" aria-label="Picture or video link" className={`${inputCls} w-[10rem]`} />
        <button type="button" className={smallBtn} onClick={addLink} disabled={!link.trim()}>Add</button>
      </Row>
      {owner && pictures.length > 0 && (
        <StackedRow label={alter?.name ? `From ${alter.name}'s pictures` : "From their pictures"} hint="Tap one to add it">
          <div className="grid grid-cols-5 gap-1.5">
            {pictures.map((a) => <OwnedPicture key={a.id} asset={a} onPick={(url) => setItems([...items, { src: url, kind: "image", caption: "" }])} />)}
          </div>
        </StackedRow>
      )}
    </div>
  );
}

// "Their Pictures" mode (v0.297.0): the widget shows the alter's Pictures,
// so its Content tab IS their Pictures — the same section as the Alter
// info list.
export function PicturesSourceField({ settings, set }) {
  const qc = useQueryClient();
  const formatAlter = useAlterLabel();
  const { alter, alterId } = useInfoAlter(settings);
  const useAsAvatar = async (url) => {
    try {
      await setAlterFields(alterId, { avatar_url: url });
      refreshAlter(qc, alterId);
    } catch (e) { toast.error(e?.message || "Couldn't save that picture"); }
  };
  return (
    <div>
      <WhoseRow settings={settings} set={set} />
      {alter && (
        <>
          <p className="text-xs text-muted-foreground pt-1">This shows {formatAlter(alter)}'s Pictures. Pictures added here are saved to their info.</p>
          <PicturesSection alter={alter} avatarUrl={alter.avatar_url} onUseAsAvatar={useAsAvatar} />
        </>
      )}
    </div>
  );
}

// "Profile picture" and "Pinned bar picture" (v0.300.0): the widget shows
// that one picture, so its Content tab sets it. The profile picture is the
// alter's avatar (with its rotation); the bar picture is the pinned bar's
// own picture for them, which falls back to the avatar.
export function AlterPictureField({ settings, set }) {
  const t = useTerms();
  const qc = useQueryClient();
  const formatAlter = useAlterLabel();
  const { alter, alterId } = useInfoAlter(settings);
  const { data: settingsRows = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const bar = settings?.source === "bar";
  const write = (fn) => async (v) => {
    try { await fn(v); } catch (e) { toast.error(e?.message || "Couldn't save that picture"); }
  };
  const setAvatar = write(async (patch) => {
    await setAlterFields(alterId, patch);
    refreshAlter(qc, alterId);
  });
  const setBar = write(async (url) => {
    await setBarPicture(alterId, url);
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
  });
  return (
    <div className="space-y-1">
      <WhoseRow settings={settings} set={set} />
      {alter && (bar ? (
        <AvatarRows alter={alter} value={barPictureOverride(settingsRows[0], alter.id)} k={`bar:${alter.id}`} onChange={setBar}
          label="Pinned bar picture" hint={`What the pinned ${t.alters} bar shows for ${formatAlter(alter)}. Without one, it shows the profile picture.`} />
      ) : (
        <AvatarRows alter={alter} value={alter.avatar_url} k={`avatar:${alter.id}`} onChange={(url) => setAvatar({ avatar_url: url })}
          label="Profile picture" rotation={alter.avatar_rotation_mode} onRotation={(m) => setAvatar({ avatar_rotation_mode: m })} />
      ))}
      {!alter && alterId && <p className="text-xs text-muted-foreground">That {t.alter} isn't here any more.</p>}
    </div>
  );
}
