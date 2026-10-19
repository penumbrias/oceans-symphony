import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import { BREATHING_PATTERNS, BREATHING_PACE_OPTIONS } from "@/utils/groundingDefaults";

// The Quick Support header: the 🫧 sits inside a ring that breathes with a
// chosen guided-breathing pattern at a chosen pace (the old pacer at the
// bottom of the suggestions view ran a fixed, fairly quick 5s loop). The
// choice is a per-device display preference, durable via BACKUP_LS_KEYS.

export const QUICK_SUPPORT_RING_KEY = "symphony_quick_support_ring_v1";
const DEFAULTS = { pattern: "Resonant breathing", pace: "1.25", still: false };

function readPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUICK_SUPPORT_RING_KEY) || "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULTS };
    return {
      pattern: BREATHING_PATTERNS[raw.pattern] ? raw.pattern : DEFAULTS.pattern,
      pace: BREATHING_PACE_OPTIONS.some((o) => o.value === raw.pace) ? raw.pace : DEFAULTS.pace,
      still: !!raw.still,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function writePrefs(prefs) {
  try { localStorage.setItem(QUICK_SUPPORT_RING_KEY, JSON.stringify(prefs)); } catch { /* non-fatal */ }
}

const kindOf = (label) => {
  const l = String(label || "").toLowerCase();
  if (l.includes("inhale")) return "in";
  if (l.includes("exhale")) return "out";
  if (l.includes("hold")) return "hold";
  return "natural";
};
const CUE = { in: "Breathe in", out: "Breathe out", hold: "Hold", natural: "Breathe naturally" };

function useReduceMotion() {
  const [reduce, setReduce] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("a11y-reduce-motion"));
  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => setReduce(root.classList.contains("a11y-reduce-motion")));
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return reduce;
}

export default function QuickSupportRing({ title = "Quick support", subtitle }) {
  const [prefs, setPrefs] = useState(readPrefs);
  const [showSettings, setShowSettings] = useState(false);
  const reduceMotion = useReduceMotion();
  const still = prefs.still || reduceMotion;
  const pattern = BREATHING_PATTERNS[prefs.pattern] || BREATHING_PATTERNS[DEFAULTS.pattern];
  const pace = parseFloat(prefs.pace) || 1;

  const [phaseIdx, setPhaseIdx] = useState(0);
  const [scale, setScale] = useState(0.82);
  const timer = useRef(null);

  // Walk the pattern's phases on a timeout chain. Each phase sets the ring's
  // target size and the CSS transition takes the phase's (paced) duration,
  // so the ring grows for exactly as long as the inhale lasts.
  useEffect(() => {
    clearTimeout(timer.current);
    if (still) { setScale(1); return undefined; }
    let idx = 0;
    let current = 0.82;
    const run = () => {
      const phase = pattern.phases[idx];
      const k = kindOf(phase.label);
      if (k === "in") current = 1.12;
      else if (k === "out") current = 0.82;
      else if (k === "natural") current = current > 0.97 ? 0.82 : 1.12;
      setPhaseIdx(idx);
      setScale(current);
      timer.current = setTimeout(() => {
        idx = (idx + 1) % pattern.phases.length;
        run();
      }, phase.seconds * pace * 1000);
    };
    // One frame at rest first so the opening inhale visibly grows.
    setScale(0.82);
    timer.current = setTimeout(run, 60);
    return () => clearTimeout(timer.current);
  }, [pattern, pace, still]);

  const phase = pattern.phases[phaseIdx] || pattern.phases[0];
  const duration = still ? 0.4 : phase.seconds * pace;
  const kind = kindOf(phase.label);

  const update = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    writePrefs(next);
  };

  return (
    <div className="text-center pt-4">
      <div className="relative mx-auto w-28 h-28 flex items-center justify-center select-none" aria-hidden="true">
        <div
          className="absolute inset-0 rounded-full border-2 border-primary/40"
          style={{
            background: "radial-gradient(circle, hsl(var(--primary) / 0.20) 0%, transparent 70%)",
            transform: `scale(${scale})`,
            opacity: kind === "hold" ? 0.85 : (scale > 1 ? 1 : 0.6),
            transition: `transform ${duration}s ease-in-out, opacity ${duration}s ease-in-out`,
          }}
        />
        <span className="relative text-3xl">🫧</span>
      </div>
      <h1 className="text-2xl font-semibold text-foreground mt-1">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      <div className="mt-2 flex items-center justify-center gap-1.5 text-[0.6875rem] text-muted-foreground">
        <span className="italic">{still ? "Breathe at your own pace." : `${CUE[kind]} with the ring if it helps.`}</span>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 hover:bg-muted/50 hover:text-foreground transition-colors"
          aria-expanded={showSettings}
          aria-label="Breathing ring settings"
        >
          <Settings2 className="w-3 h-3" />
          {prefs.pattern}
        </button>
      </div>

      {showSettings && (
        <div className="mt-3 mx-auto max-w-sm rounded-xl border border-border/60 bg-card p-3 space-y-3 text-left">
          <label className="block">
            <span className="text-xs font-medium text-foreground">Breathing pattern</span>
            <select
              value={prefs.pattern}
              onChange={(e) => update({ pattern: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            >
              {Object.keys(BREATHING_PATTERNS).map((name) => (
                <option key={name} value={name}>{name} ({BREATHING_PATTERNS[name].pattern})</option>
              ))}
            </select>
          </label>
          <div>
            <span className="text-xs font-medium text-foreground">Pace</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {BREATHING_PACE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => update({ pace: o.value })}
                  className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                    prefs.pace === o.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-foreground">
            <input type="checkbox" checked={prefs.still} onChange={(e) => update({ still: e.target.checked })} />
            Keep the ring still
          </label>
          {reduceMotion && !prefs.still && (
            <p className="text-[0.6875rem] text-muted-foreground">The ring stays still while Reduce motion is on.</p>
          )}
        </div>
      )}
    </div>
  );
}
