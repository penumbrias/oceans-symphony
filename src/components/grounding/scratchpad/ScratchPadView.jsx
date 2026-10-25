import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eraser, Maximize2, RotateCcw, X, GripHorizontal, SlidersHorizontal } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { PRESETS, RULES, presetById, clampRules } from "@/lib/scratchpad/particles";
import { readScratchpadPrefs, writeScratchpadPrefs } from "@/lib/scratchpad/scratchpadPrefs";
import { requestTiltPermission, tiltSupported } from "@/lib/scratchpad/tilt";
import { stopSoundscape } from "@/lib/soundscape/engine";
import { useSoundscapeState } from "@/components/grounding/soundscape/soundscapeHooks";
import { Chips, FocusSettingsSheet, SheetSection } from "@/components/grounding/focusControls";
import ScratchPadCanvas from "./ScratchPadCanvas";

// Quick Support → Scratch pad: draw a line of particles, let go, and a
// ruleset made of a few plain properties (speed kept, slowing, fading,
// pull or push between neighbours, a pull to the middle, gravity, swirl,
// springs) decides what happens. Pick a ruleset or tune each rule. Tilt
// the phone and they slide. Full screen has the same settings in a sheet.

const pct = (v) => `${Math.round(v * 100)}%`;
const RULE_ROWS = [
  { key: "carry", label: "Keeps its throw", show: pct, help: "How much of the drawing speed it keeps when you let go." },
  { key: "drag", label: "Slows down", show: (v) => (v ? v.toFixed(2) : "Never") },
  { key: "life", label: "Fades after", show: (v) => (v ? `${v}s` : "Never") },
  { key: "pull", label: "Neighbours", show: (v) => (v > 0 ? `pull ${pct(v)}` : v < 0 ? `push ${pct(-v)}` : "Ignore"), ends: ["Push apart", "Pull together"] },
  { key: "reach", label: "How near counts", show: (v) => `${Math.round(v)}`, when: (r) => r.pull !== 0 },
  { key: "center", label: "Middle", show: (v) => (v > 0 ? `in ${pct(v)}` : v < 0 ? `out ${pct(-v)}` : "Off"), ends: ["Pushed out", "Pulled in"] },
  { key: "gravity", label: "Gravity", show: (v) => (v ? pct(v) : "Off") },
  { key: "spin", label: "Swirl", show: (v) => (v ? pct(v) : "Off"), help: "Each particle turns the others round it. Draw the other way to turn the other way." },
  { key: "tether", label: "Springs back to the line", show: (v) => (v ? pct(v) : "Off") },
  { key: "link", label: "Holds together", show: (v) => (v ? pct(v) : "Off") },
  { key: "jitter", label: "Jitter", show: (v) => (v ? pct(v) : "Off") },
];
const EDGE_OPTIONS = [
  { value: "bounce", label: "Bounce" },
  { value: "wrap", label: "Wrap round" },
  { value: "fade", label: "Drift off" },
];
const COLOR_OPTIONS = [
  { value: "speed", label: "By speed" },
  { value: "age", label: "By age" },
  { value: "theme", label: "One colour" },
];
const TILT_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "nudge", label: "When I tilt" },
  { value: "gravity", label: "Down is down" },
];
const TILT_HELP = {
  off: "Tilting the phone does nothing.",
  nudge: "Tilt the phone and they slide that way, then settle back to the rules when you hold still.",
  gravity: "They always fall towards whichever edge is lowest, like sand in a jar.",
};

const sameRules = (a, b) => Object.keys(RULES).every((k) => Math.abs(a[k] - b[k]) < 1e-9) && a.edges === b.edges;

// The pad's settings and the ways to change them, shared by the screen
// and the full-screen sheet.
function useScratchpad() {
  const [prefs, setPrefs] = useState(readScratchpadPrefs);
  const [tiltNote, setTiltNote] = useState(null);
  const save = (next) => { setPrefs(next); writeScratchpadPrefs(next); };
  const preset = presetById(prefs.presetId);
  const changed = !sameRules(prefs.rules, clampRules(preset.rules));
  return {
    prefs, save, preset, changed, tiltNote,
    setRule: (patch) => save({ ...prefs, rules: clampRules({ ...prefs.rules, ...patch }) }),
    pickPreset: (id) => save({ ...prefs, presetId: id, rules: clampRules(presetById(id).rules) }),
    // Called from the chip's tap, which is what iOS needs to ask.
    setTilt: async (mode) => {
      setTiltNote(null);
      if (mode !== "off" && !(await requestTiltPermission())) {
        setTiltNote("Motion access wasn't allowed, so tilt stays off.");
        return;
      }
      save({ ...prefs, tilt: mode });
    },
  };
}

function RulesetPicker({ pad }) {
  const { prefs, preset, changed, pickPreset } = pad;
  return (
    <>
      <Chips options={PRESETS.map((p) => ({ value: p.id, label: p.name }))} value={changed ? null : prefs.presetId} onChange={pickPreset} />
      <p className="text-[0.6875rem] text-muted-foreground">{changed ? `${preset.name}, tuned by you.` : preset.help}</p>
    </>
  );
}

