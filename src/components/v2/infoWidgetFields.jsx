// Content-tab editors for the Info and Media widgets (v0.295.0).
//
// Both edit the alter's INFO, not just the widget: an Info widget's entries
// are written to the alter's record (alterInfoEntries.writeEntry), and a
// picture uploaded into a Media widget on a profile becomes one of that
// alter's Pictures. The widget itself only stores what to show and how.

import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, X, Plus, ImagePlus, Loader2, Film, Crop } from "lucide-react";
import ImageFramer from "@/components/shared/ImageFramer";
import { AlterPictureFramer } from "@/components/v2/pictureFramingFields";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { StackedRow, Row, ChoiceRow } from "@/components/shared/SettingRows";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import { DebouncedText } from "@/components/shared/DebouncedFields";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { EntryInput, BioEntry, inputCls, smallBtn } from "@/components/alters/info/entryEditors";
import { useInfoAlter, useInfoRecord, DEFAULT_INFO_ENTRIES, ALL_FIELDS_ENTRY, ALL_FIELDS_LABEL } from "@/v2/infoWidgets";
import { useBoardSubject } from "@/lib/boardSubject";
import { WhoseRow as RecordWhoseRow } from "@/components/v2/WhosePicker";
import GroupSelect from "@/components/groups/GroupSelect";
import { standardPagesFor } from "@/lib/infoPages";
import { addOwnEntry, addSharedEntry } from "@/lib/alterInfoEntries";
import { refreshAlter } from "@/lib/alterEntry";
import { mediaItemsOf, parseVideoLink } from "@/lib/mediaItems";
import { uploadAlterImage, largeGifWarning, addAlterPicture } from "@/lib/alterImageUpload";
import { PicturesSection, NewEntryForm, AvatarRows } from "@/components/alters/info/infoSections";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { setAlterFields } from "@/lib/alterEntry";
import { barPictureOverride, setBarPicture } from "@/lib/barPicture";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

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

// "Whose info" (v0.322.0): on a profile, that profile, another {{alter}}
// or a group; on the home screen an {{alter}} or a group.
function WhoseRow({ settings, set, info }) {
  const t = useTerms();
  const subject = useBoardSubject();
  const onProfileBoard = subject?.type === "alter" || subject?.type === "group";
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(), enabled: info.source === "alter" });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list(), enabled: info.source === "group" });
  const options = [
    ...(onProfileBoard ? [{ value: "profile", label: subject.type === "group" ? "This group" : `This ${t.alter}` }] : []),
    { value: "alter", label: onProfileBoard ? `Another ${t.alter}` : `An ${t.alter}` },
    { value: "group", label: "A group" },
  ];
  return (
    <>
      <ChoiceRow label="Whose info" options={options} value={info.source}
        onChange={(v) => { if (v !== info.source) set({ source: v, entries: DEFAULT_INFO_ENTRIES }); }} />
      {info.source === "alter" && (
        <StackedRow label={t.Alter}>
          <AlterSearchSelect alters={alters.filter((a) => !a.is_archived)} value={settings.alterId || null}
            onChange={(id) => set({ alterId: id || "" })} terms={t} showNone={false} zIndex={120}
            placeholder={`Choose an ${t.alter}…`} />
        </StackedRow>
      )}
      {info.source === "group" && (
        <StackedRow label="Group">
          <GroupSelect groups={groups} value={settings.groupId || ""} onChange={(id) => set({ groupId: id || "" })}
            placeholder="Choose a group…" zIndex={120} />
        </StackedRow>
      )}
    </>
  );
}

// Whose pictures an Image widget shows: on an {{alter}}'s profile "This
// {{alter}}" or another one; anywhere else, the {{alter}} picked here.
// (v0.328.1 — this used to borrow the Field widget's row above, which needs
// its info and crashed the options, and with them the whole profile.)
function AlterWhoseRow({ settings, set }) {
  const subject = useBoardSubject();
  return <RecordWhoseRow type="alter" settings={settings} set={set} ownProfile={subject?.type === "alter" && !subject.linked} />;
}

