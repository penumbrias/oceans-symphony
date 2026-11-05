// The profile-song editor, lifted out of AlterEditModal so it isn't
// alter-only: any profile (group, subsystem, inner-world location) and the
// v2 home board can offer the same thing. Pure controlled input — the
// caller decides where `{ ref, title, loop }` is stored.
//
// Upload goes to the local blob store (so it rides backups); a direct audio
// URL streams instead. The global kill-switch stays in Settings.

import React, { useRef, useState } from "react";
import { Music, Upload, Loader2, X, FolderOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import AssetPickerModal from "@/components/shared/AssetPickerModal";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SliderRow } from "@/components/shared/SettingRows";
import { saveSongFile } from "@/lib/songUpload";
import { useSoundManager, songKey, hasAnySong } from "@/lib/soundManager";
import { keptSongTitle, titleFromRef, meaningfulAssetName } from "@/lib/songTitle";
import { songAutomatic } from "@/lib/songPresence";

// A new pick names itself after the song (file name, library name, the
// link's file name) unless the user typed a title of their own. titleAuto
// marks a filled-in title so the NEXT pick can replace it too.
function withTitle(value, ref, autoTitle) {
  const kept = keptSongTitle(value);
  return {
    ...(value || {}),
    ref,
    title: kept || autoTitle || "",
    titleAuto: !kept,
    loop: value?.loop !== false,
  };
}

