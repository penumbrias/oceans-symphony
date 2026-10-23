import { useEffect, useState } from "react";
import {
  FRACTAL_KINDS, FRACTAL_KIND_LABELS, FRACTAL_LIMITS, FRACTAL_PRESETS, MANDEL_SPOTS, FORMULA_MAX,
  clampFractal, compileFormula, fractalEquation, juliaC,
} from "@/lib/soundscape/fractals";
import { SynthPanel, Module, Lcd, KeyRow, Knob, KnobRow, LedKey, LedSwitch } from "./synthControls";

// Settings for the Fractal visual, on the same hardware-style panel as
// the sound shaper. The LCD writes out the equation being drawn, with
// its numbers as they are right now. Every value is clamped to ranges
// where the picture stays a picture.

const FORMULA_EXAMPLES = ["z^2 + c", "z^3 + c", "z^3 - z + c", "z^2 + 0.04/z + c", "z^4 + c", "conj(z)^2 + c"];

// Integer knob positions for decimal values.
const dec = (lo, hi, steps = 200) => ({
  toPos: (v) => Math.round(((v - lo) / (hi - lo)) * steps),
  fromPos: (p) => lo + (p / steps) * (hi - lo),
  steps,
});

function useEquation(fractal, clockRef) {
  const [eq, setEq] = useState(() => fractalEquation(fractal, clockRef?.current || 0));
  useEffect(() => {
    const tick = () => setEq(fractalEquation(fractal, clockRef?.current || 0));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [fractal, clockRef]);
  return eq;
}

function DecKnob({ label, value, range, onChange, format = (v) => v.toFixed(2), steps }) {
  const m = dec(range[0], range[1], steps);
  return <Knob label={label} pos={m.toPos(value)} max={m.steps} onChange={(p) => onChange(m.fromPos(p))} display={(p) => format(m.fromPos(p))} />;
}

function NumberField({ label, value, onChange }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <label className="flex-1 min-w-0 space-y-1">
      <span className="block text-[0.5625rem] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="0.001"
        min={FRACTAL_LIMITS.cr[0]}
        max={FRACTAL_LIMITS.cr[1]}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 font-mono text-xs text-primary"
      />
    </label>
  );
}