// "Add a page" (v0.322.0): the standard pages for an alter or a group, or a
// blank one with any name. Each is a long-text entry in their info, shown
// here as a page (the widget switches to Pages).
function AddPageRow({ info, ids, onAdded }) {
  const [naming, setNaming] = useState(null);
  const shownLabels = new Set(info.entries.filter((e) => ids.includes(e.id)).map((e) => e.label.trim().toLowerCase()));
  const ready = standardPagesFor(info.type).filter((n) => !shownLabels.has(n.toLowerCase()));
  const add = async (name) => {
    const clean = String(name || "").trim();
    if (!clean) return;
    try {
      const id = await info.addPage(clean);
      if (id) onAdded(id);
      setNaming(null);
    } catch (e) { toast.error(e?.message || "Couldn't add that page"); }
  };
  return (
    <StackedRow label="Add a page" hint="Each page is saved in their info and shows as a tab you can swipe to.">
      <div className="flex flex-wrap gap-1.5">
        {ready.map((name) => (
          <button key={name} type="button" onClick={() => add(name)}
            className="text-xs px-3 min-h-[44px] rounded-full border border-border/50 text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> {name}
          </button>
        ))}
        {naming === null && (
          <button type="button" onClick={() => setNaming("")}
            className="text-xs px-3 min-h-[44px] rounded-full border border-dashed border-border/70 text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <Plus className="w-3 h-3" /> Blank page…
          </button>
        )}
      </div>
      {naming !== null && (
        <div className="flex items-center gap-1.5 pt-2">
          <input value={naming} onChange={(e) => setNaming(e.target.value)} autoFocus placeholder="The page's name"
            aria-label="The page's name" className={inputCls}
            onKeyDown={(e) => { if (e.key === "Enter") add(naming); if (e.key === "Escape") setNaming(null); }} />
          <button type="button" className={smallBtn} onClick={() => setNaming(null)}>Cancel</button>
          <button type="button" onClick={() => add(naming)} disabled={!naming.trim()}
            className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 flex-shrink-0">Add</button>
        </div>
      )}
    </StackedRow>
  );
}

