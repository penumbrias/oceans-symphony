// The sound manager (v0.354.0) — Settings → Alter setup → Profile songs.
//
// One home for every song on a profile: the list of songs and where each
// one plays, adding a song to a profile, a song's own default volume, quiet
// hours and songs for times of day. Its pages are drill-ins kept in the URL
// (`?sm=…`), so the phone's back gesture steps back one page.
//
//   (none)                 home
//   songs                  every song
//   song:<key>             one song: preview, default volume, its profiles
//   profiles               profiles with a song
//   profile:<type>:<id>    one profile's song, volume and times of day
//   add / add:<songKey>    pick a profile (and give it that song)
//   quiet                  quiet hours
//   windows                times of day
//
// Data rules: lib/soundManager.js. A profile's song is written through
// setProfileSong (Profile style's own write path); nothing here deletes a
// song file — removing one from a profile leaves it in Assets.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, Music, ListMusic, Users, Upload, FolderOpen, Moon, Clock, Plus, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Row, StackedRow, Group, SwitchRow, ChoiceRow, SliderRow, LinkRow, Chips } from "@/components/shared/SettingRows";
import ProfileSongPicker from "@/components/shared/ProfileSongPicker";
import ProfileSongPlayer from "@/components/alters/ProfileSongPlayer";
import { PICKERS } from "@/components/v2/WhosePicker";
import { confirm } from "@/components/shared/ConfirmDialog";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { useTimeFormat } from "@/lib/timeFormat";
import { songDisplayTitle } from "@/lib/songTitle";
import { saveSongFile } from "@/lib/songUpload";
import { SONGS_AUDIO_FOLDER } from "@/lib/assetFolders";
import {
  useSoundManager, patchSoundManager, setSongDefaultVolume, setProfileSong, profilesWithSongs, songCatalogue,
  songKey, hasAnySong, ownSongOf, formatWindow, newWindowId, DAY_OPTIONS, inWindow,
} from "@/lib/soundManager";

const ENTITY = { alter: "Alter", group: "Group", location: "InnerWorldLocation" };
const PROFILE_PATH = { alter: (id) => `/alter/${id}`, group: (id) => `/group/${id}`, location: (id) => `/location/${id}` };

// Every list this manager reads, once.
function useSongData() {
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: locations = [] } = useQuery({ queryKey: ["innerWorldLocations"], queryFn: () => base44.entities.InnerWorldLocation.list() });
  const { data: assets = [] } = useQuery({ queryKey: ["imageAssets"], queryFn: () => base44.entities.ImageAsset.list("-created_date") });
  return useMemo(() => {
    const profiles = profilesWithSongs({ alters, groups, locations });
    const songs = songCatalogue({ profiles, assets })
      .map((s) => ({ ...s, title: songDisplayTitle({ ref: s.ref, title: s.title }, assets) || "Untitled song" }))
      .sort((a, b) => a.title.localeCompare(b.title));
    return { alters, groups, locations, assets, profiles, songs };
  }, [alters, groups, locations, assets]);
}

// "Ash", "Ash, Bree and 2 more"
function namesLine(names) {
  const list = [...new Set(names.filter(Boolean))];
  if (!list.length) return "";
  if (list.length <= 2) return list.join(", ");
  return `${list.slice(0, 2).join(", ")} and ${list.length - 2} more`;
}

function useProfileName() {
  const formatAlter = useAlterLabel();
  return (p) => (p.type === "alter" && p.record ? formatAlter(p.record) : p.name) || "Unnamed";
}

function useTypeLabel() {
  const t = useTerms();
  return (type) => ({ alter: t.Alter, group: "Group", location: "Location" }[type] || type);
}

function SubHeader({ title, onBack }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <button type="button" onClick={onBack} aria-label="Back"
        className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 flex-shrink-0">
        <ChevronLeft className="w-5 h-5" />
      </button>
      <h2 className="text-lg font-semibold leading-tight min-w-0 truncate">{title}</h2>
    </div>
  );
}

