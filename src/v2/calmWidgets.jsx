// Calm widgets (v0.320.0): the Quick Support page's Scratch pad and
// Soundscape as widgets, so the thing itself sits on the page instead of
// a link to it. Both reuse the Support screens' own hooks and pieces
// (useScratchpad / ScratchPadFocus, useSoundscapeControls and its rows),
// never a copy: the sound engine is one global thing, and the pad's
// settings are the same saved settings the Support page edits.
//
// Widget contract: one Section per widget, em text, accent through
// var(--v2-accent). The canvases measure their box themselves.

import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eraser, Maximize2, Play, Square, Timer } from "lucide-react";
import { Section, Muted, TextAction, WidgetModeContext } from "@/v2/primitives";
import { useT } from "@/lib/i18n";
import { PRESETS as PAD_PRESETS, presetById, clampRules } from "@/lib/scratchpad/particles";
import ScratchPadCanvas from "@/components/grounding/scratchpad/ScratchPadCanvas";
import { useScratchpad, ScratchPadFocus, RulesetPicker } from "@/components/grounding/scratchpad/ScratchPadView";
import { requestTiltPermission } from "@/lib/scratchpad/tilt";
import { startSoundscape, stopSoundscape } from "@/lib/soundscape/engine";
import SoundscapeVisualizer from "@/components/grounding/soundscape/SoundscapeVisualizer";
import {
  useSoundscapeControls, VolumeRow, SoundPresetGrid, TimerRow, VISUAL_OPTIONS,
} from "@/components/grounding/soundscape/soundscapeControls";
import { useSoundscapeState, useRemaining, fmtClock, useSoundscapeWidgetMounted } from "@/components/grounding/soundscape/soundscapeHooks";

const isPreview = (instanceId) => typeof instanceId === "string" && instanceId.startsWith("preview_");

// ── Scratch pad ────────────────────────────────────────────────────────

const FOLLOW = ""; // option value: "as set on the Support page"

const PAD_COLOR_OPTIONS = [
  { value: FOLLOW, label: "As on the Support page" },
  { value: "speed", label: "By speed" },
  { value: "age", label: "By age" },
  { value: "theme", label: "One colour" },
];
const PAD_TILT_OPTIONS = [
  { value: FOLLOW, label: "As on the Support page" },
  { value: "off", label: "Off" },
  { value: "nudge", label: "When I tilt" },
  { value: "gravity", label: "Down is down" },
];

// The widget's pad: the Support page's saved pad, with whatever this
// widget sets in its options laid over it. The result has the same shape
// as useScratchpad(), so the full-screen view's settings sheet works on
// it: a change to a rule the widget owns (ruleset picked here) is saved
// into the widget's settings; everything else goes to the shared pad.
function useWidgetPad(settings, updateSettings) {
  const shared = useScratchpad();
  const ownRules = !!settings?.ruleset;
  const trailsPct = Number(settings?.trails);
  const prefs = useMemo(() => {
    const preset = ownRules ? presetById(settings.ruleset) : presetById(shared.prefs.presetId);
    const rules = ownRules
      ? clampRules(settings.rules && typeof settings.rules === "object" ? settings.rules : preset.rules)
      : shared.prefs.rules;
    return {
      ...shared.prefs,
      presetId: preset.id,
      rules,
      color: settings?.color || shared.prefs.color,
      tilt: settings?.tilt || shared.prefs.tilt,
      trails: Number.isFinite(trailsPct) ? Math.min(0.9, Math.max(0, trailsPct / 100)) : shared.prefs.trails,
    };
  }, [shared.prefs, ownRules, settings?.ruleset, settings?.rules, settings?.color, settings?.tilt, trailsPct]);
  const preset = presetById(prefs.presetId);
  const changed = Object.keys(preset.rules).some((k) => prefs.rules[k] !== clampRules(preset.rules)[k]);
  const save = (next) => {
    const patch = {};
    if (next.color !== prefs.color) patch.color = next.color;
    if (next.tilt !== prefs.tilt) patch.tilt = next.tilt;
    if (next.trails !== prefs.trails) patch.trails = Math.round(next.trails * 100);
    if (next.tiltStrength !== prefs.tiltStrength) shared.save({ ...shared.prefs, tiltStrength: next.tiltStrength });
    // Colour / tilt / trails the widget already owns stay the widget's;
    // the rest is a shared-pad change.
    const ownKeys = Object.keys(patch).filter((k) => (k === "trails" ? Number.isFinite(trailsPct) : !!settings?.[k]) || ownRules);
    const sharedPatch = { ...shared.prefs };
    for (const k of Object.keys(patch)) {
      if (ownKeys.includes(k)) continue;
      sharedPatch[k] = next[k];
      delete patch[k];
    }
    if (Object.keys(patch).length) updateSettings?.(patch);
    if (sharedPatch !== shared.prefs && Object.keys(sharedPatch).some((k) => sharedPatch[k] !== shared.prefs[k])) shared.save(sharedPatch);
  };
  return {
    prefs, preset, changed, tiltNote: shared.tiltNote, save,
    setRule: (patch) => {
      const rules = clampRules({ ...prefs.rules, ...patch });
      if (ownRules) updateSettings?.({ rules }); else shared.setRule(patch);
    },
    pickPreset: (id) => {
      if (ownRules) updateSettings?.({ ruleset: id, rules: null }); else shared.pickPreset(id);
    },
    setTilt: async (mode) => {
      if (settings?.tilt) {
        if (mode !== "off" && !(await requestTiltPermission())) return;
        updateSettings?.({ tilt: mode });
      } else await shared.setTilt(mode);
    },
  };
}

