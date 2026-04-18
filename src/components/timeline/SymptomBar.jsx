import React from "react";
import { format } from "date-fns";

export function SymptomBar({ symptom, session, topPx, heightPx, rowH, expanded, onTap }) {
  const sz = Math.max(18, Math.min(24, rowH * 0.4));
  const color = symptom?.color || "#8b5cf6";
  const snapshots = session?.severity_snapshots || [];

  const startStr = session?.start_time ? format(new Date(session.start_time), "h:mmaaa") : null;
  const endStr = session?.end_time ? format(new Date(session.end_time), "h:mmaaa") : null;

  return (
    <div
      className="absolute flex flex-col items-center cursor-pointer"
      style={{ top: topPx, left: 0, right: 0, userSelect: "none" }}
      onClick={onTap}
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

export function SymptomPill({ symptom, checkIn, topPx, expanded, onTap }) {
  const color = symptom?.color || "#8b5cf6";
  const timeStr = checkIn?.timestamp ? format(new Date(checkIn.timestamp), "h:mmaaa") : null;

  if (expanded) {
    return (
      <div
        className="absolute cursor-pointer rounded-lg border px-1.5 py-1"
        style={{
          top: topPx,
          left: 0,
          backgroundColor: `${color}18`,
          borderColor: `${color}60`,
          userSelect: "none",
          maxWidth: "100%",
        }}
        onClick={onTap}
      >
        <p className="font-semibold leading-tight" style={{ fontSize: 8, color }}>{symptom?.label}</p>
        {checkIn.severity !== null && checkIn.severity !== undefined && (
          <p style={{ fontSize: 7, color, opacity: 0.8 }}>Severity: {checkIn.severity}</p>
        )}
        {timeStr && <p style={{ fontSize: 7, color, opacity: 0.7 }}>{timeStr}</p>}
      </div>
    );
  }

  return (
    <div
      className="absolute flex items-center gap-1 cursor-pointer rounded-full px-1.5 py-0.5 border"
      style={{
        top: topPx,
        left: 0,
        backgroundColor: `${color}18`,
        borderColor: `${color}60`,
        userSelect: "none",
        maxWidth: "100%",
      }}
      onClick={onTap}
      title={symptom?.label}
    >
      <div className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, backgroundColor: color }} />
      <span style={{ fontSize: 8, color, fontWeight: "bold" }}>
        {symptom?.label?.charAt(0)?.toUpperCase() || "S"}
      </span>
      {checkIn.severity !== null && checkIn.severity !== undefined && (
        <span style={{ fontSize: 8, color, opacity: 0.8 }}>{checkIn.severity}</span>
      )}
    </div>
  );
}