export default function ProfileSongsSettings() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const view = params.get("sm") || "";
  // Drill-ins push history, so Back (and the phone's back gesture) steps out.
  // The hash names this Settings page, so it rides along.
  const go = (next, { replace = false } = {}) => {
    const p = new URLSearchParams(location.search);
    if (next) p.set("sm", next); else p.delete("sm");
    const search = p.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash }, { replace });
  };
  const back = (parent = "") => {
    const idx = typeof window !== "undefined" ? window.history.state?.idx : 0;
    if (idx > 0) navigate(-1); else go(parent, { replace: true });
  };
  const data = useSongData();

  let page;
  if (view === "songs") page = <SongsPage data={data} go={go} back={() => back("")} />;
  else if (view.startsWith("song:")) page = <SongPage songKeyValue={view.slice(5)} data={data} go={go} back={() => back("songs")} />;
  else if (view === "profiles") page = <ProfilesPage data={data} go={go} back={() => back("")} />;
  else if (view.startsWith("profile:")) {
    const [, type, ...rest] = view.split(":");
    page = <ProfilePage type={type} id={rest.join(":")} data={data} go={go} back={() => back("profiles")} />;
  } else if (view === "add" || view.startsWith("add:")) page = <AddToProfilePage songKeyValue={view.slice(4)} data={data} go={go} back={() => back("")} />;
  else if (view === "quiet") page = <QuietPage back={() => back("")} />;
  else if (view === "windows") page = <WindowsPage data={data} back={() => back("")} />;
  else page = <HomePage data={data} go={go} />;
  return <div data-tour="sound-manager">{page}</div>;
}

// ── Home ────────────────────────────────────────────────────────────────────

function HomePage({ data, go }) {
  const t = useTerms();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sm = useSoundManager();
  const use24 = useTimeFormat() === "24";
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const row = pickPrimarySystemSettings(settingsList);
  const enabled = row?.profile_songs_enabled !== false;
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const saveEnabled = async (v) => {
    try {
      if (row?.id) await base44.entities.SystemSettings.update(row.id, { profile_songs_enabled: !!v });
      else await base44.entities.SystemSettings.create({ profile_songs_enabled: !!v });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch { toast.error("Couldn't save"); }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const saved = await saveSongFile(file, qc);
      if (saved) { toast.success("Song added to your library"); go(`song:${songKey(saved.ref)}`); }
    } catch { toast.error("Failed to save the song"); }
    finally { setUploading(false); }
  };

  const quietSummary = sm.quiet.length === 0 ? "Off" : sm.quiet.length === 1 ? formatWindow(sm.quiet[0], use24).split(" · ")[0] : `${sm.quiet.length} set`;

  return (
    <div>
      <SwitchRow label="Play profile songs"
        hint={`A profile with a song plays it when its page opens. Off silences every profile.`}
        checked={enabled} onChange={saveEnabled} />
      <Group title="Songs">
        <LinkRow icon={ListMusic} label="All songs" hint="Every song and which profiles play it" value={String(data.songs.length)} onClick={() => go("songs")} />
        <LinkRow icon={Users} label="Profiles with songs" hint={`${t.Alters}, groups and locations`} value={String(data.profiles.length)} onClick={() => go("profiles")} />
        <LinkRow icon={Plus} label="Add a song to a profile" onClick={() => go("add")} />
        <LinkRow icon={uploading ? Loader2 : Upload} label="Add a song to your library" hint="Upload an audio file to use anywhere"
          onClick={() => !uploading && fileRef.current?.click()} />
        <LinkRow icon={FolderOpen} label="Open the song library" hint="Where your songs are kept, in Assets"
          onClick={() => navigate(`/assets?folder=${encodeURIComponent(SONGS_AUDIO_FOLDER)}`)} />
      </Group>
      <Group title="When songs play">
        <LinkRow icon={Moon} label="Quiet hours" hint="Times songs don't start on their own" value={quietSummary} onClick={() => go("quiet")} />
        <LinkRow icon={Clock} label="Times of day" hint="Give a profile a different song for mornings, nights…" value={sm.windows.length ? String(sm.windows.length) : "None"} onClick={() => go("windows")} />
      </Group>
      <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onFile} />
    </div>
  );
}

// ── Songs ───────────────────────────────────────────────────────────────────

