import { useEffect, useMemo, useState } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Dices, Sparkles, Heart, Download, Check, Trash2, Search, Loader2, ScrollText,
} from "lucide-react";
import { toast } from "sonner";
import { Group, SwitchRow, ChoiceRow, StackedRow, Chips, SliderRow, LinkRow } from "@/components/shared/SettingRows";
import { NATURE_SOUNDS, NATURE_TAGS, natureSoundById } from "@/lib/natureSounds/catalog";
import { writeNaturePrefs, toggleFavorite, filterSounds } from "@/lib/natureSounds/naturePrefs";
import {
  playNature, toggleNature, nextNature, prevNature, seekNature, jumpToRandomPoint, playRandomNature,
  setNatureQueue, setNatureVolume,
} from "@/lib/natureSounds/naturePlayer";
import { canSaveNatureSounds, saveNatureSound, removeSavedNatureSound } from "@/lib/natureSounds/natureOffline";
import { useNatureState, useNaturePrefs, useNatureOffline, fmtLength } from "./natureHooks";
import NatureCreditsPage from "./NatureCreditsPage";

// Quick Support → Nature sounds: field recordings streamed from the
// project's release (nothing extra in the app download), with favourites,
// tags, shuffle and a jump to a random spot. The installed apps can keep a
// sound on the device to play offline.

const SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "place", label: "Place" },
  { value: "short", label: "Shortest" },
  { value: "long", label: "Longest" },
];

function SaveButton({ id, offline }) {
  if (!canSaveNatureSounds()) return null;
  const pct = offline.progress[id];
  const isSaved = offline.saved?.has(id);
  const save = () => saveNatureSound(id).then(
    () => toast.success("Saved on this device"),
    (e) => toast.error(e.message),
  );
  if (pct != null) {
    return (
      <span className="h-11 min-w-11 px-2 inline-flex items-center justify-center text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {Math.round(pct * 100)}%
      </span>
    );
  }
  return isSaved ? (
    <button type="button" onClick={() => removeSavedNatureSound(id)} aria-label="Remove from this device" title="Remove from this device"
      className="h-11 w-11 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
      <Trash2 className="w-4 h-4" />
    </button>
  ) : (
    <button type="button" onClick={save} aria-label="Save on this device" title="Save on this device"
      className="h-11 w-11 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted">
      <Download className="w-4 h-4" />
    </button>
  );
}

function NowPlaying({ player, prefs, offline, list }) {
  const sound = natureSoundById(player.id) || natureSoundById(prefs.lastId);
  const fav = sound && prefs.favorites.includes(sound.id);
  const active = !!player.id;
  const duration = player.duration || sound?.seconds || 0;
  const small = "flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[0.6875rem] hover:text-foreground hover:bg-muted/50 disabled:opacity-40";
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{sound ? sound.title : "Pick a sound"}</p>
          {sound && <p className="text-xs text-muted-foreground truncate">{[sound.place, sound.by].filter(Boolean).join(" · ")}</p>}
        </div>
        {sound && (
          <>
            <button type="button" onClick={() => toggleFavorite(sound.id)} aria-pressed={fav}
              aria-label={fav ? "Remove from favourites" : "Add to favourites"}
              className={`h-11 w-11 -mt-2 inline-flex items-center justify-center rounded-full hover:bg-muted ${fav ? "text-primary" : "text-muted-foreground"}`}>
              <Heart className="w-4 h-4" fill={fav ? "currentColor" : "none"} />
            </button>
            <span className="-mt-2"><SaveButton id={sound.id} offline={offline} /></span>
          </>
        )}
      </div>

      <div>
        {/* A playback position, not a setting: no number box. */}
        <input type="range" min={0} max={Math.max(1, Math.floor(duration))} step={1} // ui-ok: playback position
          value={active ? Math.floor(player.position) : 0} disabled={!active} aria-label="Position"
          onChange={(e) => seekNature(Number(e.target.value))} data-edge-safe="" style={{ touchAction: "pan-y" }}
          className="w-full h-7 accent-primary disabled:opacity-40" />
        <div className="flex justify-between text-[0.6875rem] text-muted-foreground tabular-nums">
          <span>{fmtLength(active ? player.position : 0)}</span>
          <span>{duration ? fmtLength(duration) : "–:––"}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={prevNature} disabled={!active} aria-label="Previous sound"
          className="h-11 w-11 inline-flex items-center justify-center rounded-full text-foreground hover:bg-muted disabled:opacity-40">
          <SkipBack className="w-5 h-5" />
        </button>
        <button type="button" onClick={() => toggleNature()} disabled={!sound && !list.length}
          aria-label={player.playing ? "Pause" : "Play"}
          className="h-14 w-14 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
          {player.loading ? <Loader2 className="w-6 h-6 animate-spin" />
            : player.playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
        </button>
        <button type="button" onClick={nextNature} disabled={!active} aria-label="Next sound"
          className="h-11 w-11 inline-flex items-center justify-center rounded-full text-foreground hover:bg-muted disabled:opacity-40">
          <SkipForward className="w-5 h-5" />
        </button>
      </div>

      <div className="flex gap-1 border-t border-border/40 pt-2">
        <button type="button" onClick={() => writeNaturePrefs({ shuffle: !prefs.shuffle })} aria-pressed={prefs.shuffle}
          className={`${small} ${prefs.shuffle ? "text-primary" : "text-muted-foreground"}`}>
          <Shuffle className="w-4 h-4" /> Shuffle
        </button>
        <button type="button" onClick={() => playRandomNature(list)} disabled={!list.length} className={`${small} text-muted-foreground`}>
          <Dices className="w-4 h-4" /> Any sound
        </button>
        <button type="button" onClick={jumpToRandomPoint} disabled={!active} className={`${small} text-muted-foreground`}>
          <Sparkles className="w-4 h-4" /> Random spot
        </button>
      </div>
      {player.error && <p className="text-xs text-destructive">{player.error}</p>}
    </div>
  );
}

