import { useEffect, useRef, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { LIMITS, fmtHz } from "@/lib/soundscape/soundMath";
import { SynthPanel, Module, Lcd, KeyRow, Knob, KnobRow, LedKey, LedSwitch } from "./synthControls";

// "Shape the sound" as a hardware-style panel: source, rain, filter,
// tone and movement modules with knobs, and an LCD that shows whatever
// was last turned (or the sound's name when nothing is being touched).
// Every value still goes through clampParams in the parent's setP.

// Log-scale knob positions for frequencies: 0..1000 ↔ lo..hi Hz.
const toPos = (v, [lo, hi]) => Math.round((Math.log(v / lo) / Math.log(hi / lo)) * 1000);
const fromPos = (pos, [lo, hi]) => lo * Math.pow(hi / lo, pos / 1000);
const pct = (v) => `${Math.round(v)}%`;

const NOISE_OPTIONS = [
  { value: "brown", label: "Brown" },
  { value: "pink", label: "Pink" },
  { value: "white", label: "White" },
  { value: "rain", label: "Rain" },
  { value: "none", label: "None" },
];
const SURFACE_OPTIONS = [
  { value: "open", label: "Open air" },
  { value: "leaves", label: "Leaves" },
  { value: "puddles", label: "Puddles" },
  { value: "roof", label: "Roof" },
  { value: "tent", label: "Tent" },
];
const MOTION_OPTIONS = [
  { value: "constant", label: "Constant" },
  { value: "drift", label: "Drift" },
  { value: "waves", label: "Waves" },
  { value: "gusts", label: "Gusts" },
];
const NOISE_NAMES = { brown: "Brown noise", pink: "Pink noise", white: "White noise", rain: "Rain", none: "No noise" };

export default function SoundShaper({ p, setP, changed, basePreset, onReset, onSave }) {
  const [touched, setTouched] = useState(null);
  const idle = useRef(null);
  const touch = (label, value) => {
    setTouched([label, value]);
    clearTimeout(idle.current);
    idle.current = setTimeout(() => setTouched(null), 2500);
  };
  useEffect(() => () => clearTimeout(idle.current), []);

  const lcd = touched
    ? [String(touched[0]).toUpperCase(), touched[1]]
    : [`${basePreset.emoji || ""} ${basePreset.name}${changed ? " *" : ""}`.trim(),
       `${NOISE_NAMES[p.noise]}${p.toneOn ? ` + ${fmtHz(p.toneFreq)} tone` : ""} · ${fmtHz(p.highpass)}–${fmtHz(p.lowpass)}`];

  const key = (patch, label, value) => { setP(patch); touch(label, value); };

  return (
    <SynthPanel name="SS-1" subtitle="Sound shaper">
      <Lcd lines={lcd} />

      <Module title="Source">
        <KeyRow options={NOISE_OPTIONS} value={p.noise} onChange={(v) => key({ noise: v }, "Source", NOISE_NAMES[v])} />
        {p.noise !== "none" && (
          <KnobRow>
            <Knob label="Level" pos={Math.round(p.noiseLevel * 100)} max={100} onChange={(v) => setP({ noiseLevel: v / 100 })} display={pct} onTouch={touch} />
          </KnobRow>
        )}
      </Module>

      {p.noise === "rain" && (
        <Module title="Rain">
          <KeyRow options={SURFACE_OPTIONS} value={p.rainSurface} onChange={(v) => key({ rainSurface: v }, "Lands on", SURFACE_OPTIONS.find((o) => o.value === v)?.label)} />
          <KnobRow>
            <Knob label="How hard" pos={Math.round(p.rainAmount * 100)} max={100} step={5} onChange={(v) => setP({ rainAmount: v / 100 })}
              display={(v) => (v <= 15 ? `Drizzle ${v}%` : v >= 80 ? `Downpour ${v}%` : pct(v))} onTouch={touch} />
            <Knob label="Drop size" pos={Math.round(p.rainDrop * 100)} max={100} step={5} onChange={(v) => setP({ rainDrop: v / 100 })}
              display={(v) => (v <= 20 ? `Mist ${v}%` : v >= 75 ? `Big ${v}%` : pct(v))} onTouch={touch} />
            <Knob label="Closeness" pos={Math.round(p.rainClose * 100)} max={100} step={5} onChange={(v) => setP({ rainClose: v / 100 })}
              display={(v) => (v <= 20 ? `Far ${v}%` : v >= 80 ? `Near ${v}%` : pct(v))} onTouch={touch} />
          </KnobRow>
        </Module>
      )}

      <Module title="Filter">
        <KnobRow>
          <Knob label="Warmth" pos={toPos(p.lowpass, LIMITS.lowpass)} onChange={(v) => setP({ lowpass: fromPos(v, LIMITS.lowpass) })}
            display={(v) => `≤ ${fmtHz(fromPos(v, LIMITS.lowpass))}`} onTouch={touch} />
          <Knob label="Low cut" pos={toPos(p.highpass, LIMITS.highpass)} onChange={(v) => setP({ highpass: fromPos(v, LIMITS.highpass) })}
            display={(v) => `≥ ${fmtHz(fromPos(v, LIMITS.highpass))}`} onTouch={touch} />
        </KnobRow>
      </Module>

      <Module title="Tone" right={<LedKey active={p.toneOn} onClick={() => key({ toneOn: !p.toneOn }, "Tone", p.toneOn ? "Off" : "On")}>{p.toneOn ? "On" : "Off"}</LedKey>}>
        {p.toneOn ? (
          <>
            <KeyRow
              options={[{ value: "sine", label: "Smooth" }, { value: "triangle", label: "Soft buzz" }]}
              value={p.toneWave}
              onChange={(v) => key({ toneWave: v }, "Wave", v === "sine" ? "Smooth" : "Soft buzz")}
            />
            <KnobRow>
              <Knob label="Pitch" pos={toPos(p.toneFreq, LIMITS.toneFreq)} onChange={(v) => setP({ toneFreq: Math.round(fromPos(v, LIMITS.toneFreq) * 10) / 10 })}
                display={(v) => fmtHz(Math.round(fromPos(v, LIMITS.toneFreq) * 10) / 10)} onTouch={touch} />
              <Knob label="Level" pos={Math.round(p.toneLevel * 100)} max={100} onChange={(v) => setP({ toneLevel: v / 100 })} display={pct} onTouch={touch} />
              <Knob label="Binaural" pos={Math.round(p.beat * 10)} max={LIMITS.beat[1] * 10} step={5} onChange={(v) => setP({ beat: v / 10 })}
                display={(v) => (v > 0 ? `${(v / 10).toFixed(1)} Hz` : "Off")} onTouch={touch} />
            </KnobRow>
            {p.beat > 0 && <p className="text-[0.6875rem] text-muted-foreground">Each ear gets a slightly different pitch. Needs headphones.</p>}
          </>
        ) : (
          <p className="text-[0.6875rem] text-muted-foreground">A soft steady pitch under the noise, with an optional binaural beat.</p>
        )}
      </Module>

      <Module title="Movement">
        <KeyRow options={MOTION_OPTIONS} value={p.motion} onChange={(v) => key({ motion: v }, "Movement", MOTION_OPTIONS.find((o) => o.value === v)?.label)} />
        {p.motion !== "constant" && (
          <KnobRow>
            <Knob label="Depth" pos={Math.round(p.motionAmount * 100)} max={100} onChange={(v) => setP({ motionAmount: v / 100 })} display={pct} onTouch={touch} />
            <Knob label="Slowness" pos={1000 - toPos(p.motionSpeed, LIMITS.motionSpeed)}
              onChange={(v) => setP({ motionSpeed: fromPos(1000 - v, LIMITS.motionSpeed) })}
              display={(v) => `${Math.round(1 / fromPos(1000 - v, LIMITS.motionSpeed))}s a swell`} onTouch={touch} />
          </KnobRow>
        )}
        <LedSwitch label="Wind down" hint="With a timer, slowly gets quieter and darker towards the end." checked={p.windDown} onChange={(v) => key({ windDown: v }, "Wind down", v ? "On" : "Off")} />
      </Module>

      <div className="flex gap-2">
        <button type="button" onClick={onReset} disabled={!changed}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-border/70 bg-card py-2 text-[0.6875rem] font-medium uppercase tracking-wide text-foreground disabled:opacity-40 hover:bg-muted/40">
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
        {onSave && (
          <button type="button" onClick={onSave}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-md border border-primary/50 bg-card py-2 text-[0.6875rem] font-medium uppercase tracking-wide text-primary hover:bg-primary/10">
            <Save className="w-3.5 h-3.5" /> Save as my sound
          </button>
        )}
      </div>
    </SynthPanel>
  );
}