export default function FractalPanel({ fractal, presetId, onChange, clockRef }) {
  const f = fractal;
  const eq = useEquation(f, clockRef);
  const [formula, setFormula] = useState(f.formula);
  useEffect(() => { setFormula(f.formula); }, [f.formula]);
  const compiled = f.kind === "custom" ? compileFormula(formula) : { ok: true };

  const set = (patch) => onChange(clampFractal({ ...f, ...patch }), null);
  const preset = FRACTAL_PRESETS.find((x) => x.id === presetId);
  const holdHere = () => {
    const [cr, ci] = juliaC(f.kind === "custom" ? { ...f, power: 2 } : f, clockRef?.current || 0);
    set({ hold: true, cr: Math.round(cr * 10000) / 10000, ci: Math.round(ci * 10000) / 10000 });
  };
  const showC = f.kind === "julia" || (f.kind === "custom" && f.formulaMode === "julia");

  return (
    <SynthPanel name="FX-1" subtitle={preset ? preset.name : "Fractal · your settings"}>
      <Lcd lines={eq} />

      <Module title="Presets">
        <div className="flex flex-wrap gap-1.5">
          {FRACTAL_PRESETS.map((x) => (
            <LedKey key={x.id} active={presetId === x.id} onClick={() => onChange(x.fractal, x.id)}>{x.name}</LedKey>
          ))}
        </div>
      </Module>

      <Module title="Algorithm">
        <KeyRow options={FRACTAL_KINDS.map((k) => ({ value: k, label: FRACTAL_KIND_LABELS[k] }))} value={f.kind} onChange={(v) => set({ kind: v })} />

        {f.kind === "custom" && (
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="block text-[0.5625rem] font-semibold uppercase tracking-wider text-muted-foreground">z ← (your formula, in z and c)</span>
              <input
                type="text"
                value={formula}
                maxLength={FORMULA_MAX}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={(e) => {
                  setFormula(e.target.value);
                  if (compileFormula(e.target.value).ok) set({ formula: e.target.value });
                }}
                aria-invalid={!compiled.ok}
                aria-label="Fractal formula"
                className="w-full rounded-md border border-border/60 bg-background px-2.5 py-2 font-mono text-sm text-primary"
                style={{ textShadow: "0 0 6px hsl(var(--primary) / 0.4)" }}
              />
            </label>
            {!compiled.ok && <p className="text-[0.6875rem] text-destructive">{compiled.error}</p>}
            <div className="flex flex-wrap gap-1">
              {FORMULA_EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => { setFormula(ex); set({ formula: ex }); }}
                  className="rounded border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground hover:text-foreground">
                  {ex}
                </button>
              ))}
            </div>
            <p className="text-[0.6875rem] text-muted-foreground">
              Use + − * / ^, brackets, i, and sin cos tan sinh cosh exp log sqrt conj abs. Each point is repeated through the formula and coloured by how quickly it flies away.
            </p>
            <KeyRow
              options={[{ value: "julia", label: "z starts at the point" }, { value: "mandelbrot", label: "c is the point" }]}
              value={f.formulaMode}
              onChange={(v) => set({ formulaMode: v })}
            />
          </div>
        )}

        {f.kind === "mandelbrot" && (
          <KeyRow options={Object.entries(MANDEL_SPOTS).map(([k, s]) => ({ value: k, label: s.label }))} value={f.spot} onChange={(v) => set({ spot: v })} />
        )}

        <KnobRow>
          {(f.kind === "julia" || f.kind === "mandelbrot") && (
            <Knob label="Power" pos={f.power} min={FRACTAL_LIMITS.power[0]} max={FRACTAL_LIMITS.power[1]} onChange={(v) => set({ power: v })} display={(v) => `z^${v}`} />
          )}
          {f.kind === "julia" && !f.hold && (
            <DecKnob label="Reach" value={f.reach} range={FRACTAL_LIMITS.reach} steps={50} onChange={(v) => set({ reach: v })} format={(v) => `${Math.round(v * 100)}%`} />
          )}
          {f.kind === "mandelbrot" && (
            <Knob label="Depth" pos={Math.round(Math.log(f.depth) * 100)} min={Math.round(Math.log(FRACTAL_LIMITS.depth[0]) * 100)} max={Math.round(Math.log(FRACTAL_LIMITS.depth[1]) * 100)}
              onChange={(v) => set({ depth: Math.round(Math.exp(v / 100)) })} display={(v) => `×${Math.round(Math.exp(v / 100))}`} />
          )}
          {f.kind === "newton" && (
            <>
              <Knob label="Roots" pos={f.nroots} min={FRACTAL_LIMITS.nroots[0]} max={FRACTAL_LIMITS.nroots[1]} onChange={(v) => set({ nroots: v })} display={(v) => `z^${v} = 1`} />
              <DecKnob label="Swirl" value={f.swirl} range={FRACTAL_LIMITS.swirl} steps={90} onChange={(v) => set({ swirl: v })} />
            </>
          )}
          {f.kind === "phoenix" && (
            <>
              <DecKnob label="p" value={f.p} range={FRACTAL_LIMITS.p} onChange={(v) => set({ p: v })} format={(v) => v.toFixed(3)} />
              <DecKnob label="q" value={f.q} range={FRACTAL_LIMITS.q} onChange={(v) => set({ q: v })} format={(v) => v.toFixed(3).replace("-", "−")} />
            </>
          )}
        </KnobRow>

        {showC && (
          <div className="space-y-2">
            <LedSwitch label="Hold c still" hint={f.hold ? "c stays where you set it." : "c drifts slowly round the edge of the set."} checked={f.hold} onChange={(v) => (v ? holdHere() : set({ hold: false }))} />
            {f.hold && (
              <div className="flex gap-2">
                <NumberField label="c, real part" value={f.cr} onChange={(v) => set({ cr: v })} />
                <NumberField label="c, imaginary part" value={f.ci} onChange={(v) => set({ ci: v })} />
              </div>
            )}
          </div>
        )}
      </Module>

      <Module title="Look">
        <KnobRow>
          <DecKnob label="Speed" value={f.speed} range={FRACTAL_LIMITS.speed} steps={40} onChange={(v) => set({ speed: v })} format={(v) => (v < 0.01 ? "Still" : `×${v.toFixed(2)}`)} />
          <DecKnob label="Zoom" value={f.zoom} range={FRACTAL_LIMITS.zoom} steps={70} onChange={(v) => set({ zoom: v })} format={(v) => `×${v.toFixed(2)}`} />
          <Knob label="Colours" pos={f.spread} max={FRACTAL_LIMITS.spread[1]} step={5} onChange={(v) => set({ spread: v })} display={(v) => `${v}°`} />
          <Knob label="Detail" pos={f.detail} min={FRACTAL_LIMITS.detail[0]} max={FRACTAL_LIMITS.detail[1]} step={4} onChange={(v) => set({ detail: v })} display={(v) => `${v} steps`} />
        </KnobRow>
      </Module>
    </SynthPanel>
  );
}
