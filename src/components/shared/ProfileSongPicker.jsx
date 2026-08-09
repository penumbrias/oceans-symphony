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

export default function ProfileSongPicker({ value, onChange, subjectLabel = "page" }) {
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
          folder: "Audio",
          kind: "audio",
          created_date: new Date().toISOString(),
        });
        qc.invalidateQueries({ queryKey: ["imageAssets"] });
      } catch { /* the song still works even if the library row fails */ }
      onChange({
        ...(value || {}),
        ref: createLocalImageUrl(audioId),
        title: value?.title || file.name.replace(/\.[^.]+$/, ""),
        loop: value?.loop !== false,
      });
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
            value={value.title || ""}
            onChange={(e) => onChange({ ...value, title: e.target.value })}
            placeholder="Song title (shown in the player)"
            className="h-8 text-sm flex-1 border-0 bg-transparent px-0 focus-visible:ring-0"
          />
          <button type="button" onClick={() => onChange(null)} aria-label="Remove song" title="Remove song"
            className="p-1 rounded-lg text-muted-foreground hover:text-destructive flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Plays when this {subjectLabel} opens.
        </p>
      )}
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
          placeholder="…or paste a direct audio URL"
          defaultValue={value?.ref?.startsWith("http") ? value.ref : ""}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && /^https?:\/\//.test(v)) {
              onChange({ ...(value || {}), ref: v, title: value?.title || "", loop: value?.loop !== false });
            }
          }}
          className="h-8 text-xs flex-1 min-w-[160px]"
        />
      </div>
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
        onSelect={(url) => {
          onChange({ ...(value || {}), ref: url, title: value?.title || "Song", loop: value?.loop !== false });
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
