import React, { useRef, useCallback } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";

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
      {/* Circle — always shown */}
      <div
        className="rounded-full flex-shrink-0 flex items-center justify-center border-2 border-background"
        style={{ width: sz, height: sz, backgroundColor: color, zIndex: 2, position: "relative" }}
        title={symptom?.label}
      >
        <span className="font-bold text-white" style={{ fontSize: Math.max(7, sz * 0.4) }}>
          {symptom?.label?.charAt(0)?.toUpperCase() || "S"}
        </span>
      </div>

      {/* Duration line — ALWAYS shown, behind expanded card */}
      {heightPx > sz + 4 && (
        <div className="relative" style={{ width: 4, height: Math.max(heightPx - sz - 2, 4), zIndex: 1 }}>
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
                <span style={{ fontSize: 12, color, marginLeft: 1, fontWeight: "bold" }}>{snap.severity}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded detail card — floats ON TOP of line using absolute positioning */}
      {expanded && (
        <div
          className="absolute rounded-lg border shadow-md text-left px-2 py-1.5"
          style={{
            top: sz + 4,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: `color-mix(in srgb, var(--background) 95%, transparent)`,
            borderColor: `${color}60`,
            minWidth: 120,
            maxWidth: 160,
            zIndex: 10,
            backdropFilter: "blur(4px)",
          }}
          onClick={e => e.stopPropagation()}
        >
          <p className="font-semibold leading-tight mb-1" style={{ fontSize: 9, color }}>
            {symptom?.label}
          </p>
          {startStr && (
            <p style={{ fontSize: 8, color, opacity: 0.8 }}>
              {startStr}{endStr ? ` → ${endStr}` : " → now"}
            </p>
          )}
          {session?.current_severity != null && (
            <p style={{ fontSize: 8, color, opacity: 0.9 }} className="mt-0.5">
              Current severity: {session.current_severity}/5
            </p>
          )}
          {snapshots.length > 0 && (
            <div className="mt-1 space-y-0.5">
              <p style={{ fontSize: 7, color, opacity: 0.7 }} className="font-medium">Severity history:</p>
              {snapshots.map((snap, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span style={{ fontSize: 7, color, opacity: 0.7 }}>
                    {format(new Date(snap.timestamp), "h:mmaaa")}
                  </span>
                  <span style={{ fontSize: 7, color, fontWeight: "bold" }}>
                    {"●".repeat(snap.severity)}{"○".repeat(5 - snap.severity)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {snapshots.length === 0 && session?.current_severity == null && (
            <p style={{ fontSize: 8, color, opacity: 0.6 }} className="mt-0.5 italic">No severity logged</p>
          )}
        </div>
      )}
    </div>
  );
}

function SymptomDetailModal({ symptom, session, onClose }) {
  const color = symptom?.color || "#8b5cf6";
  const snapshots = session?.severity_snapshots || [];
  const startStr = session?.start_time ? format(new Date(session.start_time), "h:mm aaa") : null;
  const endStr = session?.end_time ? format(new Date(session.end_time), "h:mm aaa") : null;

  const duration = () => {
    const start = new Date(session?.start_time);
    const end = session?.end_time ? new Date(session.end_time) : new Date();
    const mins = Math.round((end - start) / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl p-5 shadow-xl max-w-xs w-full mx-4 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: color }}
          >
            <span className="text-white font-bold text-sm">
              {symptom?.label?.charAt(0)?.toUpperCase()}
            </span>
          </div>
          <div className="flex-1">
            <p className="font-semibold text-foreground">{symptom?.label}</p>
            <p className="text-xs text-muted-foreground">
              {startStr} → {endStr || "now"} · {duration()}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current severity */}
        {session?.current_severity != null && (
          <div
            className="rounded-lg p-3 space-y-1"
            style={{ backgroundColor: `${color}15`, borderColor: `${color}30`, border: "1px solid" }}
          >
            <p className="text-xs text-muted-foreground font-medium">Current severity</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold" style={{ color }}>
                {session.current_severity}/5
              </span>
              <span style={{ color, fontSize: 16 }}>
                {"●".repeat(session.current_severity)}{"○".repeat(5 - session.current_severity)}
              </span>
            </div>
          </div>
        )}

        {/* Severity history */}
        {snapshots.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Severity history
            </p>
            <div className="space-y-1.5">
              {snapshots.map((snap, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(snap.timestamp), "h:mm aaa")}
                  </span>
                  <div className="flex items-center gap-2">
                    <span style={{ color, fontSize: 14 }}>
                      {"●".repeat(snap.severity)}{"○".repeat(5 - snap.severity)}
                    </span>
                    <span className="text-xs font-semibold" style={{ color }}>
                      {snap.severity}/5
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {snapshots.length === 0 && session?.current_severity == null && (
          <p className="text-sm text-muted-foreground italic text-center py-2">
            No severity logged for this session
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// SymptomBubble — mirrors EmotionBubble exactly, grouped by minute
// entry = { mins, checkIns: [{symptom, checkIn}], key }
export { SymptomDetailModal };

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