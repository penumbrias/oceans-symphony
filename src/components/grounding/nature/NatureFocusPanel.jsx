import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, SkipBack, SkipForward } from "lucide-react";
import { SliderRow, LinkRow } from "@/components/shared/SettingRows";
import { NATURE_SOUNDS } from "@/lib/natureSounds/catalog";
import { filterSounds } from "@/lib/natureSounds/naturePrefs";
import { isDefaultShape } from "@/lib/natureSounds/recordingShape";
import { setNatureQueue, setNatureVolume, nextNature, prevNature } from "@/lib/natureSounds/naturePlayer";
import { useNatureState, useNaturePrefs, useNatureOffline, useMySounds } from "./natureHooks";
import { NowPlayingStrip, SoundRow } from "./NatureSoundsView";

// The recording layer inside a focus settings sheet: what's playing,
// volume, a way into Shape the sound, and the list to pick another sound
// (nature and your own, as sorted and filtered on the Nature sounds page).
export default function NatureFocusPanel({ onShape }) {
  const player = useNatureState();
  const prefs = useNaturePrefs();
  const offline = useNatureOffline();
  const mine = useMySounds();
  const [query, setQuery] = useState("");
  const list = useMemo(() => filterSounds([...mine, ...NATURE_SOUNDS], { ...prefs, query }), [prefs, query, mine]);
  const ids = useMemo(() => list.map((s) => s.id), [list]);
  useEffect(() => { setNatureQueue(ids); }, [ids]);

  return (
    <div className="space-y-3">
      <NowPlayingStrip player={player} prefs={prefs} offline={offline} />
      {player.id && (
        <div className="flex justify-center gap-3">
          <button type="button" onClick={prevNature} aria-label="Previous sound"
            className="h-10 w-10 inline-flex items-center justify-center rounded-full text-foreground hover:bg-muted">
            <SkipBack className="w-4 h-4" />
          </button>
          <button type="button" onClick={nextNature} aria-label="Next sound"
            className="h-10 w-10 inline-flex items-center justify-center rounded-full text-foreground hover:bg-muted">
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      )}
      <div>
        <SliderRow label="Volume" value={prefs.volume} min={0} max={100} unit="%" onChange={(v) => setNatureVolume(Math.round(v))} />
        <LinkRow label="Shape the sound" hint="Low and high cut, movement, space and speed" icon={SlidersHorizontal}
          value={isDefaultShape(prefs.shape) ? "As recorded" : "Shaped"} onClick={onShape} />
      </div>
      <div role="search" className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search names and places" aria-label="Search sounds"
          className="w-full h-10 rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
      </div>
      <div>
        {list.map((s) => (
          <SoundRow key={s.id} sound={s} current={player.id === s.id} playing={player.playing}
            fav={prefs.favorites.includes(s.id)} offline={offline} />
        ))}
        {!list.length && <p className="text-xs text-muted-foreground py-4 text-center">No sounds match.</p>}
      </div>
    </div>
  );
}
