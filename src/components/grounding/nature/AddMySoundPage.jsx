import { useEffect, useRef, useState } from "react";
import { Smartphone, FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Group, LinkRow, Row, ChoiceRow } from "@/components/shared/SettingRows";
import AssetPickerModal from "@/components/shared/AssetPickerModal";
import { inspectAudioFile, addMySoundFromFile, addMySoundFromLibrary } from "@/lib/natureSounds/ownSounds";
import { AUDIO_QUALITIES, qualityById, estimateBytes, canCompress, MAX_STORED_AUDIO_BYTES } from "@/lib/natureSounds/audioCompress";
import { writeNaturePrefs } from "@/lib/natureSounds/naturePrefs";
import { useNaturePrefs, fmtLength, fmtBytes } from "./natureHooks";

// Add a sound of your own to Nature sounds: a file from the device (kept
// as it is, or made smaller as an MP3) or audio already in Assets.
// Self-contained so any audio surface can mount it: { onBack, onAdded }.

const QUALITY_HINTS = {
  original: "Exactly as it is. Best for files that are already small.",
  high: "Sounds the same to most ears.",
  balanced: "Good for rain, waves and birdsong.",
  small: "Smallest backups. Fine for steady background sound.",
};

const titleFromName = (name) => String(name || "").replace(/\.[^.]+$/, "").replace(/_+/g, " ").trim().slice(0, 80);

export default function AddMySoundPage({ onBack, onAdded }) {
  const qc = useQueryClient();
  const prefs = useNaturePrefs();
  const fileRef = useRef(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState(null); // { file, info }
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const info = await inspectAudioFile(file);
      if (!info.ok) { toast.error(info.reason); return; }
      if (!info.playable) toast.warning("This device may not be able to play that file. Compressing it to MP3 usually fixes that.");
      setPicked({ file, info });
      setTitle(titleFromName(info.name));
    } finally {
      setBusy(false);
    }
  };

  const fromLibrary = async (url, item) => {
    setPickerOpen(false);
    setBusy(true);
    try {
      const sound = await addMySoundFromLibrary(url, item);
      qc.invalidateQueries({ queryKey: ["imageAssets"] });
      toast.success(`Added "${sound?.title || "sound"}" to your sounds`);
      onAdded?.(sound ? [sound] : []);
    } catch (e) {
      toast.error(e?.message || "Couldn't add that sound.");
    } finally {
      setBusy(false);
    }
  };

  const info = picked?.info;
  const quality = prefs.addQuality;
  const tooBigOriginal = info && info.size > MAX_STORED_AUDIO_BYTES;
  const options = AUDIO_QUALITIES.map((q) => {
    const size = q.kbps ? (info?.seconds ? `~${fmtBytes(estimateBytes(info.seconds, q.kbps))}` : `${q.kbps} kbps`) : info ? fmtBytes(info.size) : "";
    return { value: q.value, label: size ? `${q.label} · ${size}` : q.label };
  });
  const check = info ? canCompress(info, quality) : { ok: true };
  const blocked = quality === "original" ? tooBigOriginal : !check.ok;
  const blockedReason = quality === "original" && tooBigOriginal
    ? `This file is ${fmtBytes(info.size)}, over the 25 MB limit for one file. Choose a smaller size.`
    : !check.ok ? check.reason : null;

  const add = async () => {
    if (!picked || blocked) return;
    cancelled.current = false;
    setBusy(true);
    setProgress(qualityById(quality)?.kbps ? 0 : null);
    try {
      const sound = await addMySoundFromFile(picked.file, {
        quality, title,
        onProgress: (p) => setProgress(p),
        isCancelled: () => cancelled.current,
      });
      qc.invalidateQueries({ queryKey: ["imageAssets"] });
      toast.success(`Added "${sound.title}" to your sounds`);
      setPicked(null);
      onAdded?.([sound]);
    } catch (e) {
      if (e?.name !== "AbortError") toast.error(e?.message || "Couldn't add that sound.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 transition-colors">
          ← Back
        </button>
        <h2 className="text-lg font-semibold text-foreground">Add a sound</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          It's kept in your Assets (the Nature sounds folder) and backed up with your other files.
        </p>
      </div>

      <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac" className="hidden" onChange={pickFile} />

      {!picked ? (
        <div className="px-1">
          <Group title="Where from" first>
            <LinkRow label="From this device" hint="Pick a recording or song file" icon={Smartphone}
              onClick={() => !busy && fileRef.current?.click()} />
            <LinkRow label="From your Assets" hint="Audio you've already added to the app" icon={FolderOpen}
              onClick={() => !busy && setPickerOpen(true)} />
          </Group>
          {busy && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading the file…
            </p>
          )}
        </div>
      ) : (
        <div className="px-1">
          <Group title="The file" first>
            <Row label={info.name} hint={[info.seconds ? fmtLength(info.seconds) : "Length unknown", fmtBytes(info.size)].join(" · ")}>
              <button type="button" disabled={busy} onClick={() => setPicked(null)}
                className="text-xs text-muted-foreground hover:text-foreground px-2 h-11 disabled:opacity-40">Change</button>
            </Row>
            <div className="py-2 border-b border-border/30">
              <label htmlFor="own-sound-title" className="text-sm block leading-tight mb-1.5">Name</label>
              <Input id="own-sound-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
                placeholder="What to call it" className="h-9 text-sm" disabled={busy} />
            </div>
          </Group>

          <Group title="Size">
            <ChoiceRow label="Quality" hint={QUALITY_HINTS[quality]} options={options} value={quality}
              onChange={(v) => !busy && writeNaturePrefs({ addQuality: v })} />
            {blockedReason && <p className="text-xs text-destructive py-2">{blockedReason}</p>}
          </Group>

          <div className="pt-4 space-y-2">
            {progress != null && (
              <div className="space-y-1" aria-live="polite">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <p className="text-[0.6875rem] text-muted-foreground">Making it smaller… {Math.round(progress * 100)}%. Keep this screen open.</p>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={add} disabled={busy || blocked} className="flex-1 gap-1.5">
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? "Adding…" : "Add sound"}
              </Button>
              {busy && progress != null && (
                <Button variant="outline" onClick={() => { cancelled.current = true; }}>Cancel</Button>
              )}
            </div>
          </div>
        </div>
      )}

      <AssetPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={fromLibrary} kind="audio" />
    </div>
  );
}