function SoundRow({ sound, current, playing, fav, offline }) {
  const isSaved = offline.saved?.has(sound.id);
  return (
    <div className="flex items-center gap-1 border-b border-border/30 last:border-b-0">
      <button type="button" onClick={() => (current ? toggleNature() : playNature(sound.id))}
        aria-current={current ? "true" : undefined}
        className="flex-1 min-w-0 flex items-center gap-2 text-left min-h-[52px] py-1.5 rounded-md hover:bg-muted/30 -ml-1 pl-1">
        <span className={`w-6 flex-shrink-0 flex justify-center ${current ? "text-primary" : "text-muted-foreground/60"}`}>
          {current && playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className={`text-sm block truncate ${current ? "text-primary font-medium" : "text-foreground"}`}>{sound.title}</span>
          <span className="text-[0.6875rem] text-muted-foreground block truncate">
            {[sound.place, fmtLength(sound.seconds)].filter(Boolean).join(" · ")}
            {isSaved && <Check className="inline w-3 h-3 ml-1 -mt-0.5" aria-label="Saved on this device" />}
          </span>
        </span>
      </button>
      <button type="button" onClick={() => toggleFavorite(sound.id)} aria-pressed={fav}
        aria-label={fav ? `Remove ${sound.title} from favourites` : `Add ${sound.title} to favourites`}
        className={`h-11 w-11 flex-shrink-0 inline-flex items-center justify-center rounded-full hover:bg-muted ${fav ? "text-primary" : "text-muted-foreground/60"}`}>
        <Heart className="w-4 h-4" fill={fav ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

export default function NatureSoundsView({ onBack }) {
  const player = useNatureState();
  const prefs = useNaturePrefs();
  const offline = useNatureOffline();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState("main");

  const list = useMemo(
    () => filterSounds(NATURE_SOUNDS, { ...prefs, query }),
    [prefs, query],
  );
  const ids = useMemo(() => list.map((s) => s.id), [list]);
  useEffect(() => { setNatureQueue(ids); }, [ids]);

  useEffect(() => {
    document.querySelector('[data-tour="grounding-nature-view"]')?.scrollIntoView({ block: "start" });
  }, [page]);

  if (page === "credits") return <NatureCreditsPage onBack={() => setPage("main")} />;

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4" data-tour="grounding-nature-view">
      <div>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 transition-colors">
          ← Back to Quick Support
        </button>
        <h2 className="text-lg font-semibold text-foreground">Nature sounds</h2>
      </div>

      <NowPlaying player={player} prefs={prefs} offline={offline} list={ids} />

      <div className="px-1">
        <SliderRow label="Volume" value={prefs.volume} min={0} max={100} unit="%" onChange={(v) => setNatureVolume(Math.round(v))} />
      </div>

      <div className="px-1">
        <Group title={`Sounds · ${list.length}`} first>
          <div role="search" className="relative my-1.5">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names and places" aria-label="Search sounds"
              className="w-full h-10 rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <ChoiceRow label="Sort" options={SORT_OPTIONS} value={prefs.sort} onChange={(v) => writeNaturePrefs({ sort: v })} />
          <SwitchRow label="Favourites only" checked={prefs.favoritesOnly} onChange={(v) => writeNaturePrefs({ favoritesOnly: v })} />
          <StackedRow label="Tags" own={prefs.tags.length > 0} onClear={() => writeNaturePrefs({ tags: [] })}>
            <Chips label="Tags" multiple options={NATURE_TAGS.map((t) => ({ value: t.id, label: t.label }))}
              value={prefs.tags} onChange={(v) => writeNaturePrefs({ tags: v })} />
          </StackedRow>
          <div>
            {list.map((s) => (
              <SoundRow key={s.id} sound={s} current={player.id === s.id} playing={player.playing}
                fav={prefs.favorites.includes(s.id)} offline={offline} />
            ))}
            {!list.length && (
              <p className="text-xs text-muted-foreground py-6 text-center">
                {prefs.favoritesOnly && !prefs.favorites.length ? "Tap a heart to add a favourite." : "No sounds match."}
              </p>
            )}
          </div>
        </Group>

        <Group title="More">
          <SwitchRow label="Keep playing around the app" checked={prefs.keepPlaying}
            onChange={(v) => writeNaturePrefs({ keepPlaying: v })} />
          <LinkRow label="Credits" icon={ScrollText} value={`${NATURE_SOUNDS.length} recordings`} onClick={() => setPage("credits")} />
        </Group>
      </div>
    </div>
  );
}