function SongsPage({ data, go, back }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? data.songs.filter((s) => s.title.toLowerCase().includes(q) || s.uses.some((u) => (u.name || "").toLowerCase().includes(q))) : data.songs;
  return (
    <div>
      <SubHeader title="All songs" onBack={back} />
      {data.songs.length > 6 && (
        <div role="search" className="mb-2">
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs or profiles…" aria-label="Search songs" className="h-9 text-sm" />
        </div>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground py-3">
          {data.songs.length ? "No songs match." : "No songs yet. Add one to a profile, or upload one to your library."}
        </p>
      ) : shown.map((s) => (
        <LinkRow key={s.key} icon={Music} label={s.title}
          hint={s.uses.length ? `On ${namesLine(s.uses.map((u) => u.name))}` : "Not on a profile yet"}
          onClick={() => go(`song:${s.key}`)} />
      ))}
    </div>
  );
}

// A draft that writes after a short pause and on leaving, so dragging a
// slider doesn't write settings on every step.
function useDebouncedWrite(write, delay = 400) {
  const timer = useRef(null);
  const pending = useRef(null);
  const latest = useRef(write);
  latest.current = write;
  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (pending.current) { const args = pending.current; pending.current = null; latest.current(...args); }
  };
  useEffect(() => () => flush(), []);
  return (...args) => {
    pending.current = args;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };
}

function SongPage({ songKeyValue, data, go, back }) {
  const sm = useSoundManager();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const typeLabel = useTypeLabel();
  const song = data.songs.find((s) => s.key === songKeyValue) || null;
  const stored = sm.songs[songKeyValue]?.volume;
  const [draft, setDraft] = useState(undefined);
  useEffect(() => { setDraft(undefined); }, [stored]);
  const writeVolume = useDebouncedWrite(async (v) => {
    try { await setSongDefaultVolume(songKeyValue, v); qc.invalidateQueries({ queryKey: ["systemSettings"] }); }
    catch { toast.error("Couldn't save the volume"); }
  });
  if (!song) {
    return (
      <div>
        <SubHeader title="Song" onBack={back} />
        <p className="text-sm text-muted-foreground py-3">This song isn't on any profile or in your library any more.</p>
      </div>
    );
  }
  const volume = draft === null ? undefined : (draft ?? stored);
  const windowName = (id) => sm.windows.find((w) => w.id === id)?.name || "a time of day";
  return (
    <div>
      <SubHeader title={song.title} onBack={back} />
      <Row label="Listen" hint="Plays here only, at its default volume">
        <div className="w-44 max-w-full">
          <ProfileSongPlayer inline song={{ ref: song.ref, title: song.title, automatic: false, loop: false }} />
        </div>
      </Row>
      <SliderRow label="Default volume" hint="Wherever this song plays, unless that profile sets its own"
        value={volume} fallback={100} min={0} max={100} step={5} unit="%"
        onChange={(v) => { setDraft(v); writeVolume(v); }}
        onClear={() => { setDraft(null); writeVolume(null); }} />
      <Group title="On these profiles">
        {song.uses.length === 0 && <p className="text-sm text-muted-foreground py-2">Not on a profile yet.</p>}
        {song.uses.map((u) => (
          <LinkRow key={`${u.type}:${u.id}:${u.windowId || ""}`} label={u.name || "Unnamed"}
            hint={u.windowId ? `${typeLabel(u.type)} · for ${windowName(u.windowId)}` : typeLabel(u.type)}
            onClick={() => go(`profile:${u.type}:${u.id}`)} />
        ))}
        <LinkRow icon={Plus} label="Add to a profile" onClick={() => go(`add:${song.key}`)} />
      </Group>
      {song.asset && (
        <Group title="Library">
          <LinkRow icon={FolderOpen} label="Open in Assets" hint={song.asset.folder || SONGS_AUDIO_FOLDER}
            onClick={() => navigate(`/assets?folder=${encodeURIComponent(song.asset.folder || SONGS_AUDIO_FOLDER)}`)} />
        </Group>
      )}
    </div>
  );
}

// ── Profiles ────────────────────────────────────────────────────────────────