function ScratchPadWidget({ settings, updateSettings, instanceId, mode = "normal" }) {
  const tr = useT();
  const navigate = useNavigate();
  const pad = useWidgetPad(settings, updateSettings);
  const { prefs, preset, changed } = pad;
  const padRef = useRef(null);
  const [focus, setFocus] = useState(false);
  const preview = isPreview(instanceId);

  const openFocus = () => {
    if (prefs.tilt !== "off") requestTiltPermission();
    setFocus(true);
  };

  const action = mode === "minimal" ? null : (
    <span className="flex items-center gap-3">
      <TextAction onClick={() => padRef.current?.clear()}><Eraser className="w-3 h-3 inline -mt-0.5 mr-0.5" />{tr("widget.pad.clear")}</TextAction>
      <TextAction onClick={openFocus}><Maximize2 className="w-3 h-3 inline -mt-0.5 mr-0.5" />{tr("widget.pad.full")}</TextAction>
    </span>
  );

  return (
    <Section label={tr("widget.pad.label")} action={action}>
      <div
        className="flex-1 min-h-0 w-full overflow-hidden"
        style={{ minHeight: 72, borderRadius: "var(--v2-radius, 10px)", background: "hsl(var(--primary) / 0.06)" }}
      >
        {preview
          ? <div className="w-full h-full flex items-center justify-center"><Muted>{tr("widget.pad.preview")}</Muted></div>
          : <ScratchPadCanvas ref={padRef} rules={prefs.rules} color={prefs.color} trails={prefs.trails} tilt={prefs.tilt} tiltStrength={prefs.tiltStrength} />}
      </div>
      {mode === "expanded" && (
        <div className="flex-shrink-0 pt-1 space-y-1">
          <RulesetPicker pad={pad} />
        </div>
      )}
      {mode === "normal" && (
        <div className="flex-shrink-0 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground truncate">{changed ? tr("widget.pad.tuned", { name: preset.name }) : preset.name}</span>
          <TextAction onClick={() => navigate("/grounding?view=scratchpad")}>{tr("widget.today.open")}</TextAction>
        </div>
      )}
      {focus && <ScratchPadFocus pad={pad} onExit={() => setFocus(false)} />}
    </Section>
  );
}

// ── Soundscape ─────────────────────────────────────────────────────────

const SOUND_VISUAL_OPTIONS = [{ value: FOLLOW, label: "As on the Support page" }, ...VISUAL_OPTIONS];