function TiltControls({ pad }) {
  const { prefs, save, setTilt, tiltNote } = pad;
  if (!tiltSupported()) {
    return <p className="text-[0.6875rem] text-muted-foreground">This device doesn't share its tilt, so this one is phones and tablets only.</p>;
  }
  return (
    <div className="space-y-2">
      <Chips options={TILT_OPTIONS} value={prefs.tilt} onChange={setTilt} />
      <p className="text-[0.6875rem] text-muted-foreground">{tiltNote || TILT_HELP[prefs.tilt]}</p>
      {prefs.tilt !== "off" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">How strongly</span>
            <span className="text-muted-foreground tabular-nums">{pct(prefs.tiltStrength)}</span>
          </div>
          <Slider min={0.1} max={1} step={0.05} value={[prefs.tiltStrength]} onValueChange={([v]) => save({ ...prefs, tiltStrength: v })} aria-label="Tilt strength" />
        </div>
      )}
    </div>
  );
}

function LookControls({ pad }) {
  const { prefs, save } = pad;
  return (
    <>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">Colour</p>
        <Chips options={COLOR_OPTIONS} value={prefs.color} onChange={(v) => save({ ...prefs, color: v })} />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Trails</span>
          <span className="text-muted-foreground tabular-nums">{prefs.trails ? pct(prefs.trails) : "Off"}</span>
        </div>
        <Slider min={0} max={0.9} step={0.05} value={[prefs.trails]} onValueChange={([v]) => save({ ...prefs, trails: v })} aria-label="Trails" />
      </div>
    </>
  );
}

function RuleSliders({ pad }) {
  const { prefs, setRule } = pad;
  return (
    <>
      {RULE_ROWS.filter((row) => !row.when || row.when(prefs.rules)).map((row) => {
        const lim = RULES[row.key];
        const v = prefs.rules[row.key];
        return (
          <div key={row.key} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{row.label}</span>
              <span className="text-muted-foreground tabular-nums">{row.show(v)}</span>
            </div>
            <Slider min={lim.min} max={lim.max} step={lim.step} value={[v]} onValueChange={([nv]) => setRule({ [row.key]: nv })} aria-label={row.label} />
            {row.ends && (
              <div className="flex justify-between text-[0.625rem] text-muted-foreground"><span>{row.ends[0]}</span><span>{row.ends[1]}</span></div>
            )}
            {row.help && <p className="text-[0.6875rem] text-muted-foreground">{row.help}</p>}
          </div>
        );
      })}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground">At the edges</p>
        <Chips options={EDGE_OPTIONS} value={prefs.rules.edges} onChange={(v) => setRule({ edges: v })} />
      </div>
    </>
  );
}

function ResetButton({ pad }) {
  const { preset, changed, pickPreset } = pad;
  return (
    <button type="button" onClick={() => pickPreset(preset.id)} disabled={!changed}
      className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-border/60 py-2 text-xs font-medium text-foreground disabled:opacity-50 hover:bg-muted/40">
      <RotateCcw className="w-3.5 h-3.5" /> Reset to {preset.name}
    </button>
  );
}

const pillClass = "flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1.5 text-sm text-white backdrop-blur";

function Focus({ pad, onExit }) {
  const { prefs, preset, changed } = pad;
  const padRef = useRef(null);
  const [showControls, setShowControls] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const sound = useSoundscapeState();
  const hide = useRef(null);
  const poke = () => {
    setShowControls(true);
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setShowControls(false), 3500);
  };
  useEffect(() => {
    let lock = null;
    let cancelled = false;
    poke();
    (async () => {
      try {
        const l = await navigator.wakeLock?.request?.("screen");
        if (cancelled) l?.release?.(); else lock = l;
      } catch { /* screen may sleep */ }
    })();
    return () => {
      cancelled = true;
      clearTimeout(hide.current);
      try { lock?.release?.(); } catch { /* released */ }
    };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (settingsOpen) setSettingsOpen(false); else onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, onExit]);
  // Controls stay up while the sheet is open.
  useEffect(() => { if (settingsOpen) { clearTimeout(hide.current); setShowControls(true); } else poke(); }, [settingsOpen]);

  const shown = showControls || settingsOpen;
  const tap = { pointerEvents: shown ? "auto" : "none" };

  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-black select-none" role="dialog" aria-label="Scratch pad, full screen" onPointerDown={settingsOpen ? undefined : poke}>
      <ScratchPadCanvas ref={padRef} rules={prefs.rules} color={prefs.color} trails={prefs.trails} tilt={prefs.tilt} tiltStrength={prefs.tiltStrength} />
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-4 transition-opacity duration-700 pointer-events-none"
        style={{ paddingTop: "calc(var(--os-sat, 0px) + 12px)", opacity: shown ? 1 : 0 }}
      >
        <span className="text-sm text-white/60 truncate">{changed ? `${preset.name} · tuned` : preset.name}</span>
        <div className="flex gap-2 flex-shrink-0" style={tap}>
          <button type="button" onClick={() => padRef.current?.clear()} className={pillClass}>
            <Eraser className="w-4 h-4" /> Clear
          </button>
          <button type="button" onClick={onExit} className={pillClass}>
            <X className="w-4 h-4" /> Leave
          </button>
        </div>
      </div>
      <div
        className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 px-4 transition-opacity duration-700 pointer-events-none"
        style={{ paddingBottom: "calc(var(--os-sab, 0px) + 20px)", opacity: shown && !settingsOpen ? 1 : 0 }}
      >
        <div className="flex gap-2" style={{ pointerEvents: shown && !settingsOpen ? "auto" : "none" }}>
          {sound.playing && (
            <button type="button" onClick={() => stopSoundscape()} className={pillClass}>Stop sound</button>
          )}
          <button type="button" onClick={() => setSettingsOpen(true)} className={pillClass}>
            <SlidersHorizontal className="w-4 h-4" /> Settings
          </button>
        </div>
      </div>
      {settingsOpen && (
        <FocusSettingsSheet title="Scratch pad settings" onClose={() => setSettingsOpen(false)}>
          <SheetSection title="Ruleset"><RulesetPicker pad={pad} /></SheetSection>
          <SheetSection title="Tilt"><TiltControls pad={pad} /></SheetSection>
          <SheetSection title="Look"><LookControls pad={pad} /></SheetSection>
          <SheetSection title="Tune the rules">
            <RuleSliders pad={pad} />
            <ResetButton pad={pad} />
          </SheetSection>
        </FocusSettingsSheet>
      )}
    </div>,
    document.body,
  );
}

