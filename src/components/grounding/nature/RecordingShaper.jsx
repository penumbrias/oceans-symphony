import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { fmtHz } from "@/lib/soundscape/soundMath";
import { SHAPE_LIMITS, clampShape, isDefaultShape } from "@/lib/natureSounds/recordingShape";
import { setRecordingShape } from "@/lib/natureSounds/naturePlayer";
import { natureSoundById } from "@/lib/natureSounds/catalog";
import { SynthPanel, Module, Lcd, KeyRow, Knob, KnobRow, LedSwitch } from "@/components/grounding/soundscape/synthControls";
import { useNaturePrefs, useNatureState } from "./natureHooks";

// "Shape the sound" for a recording, as the same hardware-style panel the
// Soundscape uses: filter, movement, space and speed. Values are clamped in
// recordingShape.js and applied by the player as you turn.

const toPos = (v, [lo, hi]) => Math.round((Math.log(v / lo) / Math.log(hi / lo)) * 1000);
const fromPos = (pos, [lo, hi]) => lo * Math.pow(hi / lo, pos / 1000);
const pct = (v) => `${Math.round(v)}%`;

const MOTION_OPTIONS = [
  { value: "constant", label: "Constant" },
  { value: "drift", label: "Drift" },
  { value: "waves", label: "Waves" },
  { value: "gusts", label: "Gusts" },
];

export default function RecordingShaper() {
  const prefs = useNaturePrefs();
  const player = useNatureState();
  const sh = clampShape(prefs.shape);
  const [touched, setTouched] = useState(null);
  const idle = useRef(null);
  const touch = (label, value) => {
    setTouched([label, value]);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => setTouched(null), 2500);
  };
  useEffect(() => () => clearTimeout(idle.current), []);
  const set = (patch) => setRecordingShape(patch);
  const key = (patch, label, value) => { set(patch); touch(label, value); };

  const sound = natureSoundById(player.id) || natureSoundById(prefs.lastId);
  // Filters, movement and space need the recording to go through the sound
  // bus; speed works on anything.
  const routed = !player.id || player.shapeable;
  const lcd = touched
    ? [String(touched[0]).toUpperCase(), touched[1]]
    : [sound ? sound.title : "No recording yet",
       `${sh.lowCut > 20 ? fmtHz(sh.lowCut) : "Full lows"} – ${sh.highCut < 20000 ? fmtHz(sh.highCut) : "full highs"}${sh.speed !== 1 ? ` · ${sh.speed.toFixed(2)}×` : ""}`];

  return (
    <SynthPanel name="SR-1" subtitle="Recording shaper">
      <Lcd lines={lcd} />

      {!routed && (
        <p className="text-[0.6875rem] text-muted-foreground">
          This recording streams from a host that doesn't let the app reach into the sound, so only Speed works on it.
          Save it on the device (the download button above) or use one of your own sounds to shape it fully.
        </p>
      )}

      <Module title="Filter">
        <KnobRow>
          <Knob label="Low cut" pos={toPos(sh.lowCut, SHAPE_LIMITS.lowCut)}
            onChange={(v) => set({ lowCut: Math.round(fromPos(v, SHAPE_LIMITS.lowCut)) })}
            display={(v) => (fromPos(v, SHAPE_LIMITS.lowCut) <= 21 ? "Off" : `≥ ${fmtHz(Math.round(fromPos(v, SHAPE_LIMITS.lowCut)))}`)} onTouch={touch} />
          <Knob label="High cut" pos={toPos(sh.highCut, SHAPE_LIMITS.highCut)}
            onChange={(v) => set({ highCut: Math.round(fromPos(v, SHAPE_LIMITS.highCut)) })}
            display={(v) => (fromPos(v, SHAPE_LIMITS.highCut) >= 19900 ? "Off" : `≤ ${fmtHz(Math.round(fromPos(v, SHAPE_LIMITS.highCut)))}`)} onTouch={touch} />
          <Knob label="Space" pos={Math.round((sh.space / SHAPE_LIMITS.space[1]) * 100)} max={100}
            onChange={(v) => set({ space: (v / 100) * SHAPE_LIMITS.space[1] })}
            display={(v) => (v ? pct(v) : "Dry")} onTouch={touch} />
        </KnobRow>
      </Module>

      <Module title="Movement">
        <KeyRow options={MOTION_OPTIONS} value={sh.motion}
          onChange={(v) => key({ motion: v }, "Movement", MOTION_OPTIONS.find((o) => o.value === v)?.label)} />
        {sh.motion !== "constant" && (
          <KnobRow>
            <Knob label="Depth" pos={Math.round((sh.motionAmount / SHAPE_LIMITS.motionAmount[1]) * 100)} max={100}
              onChange={(v) => set({ motionAmount: (v / 100) * SHAPE_LIMITS.motionAmount[1] })} display={pct} onTouch={touch} />
            <Knob label="Slowness" pos={1000 - toPos(sh.motionSpeed, SHAPE_LIMITS.motionSpeed)}
              onChange={(v) => set({ motionSpeed: fromPos(1000 - v, SHAPE_LIMITS.motionSpeed) })}
              display={(v) => `${Math.round(1 / fromPos(1000 - v, SHAPE_LIMITS.motionSpeed))}s a swell`} onTouch={touch} />
          </KnobRow>
        )}
      </Module>

      <Module title="Speed">
        <KnobRow>
          <Knob label="Speed" pos={Math.round(sh.speed * 100)} min={50} max={150} step={5}
            onChange={(v) => set({ speed: v / 100 })} display={(v) => `${(v / 100).toFixed(2)}×`} onTouch={touch} />
        </KnobRow>
        <LedSwitch label="Keep the pitch" hint="Off: slower is deeper and faster is higher, like a tape."
          checked={sh.keepPitch} onChange={(v) => key({ keepPitch: v }, "Pitch", v ? "Kept" : "Follows speed")} />
      </Module>

      <button type="button" onClick={() => set(null)} disabled={isDefaultShape(sh)}
        className="w-full flex items-center justify-center gap-1.5 rounded-md border border-border/70 bg-card py-2 text-[0.6875rem] font-medium uppercase tracking-wide text-foreground disabled:opacity-40 hover:bg-muted/40">
        <RotateCcw className="w-3.5 h-3.5" /> Reset
      </button>
    </SynthPanel>
  );
}
