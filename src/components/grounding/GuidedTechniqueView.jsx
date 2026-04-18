import { useState, useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, Star, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORY_EMOJIS } from "@/utils/groundingDefaults";

const LS_STEP_MODE = "symphony_grounding_step_mode";

function formatDuration(seconds) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

export default function GuidedTechniqueView({
  technique,
  preference,
  currentAlter,
  alters = [],
  onBack,
  onRate,
  onSaveNote,
  onToggleFavorite,
}) {
  const [stepMode, setStepMode] = useState(() => {
    try { return localStorage.getItem(LS_STEP_MODE) || "one"; } catch { return "one"; }
  });
  const [stepIdx, setStepIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(technique.duration_seconds || 0);
  const [timerRunning, setTimerRunning] = useState(true);
  const [done, setDone] = useState(false);
  const [ratingHover, setRatingHover] = useState(0);
  const [note, setNote] = useState(preference?.notes || "");
  const [noteSaved, setNoteSaved] = useState(false);
  const [selectedAlterId, setSelectedAlterId] = useState(currentAlter?.id || null);
  const timerRef = useRef(null);

  const steps = technique.steps || [];
  const emoji = CATEGORY_EMOJIS[technique.category] || "✨";

  useEffect(() => {
    if (!timerRunning || done || timeLeft <= 0) {
      clearInterval(timerRef.current);
      if (timeLeft <= 0 && timerRunning) setDone(true);
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); setDone(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [timerRunning, done]);

  const toggleStepMode = () => {
    const next = stepMode === "one" ? "all" : "one";
    setStepMode(next);
    try { localStorage.setItem(LS_STEP_MODE, next); } catch {}
  };

  const handleRate = (r) => {
    onRate?.(technique, r, selectedAlterId);
  };

  const handleSaveNote = () => {
    onSaveNote?.(technique, note, selectedAlterId);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  const rating = preference?.rating || 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xl">{emoji}</span>
          <h2 className="font-semibold text-foreground">{technique.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleStepMode}
            className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-colors">
            {stepMode === "one" ? "Show all" : "One at a time"}
          </button>
          {timerRunning && !done && (
            <button onClick={() => setTimerRunning(v => !v)}
              className="text-xs px-2 py-1 rounded-lg border border-border text-muted-foreground hover:bg-muted/40">
              Pause timer
            </button>
          )}
        </div>
      </div>

      {/* Timer bar */}
      {technique.duration_seconds > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Time remaining</span>
            <span>{formatDuration(timeLeft)}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/60 rounded-full transition-all duration-1000"
              style={{ width: `${(timeLeft / (technique.duration_seconds || 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {technique.description && (
        <p className="text-sm text-muted-foreground mb-4 italic">{technique.description}</p>
      )}

      {/* Steps */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {stepMode === "all" ? (
          steps.map((step, i) => (
            <div key={i} className="flex gap-3 p-3 bg-muted/30 rounded-xl border border-border/40">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-semibold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-foreground leading-relaxed">{step}</p>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center gap-6 py-4">
            <div className="w-full bg-muted/30 rounded-2xl border border-border/40 p-6 text-center">
              <p className="text-xs text-muted-foreground mb-3">Step {stepIdx + 1} of {steps.length}</p>
              <p className="text-base text-foreground leading-relaxed">{steps[stepIdx]}</p>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setStepIdx(i => Math.max(0, i - 1))}
                disabled={stepIdx === 0}
                className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted/40 disabled:opacity-30 transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex gap-1.5">
                {steps.map((_, i) => (
                  <button key={i} onClick={() => setStepIdx(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === stepIdx ? "bg-primary" : "bg-muted"}`} />
                ))}
              </div>
              <button onClick={() => { if (stepIdx < steps.length - 1) setStepIdx(i => i + 1); else setDone(true); }}
                className="w-10 h-10 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:bg-muted/40 transition-colors">
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Completion / rating section */}
      {done && (
        <div className="border-t border-border/60 pt-4 space-y-4">
          <p className="text-sm font-medium text-foreground">How did this help?</p>

          {/* Alter selector */}
          {alters.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Saving as:</span>
              <select value={selectedAlterId || ""} onChange={e => setSelectedAlterId(e.target.value || null)}
                className="text-xs h-7 px-2 rounded-md border border-border bg-background">
                <option value="">System</option>
                {alters.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n}
                onMouseEnter={() => setRatingHover(n)}
                onMouseLeave={() => setRatingHover(0)}
                onClick={() => handleRate(n)}
                className="transition-transform hover:scale-110">
                <Star className={`w-6 h-6 ${(ratingHover || rating) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
              </button>
            ))}
          </div>

          <div>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Optional: add a personal note about this technique..."
              rows={2}
              className="w-full text-sm px-3 py-2 rounded-xl border border-border bg-background resize-none text-foreground placeholder:text-muted-foreground"
            />
            <button onClick={handleSaveNote}
              className="mt-1 text-xs text-primary hover:underline">
              {noteSaved ? "Saved ✓" : "Save note"}
            </button>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack} className="flex-1 text-sm">
              Try another
            </Button>
          </div>
        </div>
      )}

      {!done && (
        <button onClick={() => setDone(true)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors text-center mt-2">
          I'm done with this technique
        </button>
      )}
    </div>
  );
}