// `compact` leaves out loop / automatic / everywhere — for a song picked for
// a time of day, which plays the way the profile's own song does.
export default function ProfileSongPicker({ value, onChange, subjectLabel = "page", allowEverywhere = false, compact = false }) {
  // null | "checking" | "ok" | "bad" — result of probing a pasted URL.
  const [urlState, setUrlState] = React.useState(null);
  const checkUrl = React.useCallback((url) => {
    setUrlState("checking");
    const a = new Audio();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      setUrlState(ok ? "ok" : "bad");
      a.src = "";
    };
    a.addEventListener("canplay", () => finish(true));
    a.addEventListener("loadedmetadata", () => finish(true));
    a.addEventListener("error", () => finish(false));
    a.preload = "metadata";
    a.src = url;
    // A link that never resolves is no use either — don't leave the user
    // watching a spinner.
    setTimeout(() => finish(false), 8000);
  }, []);
  // A pasted link used to commit only on blur. Leaving the sheet by the
  // Android back button, a bar button, or the app going to the background
  // never blurs the field, so the link was silently dropped. Hold what was
  // typed and commit it on every way out.
  const pendingLink = useRef(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const commitLink = React.useCallback((check = true) => {
    const v = (pendingLink.current || "").trim();
    pendingLink.current = null;
    const { value: cur, onChange: change } = latest.current;
    if (!v || !/^https?:\/\//i.test(v) || v === cur?.ref) return;
    change(withTitle(cur, v, titleFromRef(v)));
    if (check) checkUrl(v);
  }, [checkUrl]);
  React.useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") commitLink(false); };
    const onPageHide = () => commitLink(false);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      commitLink(false);
    };
  }, [commitLink]);
  // The title field keeps its own text while it has focus. Where the value
  // is saved asynchronously (the home board writes it to disk), mirroring
  // the stored value straight into the field dropped letters typed before
  // the save came back. It follows the stored title whenever it isn't
  // being typed in — a new pick fills it in.
  const [titleDraft, setTitleDraft] = useState(value?.title || "");
  const editingTitle = useRef(false);
  React.useEffect(() => {
    if (!editingTitle.current) setTitleDraft(value?.title || "");
  }, [value?.title]);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileRef = useRef(null);
  const qc = useQueryClient();

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const saved = await saveSongFile(file, qc);
      if (saved) {
        onChange(withTitle(value, saved.ref, saved.title));
        toast.success("Song saved!");
      }
    } catch {
      toast.error("Failed to save the song");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // Removing the main song keeps any songs set for times of day.
  const removeSong = () => {
    if (!value) return onChange(null);
    const rest = { ...value };
    delete rest.ref; delete rest.title; delete rest.titleAuto;
    onChange(hasAnySong(rest) ? rest : null);
  };
  // The song's own default volume (sound manager) shows greyed until this
  // place sets its own.
  const sm = useSoundManager();
  const songDefaultVolume = value?.ref ? (sm.songs[songKey(value.ref)]?.volume ?? 100) : 100;
  const clearVolume = () => {
    const rest = { ...value };
    delete rest.volume;
    onChange(rest);
  };

  return (
    <div className="space-y-2">
      {value?.ref ? (
        <div className="flex items-center gap-2 rounded-xl border border-border/50 px-3 py-2">
          <Music className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <Input
            value={titleDraft}
            onFocus={() => { editingTitle.current = true; }}
            onBlur={() => { editingTitle.current = false; }}
            onChange={(e) => {
              setTitleDraft(e.target.value);
              onChange({ ...value, title: e.target.value, titleAuto: false });
            }}
            placeholder="Song title (shown in the player)"
            className="h-8 text-sm flex-1 border-0 bg-transparent px-0 focus-visible:ring-0"
          />
          <button type="button" onClick={removeSong} aria-label="Remove song" title="Remove song"
            className="p-1 rounded-lg text-muted-foreground hover:text-destructive flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs"
          onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Upload audio
        </Button>
        <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs"
          onClick={() => setPickerOpen(true)}>
          <FolderOpen className="w-3.5 h-3.5" /> From library
        </Button>
        <Input
          placeholder="…or paste a link to an audio file"
          defaultValue={value?.ref?.startsWith("http") ? value.ref : ""}
          onChange={(e) => { pendingLink.current = e.target.value; }}
          onBlur={(e) => { pendingLink.current = e.target.value; commitLink(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); pendingLink.current = e.currentTarget.value; commitLink(); }
          }}
          className="h-8 text-xs flex-1 min-w-[160px]"
        />
      </div>
      {/* A pasted link is only a song if it's the audio FILE. A YouTube or
          Spotify page is a web page, so the browser can't play it — and the
          old behaviour was a play button that silently did nothing. Check it
          here, while the fix is still one paste away. */}
      {urlState === "checking" && (
        <p className="text-[0.6875rem] text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" /> Checking that link…
        </p>
      )}
      {urlState === "ok" && (
        <p className="text-[0.6875rem] text-primary">That link plays. 🎵</p>
      )}
      {urlState === "bad" && (
        <p className="text-[0.6875rem] text-destructive">
          Not an audio file. YouTube and Spotify links are web pages — use a link ending in .mp3,
          .ogg or .m4a, or upload the file.
        </p>
      )}
      {value?.ref && (
        <>
          {!compact && (<>
          <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Loop while the page is open</span>
            <Switch checked={value.loop !== false}
              onCheckedChange={(v) => onChange({ ...value, loop: !!v })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Automatic. Play when no music is playing.</span>
            <Switch checked={songAutomatic(value)}
              onCheckedChange={(v) => onChange({
                ...value, automatic: !!v, autoplay: !!v, playWhenIdle: !!v,
                ...(v ? { everywhere: false } : {}),
              })} />
          </label>
          {allowEverywhere && (
            <div className="space-y-0.5">
              <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Play on every page of the app</span>
                <Switch checked={value.everywhere === true} disabled={value.automatic === true}
                  onCheckedChange={(v) => onChange({ ...value, everywhere: !!v })} />
              </label>
              <p className="text-[0.6875rem] text-muted-foreground">
                {value.automatic === true
                  ? "Turn Automatic off to use this. An automatic song already carries on from the widget page you opened last."
                  : "A page with its own song keeps it, and chat videos and audio pause this one until they stop."}
              </p>
            </div>
          )}
          </>)}
          {/* Volume is saved with the SONG, so a loud track and a quiet one
              can live on two pages without re-adjusting the device each time. */}
          <SliderRow label="Volume" hint={value.volume === undefined || value.volume === null ? "The song's own volume" : null}
            value={value.volume ?? undefined} fallback={songDefaultVolume} min={0} max={100} step={5} unit="%"
            onChange={(v) => onChange({ ...value, volume: v })}
            onClear={clearVolume} />
        </>
      )}
      <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={handleUpload} />
      <AssetPickerModal
        open={pickerOpen}
        kind="audio"
        onClose={() => setPickerOpen(false)}
        onSelect={(url, item) => {
          onChange(withTitle(value, url, meaningfulAssetName(item?.name) || titleFromRef(url)));
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
