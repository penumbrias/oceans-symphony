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
import { base44 } from "@/api/base44Client";
import AssetPickerModal from "@/components/shared/AssetPickerModal";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";
import { isLocalMode } from "@/lib/storageMode";
import { keptSongTitle, titleFromRef, meaningfulAssetName } from "@/lib/songTitle";

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

export default function ProfileSongPicker({ value, onChange, subjectLabel = "page" }) {
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
    if (!file.type.startsWith("audio/")) { toast.error("That's not an audio file"); e.target.value = ""; return; }
    if (file.size > 25 * 1024 * 1024) { toast.error("Audio over 25MB is too large — try a compressed MP3"); e.target.value = ""; return; }
    setUploading(true);
    try {
      if (!isLocalMode()) { toast.error("Song upload requires local mode. Paste an audio URL instead."); return; }
      if (file.size > 10 * 1024 * 1024) toast.warning(`${(file.size / 1024 / 1024).toFixed(1)}MB — large songs grow your storage and backups.`);
      const audioId = `song-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await saveLocalImage(audioId, file, file.type);
      // Also record it in the asset library so the same audio can be reused
      // elsewhere without re-uploading, and can sit in a folder to rotate.
      try {
        await base44.entities.ImageAsset.create({
          name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Audio",
          image_url: createLocalImageUrl(audioId),
          // Full original file name kept for exports (the title above is shortened).
          original_name: file.name,
          folder: "Songs Audio",
          kind: "audio",
          created_date: new Date().toISOString(),
        });
        qc.invalidateQueries({ queryKey: ["imageAssets"] });
      } catch { /* the song still works even if the library row fails */ }
      onChange(withTitle(value, createLocalImageUrl(audioId), file.name.replace(/\.[^.]+$/, "").slice(0, 80)));
      toast.success("Song saved!");
    } catch {
      toast.error("Failed to save the song");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
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
          <button type="button" onClick={() => onChange(null)} aria-label="Remove song" title="Remove song"
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
          <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Loop while the page is open</span>
            <Switch checked={value.loop !== false}
              onCheckedChange={(v) => onChange({ ...value, loop: !!v })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Start on its own</span>
            <Switch checked={value.autoplay !== false}
              onCheckedChange={(v) => onChange({ ...value, autoplay: !!v })} />
          </label>
          <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Play when there's no sound playing</span>
            <Switch checked={value.playWhenIdle === true}
              onCheckedChange={(v) => onChange({ ...value, playWhenIdle: !!v })} />
          </label>
          {/* Volume is saved with the SONG, so a loud track and a quiet one
              can live on two pages without re-adjusting the device each time. */}
          <div className="space-y-1">
            <label className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Volume</span>
              <span className="tabular-nums">{value.volume ?? 100}%</span>
            </label>
            <input type="range" min={0} max={100} step={5}
              value={value.volume ?? 100}
              onChange={(e) => onChange({ ...value, volume: Number(e.target.value) })}
              aria-label="Song volume" className="w-full accent-primary" />
          </div>
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
