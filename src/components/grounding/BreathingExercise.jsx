import { useState, useEffect, useRef, useCallback } from "react";
import { BREATHING_PATTERNS } from "@/utils/groundingDefaults";
import { Button } from "@/components/ui/button";

const SIZES = { small: 120, large: 220 };

export default function BreathingExercise({ patternName = "Box breathing", onStop, onComplete }) {
  const pattern = BREATHING_PATTERNS[patternName] || BREATHING_PATTERNS["Box breathing"];
  const [totalRounds, setTotalRounds] = useState(5);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [completed, setCompleted] = useState(false);

  const [round, setRound] = useState(1);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [countdown, setCountdown] = useState(pattern.phases[0].seconds);
  const [circleSize, setCircleSize] = useState(SIZES.small);

  const timerRef = useRef(null);
  const pausedRef = useRef(false);

  const currentPhase = pattern.phases[phaseIdx];
  const phaseType = currentPhase.label.toLowerCase();
  const isInhale = phaseType.includes("inhale");
  const isExhale = phaseType.includes("exhale");
  const isHold = phaseType.includes("hold");

  const getTargetSize = useCallback(() => {
    if (isInhale) return SIZES.large;
    if (isExhale) return SIZES.small;
    return circleSize; // hold — stay at current size
  }, [isInhale, isExhale, circleSize]);

  const advance = useCallback(() => {
    setPhaseIdx(prev => {
      const nextIdx = (prev + 1) % pattern.phases.length;
      const nextPhase = pattern.phases[nextIdx];
      setCountdown(nextPhase.seconds);

      if (nextIdx === 0) {
        // completed a full round
        setRound(r => {
          if (r >= totalRounds) {
            setCompleted(true);
            return r;
          }
          return r + 1;
        });
      }
      return nextIdx;
    });
  }, [pattern.phases, totalRounds]);

  useEffect(() => {
    if (!started || paused || completed) return;

    // Set target size immediately for smooth transition
    setCircleSize(getTargetSize());

    // Countdown timer
    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;
      setCountdown(s => {
        if (s <= 1) {
          advance();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [started, paused, phaseIdx, completed, getTargetSize, advance]);

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
          className="rounded-full flex items-center justify-center"
          style={{ width: SIZES.small, height: SIZES.small, backgroundColor: "hsl(var(--primary))", opacity: 0.5 }}
        />

        <Button onClick={() => { setStarted(true); setCountdown(pattern.phases[0].seconds); }} size="lg" className="px-8">
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
          className="rounded-full flex items-center justify-center"
          style={{ width: 80, height: 80, backgroundColor: "hsl(var(--primary))", opacity: 0.35, transition: "all 0.8s ease" }}
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

  const transitionDuration = (isInhale || isExhale) ? currentPhase.seconds : 0.5;

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Fixed container for circle animation */}
      <div className="relative flex items-center justify-center" style={{ width: 240, height: 240, flexShrink: 0 }}>
        <div
          style={{
            position: 'absolute',
            borderRadius: '50%',
            backgroundColor: 'hsl(var(--primary))',
            opacity: isHold ? 0.7 : 0.85,
            width: circleSize,
            height: circleSize,
            transition: `width ${transitionDuration}s ease-in-out, height ${transitionDuration}s ease-in-out, opacity 0.5s ease`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
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