function ProfilesPage({ data, go, back }) {
  const nameOf = useProfileName();
  const typeLabel = useTypeLabel();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const titleOf = (song) => (song?.ref ? songDisplayTitle(song, data.assets) || "Untitled song" : "Only at times of day");
  const list = [...data.profiles].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const shown = q ? list.filter((p) => nameOf(p).toLowerCase().includes(q) || titleOf(p.song).toLowerCase().includes(q)) : list;
  return (
    <div>
      <SubHeader title="Profiles with songs" onBack={back} />
      {list.length > 6 && (
        <div role="search" className="mb-2">
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search profiles or songs…" aria-label="Search profiles" className="h-9 text-sm" />
        </div>
      )}
      {shown.length === 0 && <p className="text-sm text-muted-foreground py-3">{list.length ? "Nothing matches." : "No profile has a song yet."}</p>}
      {shown.map((p) => {
        const extra = Object.values(p.song?.windows || {}).filter((w) => w?.ref).length;
        return (
          <LinkRow key={`${p.type}:${p.id}`} label={nameOf(p)}
            hint={`${typeLabel(p.type)} · ${titleOf(p.song)}${extra && p.song?.ref ? ` · +${extra} for times of day` : ""}`}
            onClick={() => go(`profile:${p.type}:${p.id}`)} />
        );
      })}
      <LinkRow icon={Plus} label="Add a song to a profile" onClick={() => go("add")} />
    </div>
  );
}

function ProfilePage({ type, id, data, go, back }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const typeLabel = useTypeLabel();
  const formatAlter = useAlterLabel();
  const sm = useSoundManager();
  const use24 = useTimeFormat() === "24";
  const list = type === "alter" ? data.alters : type === "group" ? data.groups : type === "location" ? data.locations : [];
  const record = list.find((r) => r.id === id) || null;
  const saved = ownSongOf(type, record);
  // The draft shows at once; the write follows after a pause (typing a
  // title shouldn't write the record on every letter).
  const [draft, setDraft] = useState(undefined);
  const savedKey = JSON.stringify(saved || null);
  useEffect(() => { setDraft(undefined); }, [savedKey]);
  const song = draft === undefined ? saved : draft;
  const write = useDebouncedWrite(async (next) => {
    try {
      await setProfileSong(type, id, hasAnySong(next) ? next : null);
      const key = type === "alter" ? ["alters"] : type === "group" ? ["groups"] : ["innerWorldLocations"];
      qc.invalidateQueries({ queryKey: key });
      if (type === "alter") qc.invalidateQueries({ queryKey: ["alter", id] });
    } catch (e) { toast.error(e?.message || "Couldn't save the song"); }
  }, 450);
  const change = (next) => { setDraft(next); write(next); };

  if (!ENTITY[type] || !record) {
    return (
      <div>
        <SubHeader title="Profile" onBack={back} />
        <p className="text-sm text-muted-foreground py-3">This profile couldn't be found.</p>
      </div>
    );
  }
  const name = (type === "alter" ? formatAlter(record) : record.name) || "Unnamed";
  const setWindowSong = (windowId, pick) => {
    const windows = { ...(song?.windows || {}) };
    if (pick?.ref) windows[windowId] = { ref: pick.ref, title: pick.title || "", ...(pick.volume != null ? { volume: pick.volume } : {}), ...(pick.titleAuto != null ? { titleAuto: pick.titleAuto } : {}) };
    else delete windows[windowId];
    const next = { ...(song || {}) };
    if (Object.keys(windows).length) next.windows = windows; else delete next.windows;
    change(next);
  };
  const now = new Date();
  return (
    <div>
      <SubHeader title={name} onBack={back} />
      <LinkRow icon={ExternalLink} label={`Open ${typeLabel(type).toLowerCase() === "location" ? "this location" : "the profile"}`} hint={typeLabel(type)}
        onClick={() => navigate(PROFILE_PATH[type](id))} />
      <Group title="Song">
        <StackedRow label="Profile song" hint="Plays when the profile opens">
          <ProfileSongPicker value={song || null} onChange={(v) => change(v)} subjectLabel="page" />
        </StackedRow>
      </Group>
      <Group title="Times of day">
        {sm.windows.length === 0 ? (
          <LinkRow icon={Clock} label="Set up times of day" hint="Then give this profile a different song for each one" onClick={() => go("windows")} />
        ) : sm.windows.map((w) => (
          <StackedRow key={w.id} label={`${w.name || "Untitled"}${inWindow(w, now) ? " · now" : ""}`} hint={`${formatWindow(w, use24)}. Plays instead of the profile song.`}>
            <ProfileSongPicker compact value={song?.windows?.[w.id] || null} onChange={(v) => setWindowSong(w.id, v)} subjectLabel="page" />
          </StackedRow>
        ))}
      </Group>
    </div>
  );
}

