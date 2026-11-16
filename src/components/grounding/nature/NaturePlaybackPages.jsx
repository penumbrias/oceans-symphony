import { useEffect, useState } from "react";
import { ChevronUp, ChevronDown, X, Play } from "lucide-react";
import { Group, Chips, Row } from "@/components/shared/SettingRows";
import { natureSoundById } from "@/lib/natureSounds/catalog";
import {
  setNatureSleepTimer, removeFromUpNext, moveInUpNext, clearUpNext, playFromUpNext,
} from "@/lib/natureSounds/naturePlayer";
import { fmtLength } from "./natureHooks";

// Nature sounds → Up next and Sleep timer, two drill-in pages opened from the
// player card. Both work on the one app-wide player (naturePlayer.js).

// Seconds left on a "time" sleep timer, ticking once a second; null otherwise.
export function useSleepLeft(sleep) {
  const calc = () => (sleep?.mode === "time" ? Math.max(0, Math.round((sleep.endsAt - Date.now()) / 1000)) : null);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    if (sleep?.mode !== "time") return undefined;
    const t = setInterval(() => setLeft(calc()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleep]);
  return left;
}

// A short label for the player card's Timer button.
export function sleepLabel(sleep, left) {
  if (!sleep) return "Timer";
  if (sleep.mode === "track") return "After this";
  if (sleep.mode === "queue") return "After Up next";
  return fmtLength(left ?? 0);
}

const MINUTES = [15, 30, 45, 60, 90, 120];

export function SleepTimerPage({ player }) {
  const left = useSleepLeft(player.sleep);
  const sleep = player.sleep;
  const value = !sleep ? "off" : sleep.mode === "time" ? `m${sleep.minutes}` : sleep.mode;
  const options = [
    { value: "off", label: "Off" },
    ...MINUTES.map((m) => ({ value: `m${m}`, label: m < 60 ? `${m} min` : `${Math.floor(m / 60)}${m % 60 ? "½" : ""} h` })),
    { value: "track", label: "End of this sound" },
    { value: "queue", label: "When Up next runs out" },
  ];
  const pick = (v) => {
    if (v === "off") setNatureSleepTimer(null);
    else if (v === "track" || v === "queue") setNatureSleepTimer(v);
    else setNatureSleepTimer(Number(v.slice(1)));
  };
  return (
    <div className="px-1">
      <Group title="Stop the sound" first>
        <div className="py-2">
          <Chips label="Sleep timer" options={options} value={value} onChange={pick} />
        </div>
        {sleep && (
          <Row label={sleep.mode === "time" ? "Stops in" : "Stops"}>
            <span className="text-sm tabular-nums text-foreground">
              {sleep.mode === "time" ? fmtLength(left ?? 0)
                : sleep.mode === "track" ? "When this sound ends" : "When Up next is done"}
            </span>
          </Row>
        )}
      </Group>
      <p className="text-xs text-muted-foreground px-1 pt-3">
        The sound fades out over the last half minute. When the timer ends, a made-from-math sound stops too, so everything goes quiet.
       
      </p>
    </div>
  );
}

export function UpNextPage({ prefs }) {
  const ids = prefs.upNext;
  return (
    <div className="px-1">
      <Group title={`Up next · ${ids.length}`} first>
        {ids.map((id, i) => {
          const s = natureSoundById(id);
          const title = s ? s.title : "A sound that isn't on this device";
          return (
            <div key={`${id}-${i}`} className="flex items-center gap-1 border-b border-border/30 last:border-b-0">
              <button type="button" onClick={() => playFromUpNext(i)} disabled={!s}
                className="flex-1 min-w-0 flex items-center gap-2 text-left min-h-[52px] py-1.5 rounded-md hover:bg-muted/30 -ml-1 pl-1 disabled:opacity-50">
                <span className="w-6 flex-shrink-0 flex justify-center text-muted-foreground/60 text-xs tabular-nums">{i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm block truncate text-foreground">{title}</span>
                  {s && (
                    <span className="text-[0.6875rem] text-muted-foreground block truncate">
                      {[s.own ? "Yours" : s.place, s.seconds ? fmtLength(s.seconds) : ""].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <Play className="w-4 h-4 text-muted-foreground/60 flex-shrink-0" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => moveInUpNext(i, -1)} disabled={i === 0} aria-label={`Move ${title} up`}
                className="h-11 w-9 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30">
                <ChevronUp className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => moveInUpNext(i, 1)} disabled={i === ids.length - 1} aria-label={`Move ${title} down`}
                className="h-11 w-9 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30">
                <ChevronDown className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => removeFromUpNext(i)} aria-label={`Take ${title} out of Up next`}
                className="h-11 w-9 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
        {!ids.length && (
          <p className="text-xs text-muted-foreground py-6 text-center">
            Nothing queued. Tap the + beside a sound to play it next.
          </p>
        )}
        {ids.length > 0 && (
          <button type="button" onClick={clearUpNext}
            className="w-full min-h-[44px] text-sm text-muted-foreground hover:text-foreground text-left">
            Clear Up next
          </button>
        )}
      </Group>
      <p className="text-xs text-muted-foreground px-1 pt-3">
        Queued sounds play in this order when the current one ends or you press next. After that, the list carries on as usual.
      </p>
    </div>
  );
}