function SoundscapeWidget({ settings, instanceId, mode = "normal" }) {
  const tr = useT();
  const navigate = useNavigate();
  const ctl = useSoundscapeControls();
  const { prefs, p, basePreset } = ctl;
  const playing = useSoundscapeState();
  const remaining = useRemaining(playing.endsAt);
  const [error, setError] = useState(null);
  const preview = isPreview(instanceId);
  const fractalClock = useRef(0);
  useSoundscapeWidgetMounted();

  const visual = settings?.visual || prefs.visual;
  const showVolume = settings?.showVolume !== false;
  const showTimer = settings?.showTimer !== false && mode === "expanded";

  const play = async () => {
    setError(null);
    try {
      await startSoundscape(p, { minutes: prefs.timer });
    } catch (e) {
      setError(e?.message || tr("widget.sound.failed"));
    }
  };
  const toggle = () => (playing.playing ? stopSoundscape() : play());

  const playButton = (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing.playing ? tr("widget.sound.stop") : tr("widget.sound.play")}
      className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full text-primary-foreground"
      style={{ background: "var(--v2-accent, hsl(var(--primary)))" }}
    >
      {playing.playing ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
    </button>
  );
  const status = (
    <span className="min-w-0 flex-1">
      <span className="block text-sm truncate">{basePreset.emoji} {basePreset.name}</span>
      <span className="block text-xs text-muted-foreground truncate">
        {playing.playing
          ? (remaining != null ? tr("widget.sound.left", { time: fmtClock(remaining) }) : tr("widget.sound.playing"))
          : (prefs.timer ? tr("widget.sound.timerSet", { min: prefs.timer }) : tr("widget.sound.idle"))}
      </span>
    </span>
  );

  if (mode === "minimal") {
    return (
      <Section label={tr("widget.sound.label")}>
        <div className="flex items-center gap-2">{playButton}{status}</div>
        {error && <Muted>{error}</Muted>}
      </Section>
    );
  }

  return (
    <Section label={tr("widget.sound.label")}
      action={<TextAction onClick={() => navigate("/grounding?view=soundscape")}>{tr("widget.today.open")}</TextAction>}>
      <div
        className="flex-1 min-h-0 w-full overflow-hidden relative"
        style={{ minHeight: 56, borderRadius: "var(--v2-radius, 10px)", background: "hsl(var(--primary) / 0.06)" }}
      >
        {preview
          ? <div className="w-full h-full flex items-center justify-center"><Muted>{tr("widget.sound.preview")}</Muted></div>
          : <SoundscapeVisualizer params={p} detail={visual} starSpeed={prefs.starSpeed} fractal={prefs.fractal} clockRef={fractalClock} className="w-full h-full" />}
      </div>
      <div className="flex-shrink-0 flex items-center gap-2">{playButton}{status}</div>
      {showVolume && <div className="flex-shrink-0"><VolumeRow ctl={ctl} compact /></div>}
      {error && <Muted>{error}</Muted>}
      {mode === "expanded" && (
        <div className="flex-shrink-0 space-y-2 pt-1">
          <SoundPresetGrid ctl={ctl} />
          {showTimer && (
            <div className="flex items-start gap-2">
              <Timer className="w-3.5 h-3.5 mt-1 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0 flex-1"><TimerRow ctl={ctl} /></div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// ── Registry entries ───────────────────────────────────────────────────

export const CALM_WIDGETS = {
  scratch_pad: {
    label: "Scratch pad",
    description: "Quick Support's particle pad on the page: draw a line, let go, and the rules move it. Normal adds Clear and Full screen; expanded adds the ruleset chips.",
    icon: Eraser, category: "support",
    subjects: ["home", "alter", "group", "contact", "location"],
    // The mode goes in as a prop AND as the context the primitives read
    // (Row drops its icon column in minimal).
    render: ({ settings, updateSettings, instanceId, mode }) => (
      <WidgetModeContext.Provider value={mode || "normal"}>
        <ScratchPadWidget settings={settings} updateSettings={updateSettings} instanceId={instanceId} mode={mode || "normal"} />
      </WidgetModeContext.Provider>
    ),
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    configFields: [
      { key: "ruleset", type: "select", label: "Ruleset", default: FOLLOW,
        help: "Pick one here to give this widget its own rules; tune them in Full screen → Settings.",
        options: [{ value: FOLLOW, label: "As on the Support page" }, ...PAD_PRESETS.map((pr) => ({ value: pr.id, label: pr.name }))] },
      { key: "color", type: "select", label: "Colour", default: FOLLOW, options: PAD_COLOR_OPTIONS },
      { key: "trails", type: "range", label: "Trails", min: 0, max: 90, default: 60, unit: "%" },
      { key: "tilt", type: "select", label: "Tilt the phone", default: FOLLOW, options: PAD_TILT_OPTIONS },
    ],
    defaultSpan: { cols: 6, rows: 4 }, minSpan: { cols: 2, rows: 2 }, maxSpan: { cols: 12, rows: 12 },
  },
  soundscape: {
    label: "Soundscape",
    description: "Play or stop the Soundscape and watch it, with the timer counting down and the volume to hand. Expanded adds the sound presets and the timer.",
    icon: Play, category: "support",
    subjects: ["home", "alter", "group", "contact", "location"],
    render: ({ settings, instanceId, mode }) => (
      <WidgetModeContext.Provider value={mode || "normal"}>
        <SoundscapeWidget settings={settings} instanceId={instanceId} mode={mode || "normal"} />
      </WidgetModeContext.Provider>
    ),
    supportsModes: ["minimal", "normal", "expanded"], supportsMultiInstance: true,
    configFields: [
      { key: "visual", type: "select", label: "Visual", default: FOLLOW, options: SOUND_VISUAL_OPTIONS },
      { key: "showVolume", type: "toggle", label: "Show the volume slider", default: true },
      { key: "showTimer", type: "toggle", label: "Show the timer (expanded)", default: true },
    ],
    defaultSpan: { cols: 6, rows: 3 }, minSpan: { cols: 2, rows: 1 }, maxSpan: { cols: 12, rows: 10 },
  },
};