function AddToProfilePage({ songKeyValue, data, go, back }) {
  const t = useTerms();
  const qc = useQueryClient();
  const [type, setType] = useState("alter");
  const [busy, setBusy] = useState(false);
  const song = songKeyValue ? data.songs.find((s) => s.key === songKeyValue) : null;
  const Picker = PICKERS[type];
  const pick = async (id) => {
    if (!id || busy) return;
    if (!song) { go(`profile:${type}:${id}`, { replace: true }); return; }
    const list = type === "alter" ? data.alters : type === "group" ? data.groups : data.locations;
    const record = list.find((r) => r.id === id);
    const current = ownSongOf(type, record);
    if (current?.ref && songKey(current.ref) === song.key) { go(`profile:${type}:${id}`, { replace: true }); return; }
    if (current?.ref) {
      const ok = await confirm({
        title: "Replace this profile's song?",
        body: `It plays "${songDisplayTitle(current, data.assets) || "another song"}" now. That song stays in your library.`,
        confirmLabel: "Replace",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await setProfileSong(type, id, { ...(current || {}), ref: song.ref, title: song.title, titleAuto: true, loop: current?.loop !== false });
      qc.invalidateQueries({ queryKey: type === "alter" ? ["alters"] : type === "group" ? ["groups"] : ["innerWorldLocations"] });
      toast.success("Song added");
      go(`profile:${type}:${id}`, { replace: true });
    } catch (e) { toast.error(e?.message || "Couldn't add the song"); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <SubHeader title={song ? `Add "${song.title}"` : "Add a song to a profile"} onBack={back} />
      <ChoiceRow label="Kind of profile" value={type} onChange={setType}
        options={[{ value: "alter", label: t.Alter }, { value: "group", label: "Group" }, { value: "location", label: "Location" }]} />
      <StackedRow label="Which one" hint={song ? "It gets this song. A song it has now is replaced (it stays in your library)." : "Then pick its song."}>
        <Picker key={type} value="" onChange={pick} />
      </StackedRow>
    </div>
  );
}

// ── Quiet hours & times of day ──────────────────────────────────────────────

// One window's rows: (name), from, until, days and remove.
function WindowRows({ win, named = false, onChange, onRemove, removeLabel }) {
  const [name, setName] = useState(win.name || "");
  useEffect(() => { setName(win.name || ""); }, [win.name]);
  return (
    <>
      {named && (
        <Row label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== win.name && onChange({ name: name.trim() })}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            placeholder="Morning, night…" aria-label="Name" className="h-8 w-40 text-sm" />
        </Row>
      )}
      <Row label="From">
        <Input type="time" value={win.start} onChange={(e) => e.target.value && onChange({ start: e.target.value })} aria-label="From" className="h-8 w-32 text-sm" />
      </Row>
      <Row label="Until" hint={win.end <= win.start && win.end !== win.start ? "Runs past midnight" : null}>
        <Input type="time" value={win.end} onChange={(e) => e.target.value && onChange({ end: e.target.value })} aria-label="Until" className="h-8 w-32 text-sm" />
      </Row>
      <StackedRow label="Days" hint={win.days?.length ? null : "None picked means every day"}>
        <Chips label="Days" multiple options={DAY_OPTIONS} value={win.days || []} onChange={(days) => onChange({ days: days.map(Number) })} />
      </StackedRow>
      <Row label="">
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive" onClick={onRemove}>
          <Trash2 className="w-3.5 h-3.5" /> {removeLabel}
        </Button>
      </Row>
    </>
  );
}

function useWindowListWriter(field) {
  const qc = useQueryClient();
  return async (fn) => {
    try {
      await patchSoundManager((sm) => ({ [field]: fn(sm[field]) }));
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch { toast.error("Couldn't save"); }
  };
}

function QuietPage({ back }) {
  const sm = useSoundManager();
  const qc = useQueryClient();
  const use24 = useTimeFormat() === "24";
  const writeList = useWindowListWriter("quiet");
  const [vol, setVol] = useState(undefined);
  useEffect(() => { setVol(undefined); }, [sm.quietVolume]);
  const writeVol = useDebouncedWrite(async (v) => {
    try { await patchSoundManager({ quietVolume: v }); qc.invalidateQueries({ queryKey: ["systemSettings"] }); }
    catch { toast.error("Couldn't save"); }
  });
  const setMode = async (mode) => {
    try { await patchSoundManager({ quietMode: mode }); qc.invalidateQueries({ queryKey: ["systemSettings"] }); }
    catch { toast.error("Couldn't save"); }
  };
  const quietOn = sm.quiet.some((w) => inWindow(w));
  return (
    <div>
      <SubHeader title="Quiet hours" onBack={back} />
      <p className="text-xs text-muted-foreground pb-2">
        Songs on profiles, pages and song widgets don't start on their own during quiet hours. You can still press play.
        {quietOn ? " Quiet hours are on right now." : ""}
      </p>
      {sm.quiet.map((w, i) => (
        <Group key={w.id} title={formatWindow(w, use24)} first={i === 0}>
          <WindowRows win={w} removeLabel="Remove these quiet hours"
            onChange={(patch) => writeList((list) => list.map((x) => (x.id === w.id ? { ...x, ...patch } : x)))}
            onRemove={() => writeList((list) => list.filter((x) => x.id !== w.id))} />
        </Group>
      ))}
      <div className="pt-3">
        <Button type="button" variant="outline" size="sm" className="gap-1.5"
          onClick={() => writeList((list) => [...list, { id: newWindowId(), name: "", start: "22:00", end: "07:00", days: [] }])}>
          <Plus className="w-3.5 h-3.5" /> Add quiet hours
        </Button>
      </div>
      {sm.quiet.length > 0 && (
        <Group title="During quiet hours">
          <ChoiceRow label="Songs" value={sm.quietMode} onChange={setMode}
            options={[{ value: "wait", label: "Wait for a tap" }, { value: "quieter", label: "Play quieter" }]} />
          {sm.quietMode === "quieter" && (
            <SliderRow label="No louder than" value={vol ?? sm.quietVolume} fallback={30} min={0} max={100} step={5} unit="%"
              onChange={(v) => { setVol(v); writeVol(v); }} />
          )}
        </Group>
      )}
    </div>
  );
}

function WindowsPage({ data, back }) {
  const sm = useSoundManager();
  const use24 = useTimeFormat() === "24";
  const writeList = useWindowListWriter("windows");
  const usedBy = (id) => data.profiles.filter((p) => p.song?.windows?.[id]?.ref).length;
  const remove = async (w) => {
    const n = usedBy(w.id);
    if (n > 0) {
      const ok = await confirm({
        title: `Remove "${w.name || "this time of day"}"?`,
        body: `${n === 1 ? "One profile has" : `${n} profiles have`} a song for it. Those songs stop playing at this time, but stay picked in case you add the time back.`,
        confirmLabel: "Remove", destructive: true,
      });
      if (!ok) return;
    }
    writeList((list) => list.filter((x) => x.id !== w.id));
  };
  return (
    <div>
      <SubHeader title="Times of day" onBack={back} />
      <p className="text-xs text-muted-foreground pb-2">
        Name the parts of your day, then give any profile a song for each one. It plays instead of the profile's own song while that time is on.
      </p>
      {sm.windows.map((w, i) => (
        <Group key={w.id} title={`${w.name || "Untitled"} · ${formatWindow(w, use24)}`} first={i === 0}>
          <WindowRows win={w} named removeLabel="Remove this time of day"
            onChange={(patch) => writeList((list) => list.map((x) => (x.id === w.id ? { ...x, ...patch } : x)))}
            onRemove={() => remove(w)} />
        </Group>
      ))}
      <div className="pt-3">
        <Button type="button" variant="outline" size="sm" className="gap-1.5"
          onClick={() => writeList((list) => [...list, { id: newWindowId(), name: list.length ? "" : "Morning", start: list.length ? "18:00" : "06:00", end: list.length ? "22:00" : "12:00", days: [] }])}>
          <Plus className="w-3.5 h-3.5" /> Add a time of day
        </Button>
      </div>
    </div>
  );
}