export function InfoEntriesField({ settings, set }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const qc = useQueryClient();
  const info = useInfoRecord(settings);
  const { record, type, wantedId } = info;
  const isAlter = type === "alter";
  const [adding, setAdding] = useState(null);
  const all = info.entries;
  const ids = Array.isArray(settings.entries) && settings.entries.length ? settings.entries : DEFAULT_INFO_ENTRIES;
  const allFields = { id: ALL_FIELDS_ENTRY, label: ALL_FIELDS_LABEL, kind: "all" };
  const shown = ids.map((id) => (id === ALL_FIELDS_ENTRY ? (isAlter ? allFields : null) : all.find((e) => e.id === id))).filter(Boolean);
  const setIds = (next) => set({ entries: next });
  const pages = settings.layout === "pages";

  const commit = async (entryId, value) => {
    try { await info.write(entryId, value); } catch (e) { toast.error(e?.message || "Couldn't save that"); }
  };
  // "New field…": makes the entry in the alter's info (theirs alone, or a
  // custom field every alter has) and shows it here.
  const addNew = async () => {
    if (!adding?.name?.trim()) return;
    try {
      const id = adding.scope === "everyone"
        ? await addSharedEntry({ name: adding.name, kind: adding.kind })
        : await addOwnEntry(record.id, { name: adding.name, kind: adding.kind });
      if (adding.scope === "everyone") qc.invalidateQueries({ queryKey: ["customFields"] });
      refreshAlter(qc, record.id);
      setIds([...ids.filter((x) => x !== id), id]);
      setAdding(null);
    } catch (e) { toast.error(e?.message || "Couldn't add that custom field"); }
  };
  const blockedOwn = isAlter && !!record?.alter_custom_fields && !Array.isArray(record.alter_custom_fields);
  const whoseName = record ? (isAlter ? formatAlter(record) : record.name || "this group") : "";
  const what = pages ? "page" : "field";

  return (
    <div className="space-y-1">
      <WhoseRow settings={settings} set={set} info={info} />
      {record && (
        <>
          <p className="text-[0.6875rem] text-muted-foreground pt-1">
            Saved in {whoseName}'s info, so it's kept even if this widget is removed.
          </p>
          {pages && <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground pt-3">Pages, in tab order</h3>}
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
                ? <BioEntry k={`${type}:${record.id}`} value={info.valueOf("bio")} onChange={(v) => commit("bio", v)} />
                : <EntryInput k={`${type}:${record.id}:${entry.id}`} type={entry.kind} label={entry.label}
                    value={info.valueOf(entry.id)} onCommit={(v) => commit(entry.id, v)} />}
            </div>
          ))}
          <AddPageRow info={info} ids={ids}
            onAdded={(id) => set({ entries: [...ids.filter((x) => x !== id), id], layout: "pages" })} />
          <StackedRow label={shown.length ? `Show another ${what}` : `Show a ${what}`}>
            <SearchableSelect value={null} placeholder="Pick what to show…" searchPlaceholder="Search…"
              options={[
                ...(!isAlter || ids.includes(ALL_FIELDS_ENTRY) ? [] : [{ id: ALL_FIELDS_ENTRY, label: `${ALL_FIELDS_LABEL} (custom fields)` }]),
                ...all.filter((e) => !ids.includes(e.id)).map((e) => ({ id: e.id, label: e.label })),
              ]}
              onChange={(id) => { if (id) setIds([...ids, id]); }} />
          </StackedRow>
          {isAlter && (adding ? (
            <NewEntryForm draft={adding} onDraft={setAdding} onAdd={addNew} onCancel={() => setAdding(null)}
              alterName={formatAlter(record)} blockedOwn={blockedOwn} addLabel="Add and show it" />
          ) : (
            <button type="button" className={`${smallBtn} h-11 mt-2`} onClick={() => setAdding({ name: "", kind: "text", scope: "this" })}>
              <Plus className="w-3.5 h-3.5" /> New field…
            </button>
          ))}
        </>
      )}
      {!record && wantedId && <p className="text-xs text-muted-foreground">{isAlter ? `That ${t.alter} isn't` : "That group isn't"} here any more.</p>}
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
  // Framing one picture (v0.314.0); the frame rides on the item.
  const [framing, setFraming] = useState(null);
  const setFrame = (i, frame) => set({
    items: mediaItemsOf(settings).map((it, j) => {
      if (j !== i) return it;
      const { frame: _old, ...rest } = it;
      return frame ? { ...rest, frame } : rest;
    }),
  });

  return (
    <div className="space-y-1">
      {items.map((it, i) => (
        <div key={`${i}:${it.src}`} className="border-b border-border/30">
          <div className="flex items-center gap-2 py-1.5">
            <ItemThumb item={it} />
            <div className="flex-1 min-w-0">
              <DebouncedText value={it.caption} onCommit={(v) => setCaption(i, v)} maxLength={200}
                placeholder="Caption (optional)" ariaLabel={`Caption ${i + 1}`} className={inputCls} />
            </div>
            {it.kind === "image" && (
              <button type="button" onClick={() => setFraming(framing === i ? null : i)} aria-expanded={framing === i}
                aria-label={`Frame picture ${i + 1}`} title="Frame: choose what stays in view"
                className={`w-11 h-11 flex items-center justify-center rounded flex-shrink-0 ${framing === i || it.frame ? "text-foreground" : "text-muted-foreground"}`}>
                <Crop className="w-4 h-4" />
              </button>
            )}
            <MoveRemove index={i} count={items.length} label={`item ${i + 1}`}
              onMove={(idx, dir) => { setFraming(null); setItems(move(items, idx, dir)); }}
              onRemove={(idx) => { setFraming(null); setItems(items.filter((_, j) => j !== idx)); }} />
          </div>
          {framing === i && it.kind === "image" && (
            <ImageFramer src={it.src} value={it.frame} onChange={(f) => setFrame(i, f)}
              shape={settings?.shape === "circle" ? "circle" : "box"} fit={settings?.fit === "contain" ? "contain" : "cover"} label={`Picture ${i + 1}`} />
          )}
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
      <AlterWhoseRow settings={settings} set={set} />
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
      <AlterWhoseRow settings={settings} set={set} />
      {alter && (bar ? (
        <AvatarRows alter={alter} value={barPictureOverride(pickPrimarySystemSettings(settingsRows), alter.id)} k={`bar:${alter.id}`} onChange={setBar}
          label="Pinned bar picture" hint={`What the pinned ${t.alters} bar shows for ${formatAlter(alter)}. Without one, it shows the profile picture.`} />
      ) : (
        <AvatarRows alter={alter} value={alter.avatar_url} k={`avatar:${alter.id}`} onChange={(url) => setAvatar({ avatar_url: url })}
          label="Profile picture" rotation={alter.avatar_rotation_mode} onRotation={(m) => setAvatar({ avatar_rotation_mode: m })} />
      ))}
      {alter && (
        <AlterPictureFramer alter={alter} url={bar ? (barPictureOverride(pickPrimarySystemSettings(settingsRows), alter.id) || alter.avatar_url) : alter.avatar_url}
          shape={settings?.shape === "circle" ? "circle" : "box"} />
      )}
      {!alter && alterId && <p className="text-xs text-muted-foreground">That {t.alter} isn't here any more.</p>}
    </div>
  );
}
