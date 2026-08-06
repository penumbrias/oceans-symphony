import { useState, useEffect, useRef, useCallback } from "react";
import { BREATHING_PATTERNS } from "@/utils/groundingDefaults";
import { Button } from "@/components/ui/button";

const SIZES = { small: 120, large: 220 };

// embedded: the widget form — no setup screen, no rounds, no completion
// screen; just the guided animation, looping until stopped, scaled to
// `maxSize`. The classic page/modal flow is untouched when embedded=false.
export default function BreathingExercise({
  patternName = "Box breathing", onStop, onComplete,
  embedded = false, autoStart = false, loop = false, maxSize = 240,
  // Base pace: 1 = the pattern's own timing; 1.5 stretches every phase 50%
  // slower. The on-screen counts stay the pattern's numbers — they just
  // elapse at the chosen pace.
  pace = 1,
}) {
  const pattern = BREATHING_PATTERNS[patternName] || BREATHING_PATTERNS["Box breathing"];
  const sizes = embedded
    ? { small: Math.round(maxSize * 0.5), large: Math.round(maxSize * 0.92) }
    : SIZES;
  const [totalRounds, setTotalRounds] = useState(5);
  const [started, setStarted] = useState(autoStart);
  const [paused, setPaused] = useState(false);
  const [completed, setCompleted] = useState(false);

  const [round, setRound] = useState(1);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [countdown, setCountdown] = useState(pattern.phases[0].seconds);
  const [circleSize, setCircleSize] = useState(sizes.small);

  const timerRef = useRef(null);
  const pausedRef = useRef(false);

  const currentPhase = pattern.phases[phaseIdx];
  const phaseType = currentPhase.label.toLowerCase();
  const isInhale = phaseType.includes("inhale");
  const isExhale = phaseType.includes("exhale");
  const isHold = phaseType.includes("hold");

  const getTargetSize = useCallback(() => {
    if (isInhale) return sizes.large;
    if (isExhale) return sizes.small;
    return circleSize; // hold — stay at current size
  }, [isInhale, isExhale, circleSize]);

  // Refs mirror the tick state so the interval handler never calls
  // setState from inside another updater (which double-fires in dev and
  // let the display flash "0" between a phase ending and the next one's
  // seconds landing). The countdown now goes ...3, 2, 1, straight to the
  // next phase's opening number — 0 is never shown.
  const countRef = useRef(pattern.phases[0].seconds);
  const phaseRef = useRef(0);
  const advance = useCallback(() => {
    const nextIdx = (phaseRef.current + 1) % pattern.phases.length;
    const nextPhase = pattern.phases[nextIdx];
    phaseRef.current = nextIdx;
    countRef.current = nextPhase.seconds;
    setPhaseIdx(nextIdx);
    setCountdown(nextPhase.seconds);
    if (nextIdx === 0) {
      setRound(r => {
        if (!loop && r >= totalRounds) {
          setCompleted(true);
          return r;
        }
        return r + 1;
      });
    }
  }, [pattern.phases, totalRounds, loop]);

  useEffect(() => {
    if (!started || paused || completed) return;

    // Set target size immediately for smooth transition
    setCircleSize(getTargetSize());

    // Countdown timer
    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;
      if (countRef.current <= 1) {
        advance();
      } else {
        countRef.current -= 1;
        setCountdown(countRef.current);
      }
    }, Math.round(1000 * pace));

    return () => clearInterval(timerRef.current);
  }, [started, paused, phaseIdx, completed, getTargetSize, advance, pace]);

  useEffect(() => {
    pausedRef.current = paused;
    if (paused) {
      clearInterval(timerRef.current);
    }
  }, [paused]);

  useEffect(() => {
    if (completed) {
      clearInterval(timerRef.current);
      onComplete?.();
    }
  }, [completed]);

  if (!started && embedded) {
    return (
      <button type="button"
        onClick={() => { phaseRef.current = 0; countRef.current = pattern.phases[0].seconds; setPhaseIdx(0); setStarted(true); setCountdown(pattern.phases[0].seconds); }}
        className="relative flex items-center justify-center mx-auto"
        style={{ width: maxSize, height: maxSize }}
        aria-label={`Start ${patternName}`}>
        <span className="rounded-full absolute bg-primary" style={{ width: sizes.small, height: sizes.small, opacity: 0.35 }} />
        <span className="relative z-10 text-sm font-medium text-foreground">Start</span>
      </button>
    );
  }

  if (!started) {
    return (
      <div className="flex flex-col items-center gap-8 py-8">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold text-foreground">{patternName}</h2>
          <p className="text-sm text-muted-foreground">{pattern.pattern}</p>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">Rounds:</span>
          {[1, 3, 5, 8, 10].map(n => (
            <button key={n} onClick={() => setTotalRounds(n)}
              className={`w-9 h-9 rounded-full text-sm font-medium transition-colors ${totalRounds === n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {n}
            </button>
          ))}
        </div>

        <div
          className="rounded-full flex items-center justify-center bg-primary"
          style={{ width: SIZES.small, height: SIZES.small, opacity: 0.5 }}
        />

        <Button onClick={() => { phaseRef.current = 0; countRef.current = pattern.phases[0].seconds; setPhaseIdx(0); setStarted(true); setCountdown(pattern.phases[0].seconds); }} size="lg" className="px-8">
          Begin
        </Button>
        <button onClick={onStop} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Go back
        </button>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <div
          className="rounded-full flex items-center justify-center bg-primary"
          style={{ width: 80, height: 80, opacity: 0.35, transition: "all 0.8s ease" }}
        />
        <div className="space-y-2">
          <p className="text-lg font-medium text-foreground">Well done.</p>
          <p className="text-sm text-muted-foreground">Take a moment to notice how you feel.</p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button onClick={onComplete} variant="outline" className="w-full">Continue to techniques</Button>
          <button onClick={onStop} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Return to start
          </button>
        </div>
      </div>
    );
  }

  const transitionDuration = (isInhale || isExhale) ? currentPhase.seconds * pace : 0.5;

  if (embedded) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <button type="button" onClick={onStop}
          aria-label="Stop breathing exercise"
          className="relative flex items-center justify-center"
          style={{ width: maxSize, height: maxSize }}>
          <span
            className="rounded-full absolute bg-primary flex items-center justify-center"
            style={{
              opacity: isHold ? 0.7 : 0.85,
              width: circleSize,
              height: circleSize,
              transition: `width ${transitionDuration}s ease-in-out, height ${transitionDuration}s ease-in-out, opacity 0.5s ease`,
            }}
          >
            <span style={{ color: "white", fontSize: Math.max(16, Math.round(maxSize / 8)), fontWeight: "bold" }}>
              {countdown}
            </span>
          </span>
        </button>
        {/* Fixed two-line box: steps wrap to one line or two depending on
            the pattern, and letting the box grow bounced the circle up and
            down with every phase change. */}
        <p className="text-xs font-medium text-foreground text-center leading-tight overflow-hidden"
          style={{ height: "2.4em", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {currentPhase.label}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Fixed container for circle animation */}
      <div className="relative flex items-center justify-center" style={{ width: 240, height: 240, flexShrink: 0 }}>
        <div
          className="rounded-full absolute bg-primary flex items-center justify-center"
          style={{
            opacity: isHold ? 0.7 : 0.85,
            width: circleSize,
            height: circleSize,
            transition: `width ${transitionDuration}s ease-in-out, height ${transitionDuration}s ease-in-out, opacity 0.5s ease`,
          }}
        >
          <span style={{ color: 'white', fontSize: 32, fontWeight: 'bold' }}>
            {countdown}
          </span>
        </div>
      </div>

      {/* Phase label below fixed container */}
      <div className="text-center space-y-2">
        <p className="text-lg font-semibold text-foreground">{currentPhase.label}</p>
        <p className="text-sm text-muted-foreground">{patternName} · {pattern.pattern}</p>
        <p className="text-xs text-muted-foreground">Round {round} of {totalRounds}</p>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setPaused(v => !v)} className="w-28">
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button variant="ghost" onClick={onStop} className="text-muted-foreground">
          Stop
        </Button>
      </div>
    </div>
  );
}