export default function ScratchPadView({ onBack }) {
  const pad = useScratchpad();
  const { prefs, changed } = pad;
  const [focus, setFocus] = useState(false);
  const [height, setHeight] = useState(() => Math.round(Math.min(420, window.innerHeight * 0.5)));
  const padRef = useRef(null);
  const drag = useRef(null);
  const topRef = useRef(null);

  // Opened from further down the Support list: start at the top.
  useEffect(() => { topRef.current?.scrollIntoView?.({ block: "start" }); }, []);

  // Drag the grip under the pad to make it taller or shorter.
  const onGripDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { y: e.clientY, h: height };
  };
  const onGripMove = (e) => {
    if (!drag.current) return;
    const max = Math.round(window.innerHeight * 0.85);
    setHeight(Math.max(180, Math.min(max, drag.current.h + e.clientY - drag.current.y)));
  };
  const onGripUp = () => { drag.current = null; };

  // The tap that opens full screen is also the chance iOS needs to ask
  // for motion access.
  const openFocus = () => {
    if (prefs.tilt !== "off") requestTiltPermission();
    setFocus(true);
  };

  if (focus) return <Focus pad={pad} onExit={() => setFocus(false)} />;

  return (
    <div ref={topRef} className="max-w-lg mx-auto p-4 space-y-5 scroll-mt-24" data-tour="grounding-scratchpad-view">
      <div>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 transition-colors">
          ← Back to Quick Support
        </button>
        <h2 className="text-lg font-semibold text-foreground">Scratch pad</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Draw a line, let go, and watch a few simple rules move it.</p>
      </div>

      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <div style={{ height }} className="bg-black">
          <ScratchPadCanvas ref={padRef} rules={prefs.rules} color={prefs.color} trails={prefs.trails} tilt={prefs.tilt} tiltStrength={prefs.tiltStrength} />
        </div>
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to resize the pad"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          className="flex justify-center py-1 cursor-ns-resize touch-none text-muted-foreground/70 hover:text-foreground border-t border-border/40"
        >
          <GripHorizontal className="w-5 h-5" />
        </div>
        <div className="px-3 pb-3 pt-1 flex gap-2">
          <button type="button" onClick={() => padRef.current?.clear()}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border/60 py-2 text-xs font-medium text-foreground hover:bg-muted/40">
            <Eraser className="w-3.5 h-3.5" /> Clear
          </button>
          <button type="button" onClick={openFocus}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border/60 py-2 text-xs font-medium text-foreground hover:bg-muted/40">
            <Maximize2 className="w-3.5 h-3.5" /> Full screen
          </button>
        </div>
      </div>

      <div className="space-y-2" data-tour="grounding-scratchpad-rules">
        <p className="text-xs font-medium text-foreground">Ruleset</p>
        <RulesetPicker pad={pad} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Tilt the phone</p>
        <TiltControls pad={pad} />
      </div>

      <details className="rounded-xl border border-border/60 bg-card p-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground select-none">
          Tune the rules{changed ? " · changed" : ""}
        </summary>
        <div className="space-y-4 mt-4">
          <RuleSliders pad={pad} />
          <div className="border-t border-border/40 pt-3 space-y-3">
            <LookControls pad={pad} />
          </div>
          <ResetButton pad={pad} />
        </div>
      </details>
    </div>
  );
}
