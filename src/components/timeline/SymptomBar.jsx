import React, { useRef, useCallback } from "react";
import { format } from "date-fns";

function useDoubleTap(onSingleTap, onDoubleTap, ms = 280) {
  const lastRef = useRef({ time: 0 });
  return useCallback((e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastRef.current.time < ms) {
      lastRef.current.time = 0;
      onDoubleTap?.(e);
    } else {
      lastRef.current.time = now;
      setTimeout(() => {
        if (lastRef.current.time !== 0 && Date.now() - lastRef.current.time >= ms - 30) {
          lastRef.current.time = 0;
          onSingleTap?.(e);
        }
      }, ms);
    }
  }, [onSingleTap, onDoubleTap, ms]);
}

export function SymptomBar({ symptom, session, topPx, heightPx, rowH, expanded, onTap, onDoubleTap, onLongPress }) {
  const sz = Math.max(24, Math.min(32, rowH * 0.5));
  const tap = useDoubleTap(onTap, onDoubleTap);
  const color = symptom?.color || "#8b5cf6";
  const snapshots = session?.severity_snapshots || [];
  const lpRef = useRef(null);

  const startStr = session?.start_time ? format(new Date(session.start_time), "h:mmaaa") : null;
  const endStr = session?.end_time ? format(new Date(session.end_time), "h:mmaaa") : null;

  const startPress = (e) => {
    e.stopPropagation();
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;
    lpRef.current = setTimeout(() => { lpRef.current = null; onLongPress?.(clientY); }, 500);
  };
  const cancelPress = (e) => {
    e?.stopPropagation();
    if (lpRef.current) { clearTimeout(lpRef.current); lpRef.current = null; }
  };

  return (
    <div
      className="absolute flex flex-col items-center cursor-pointer"
      style={{ top: topPx, left: 0, right: 0, userSelect: "none", minWidth: 44 }}
      onClick={tap}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
    >
      <div
        className="rounded-full flex-shrink-0 flex items-center justify-center border-2 border-background"
        style={{ width: sz, height: sz, backgroundColor: color }}
        title={symptom?.label}
      >
        <span className="font-bold text-white" style={{ fontSize: Math.max(7, sz * 0.4) }}>
          {symptom?.label?.charAt(0)?.toUpperCase() || "S"}
        </span>
      </div>

      {expanded && (
        <div className="mt-0.5 px-1 py-0.5 rounded-md border text-center"
          style={{ backgroundColor: `${color}18`, borderColor: `${color}40`, maxWidth: 56 }}>
          <p className="font-semibold leading-tight" style={{ fontSize: 8, color, wordBreak: "break-word" }}>{symptom?.label}</p>
          {startStr && (
            <p style={{ fontSize: 7, color, opacity: 0.75 }}>{startStr}{endStr ? `–${endStr}` : "→"}</p>
          )}
        </div>
      )}

      {!expanded && heightPx > sz + 4 && (
        <div className="relative" style={{ width: 4, height: Math.max(heightPx - sz - 2, 4) }}>
          <div
            className="w-full rounded-full"
            style={{ height: "100%", background: `linear-gradient(to bottom, ${color}, ${color}40)` }}
          />
          {snapshots.map((snap, i) => {
            const sessionStart = new Date(session.start_time).getTime();
            const sessionEnd = session.end_time ? new Date(session.end_time).getTime() : Date.now();
            const sessionDuration = sessionEnd - sessionStart;
            const snapTime = new Date(snap.timestamp).getTime();
            const ratio = sessionDuration > 0 ? (snapTime - sessionStart) / sessionDuration : 0;
            const tickTop = ratio * (heightPx - sz - 2);
            return (
              <div key={i} className="absolute flex items-center" style={{ top: tickTop, left: -8 }}>
                <div style={{ width: 12, height: 2, backgroundColor: color, opacity: 0.8 }} />
                <span style={{ fontSize: 7, color, marginLeft: 1, fontWeight: "bold" }}>{snap.severity}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// SymptomBubble — mirrors EmotionBubble exactly, grouped by minute
// entry = { mins, checkIns: [{symptom, checkIn}], key }
export function SymptomBubble({ entry, topPx, expanded, onTap }) {
  const items = entry.checkIns || [];
  const timeStr = entry.timeStr || "";
  return (
    <div className="absolute left-0 cursor-pointer z-10" style={{ top: topPx, userSelect: "none" }} onClick={onTap}>
      {expanded ? (
        <div className="rounded-lg border border-border/60 bg-card/90 px-2 py-1.5 shadow-sm">
          <p className="text-xs text-muted-foreground mb-1 font-medium">{timeStr}</p>
          <div className="flex flex-col gap-0.5">
            {items.map(({ symptom, checkIn }, i) => {
              const color = symptom?.color || "#8b5cf6";
              const hasSeverity = checkIn.severity !== null && checkIn.severity !== undefined;
              return (
                <span key={i} className="flex items-center gap-1">
                  <div className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, backgroundColor: color }} />
                  <span className="font-medium" style={{ fontSize: 9, color }}>
                    {symptom?.label || "?"}{hasSeverity ? ` · ${checkIn.severity}` : ""}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex gap-0.5 flex-wrap">
          {items.slice(0, 4).map(({ symptom, checkIn }, i) => {
            const color = symptom?.color || "#8b5cf6";
            const hasSeverity = checkIn.severity !== null && checkIn.severity !== undefined;
            const label = hasSeverity ? String(checkIn.severity) : (symptom?.label?.charAt(0)?.toUpperCase() || "S");
            return (
              <div key={i} className="rounded-full border-2 border-background flex items-center justify-center flex-shrink-0"
                style={{ width: 18, height: 18, backgroundColor: color }} title={symptom?.label}>
                <span className="text-white font-bold" style={{ fontSize: 8 }}>{label}</span>
              </div>
            );
          })}
          {items.length > 4 && (
            <div className="rounded-full border-2 border-background flex items-center justify-center flex-shrink-0 bg-muted"
              style={{ width: 18, height: 18 }}>
              <span className="text-muted-foreground font-bold" style={{ fontSize: 7 }}>+{items.length - 4}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}