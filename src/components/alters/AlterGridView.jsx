import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

const SWIPE_THRESHOLD = 40; // px horizontal to trigger action
const TAP_SLOP = 8;         // px max movement to count as tap

function AlterCard({ alter, fronting, isPrimary, compact, anonymize = "off" }) {
  const alterColor = alter.color || "#9333ea";
  const resolvedUrl = useResolvedAvatarUrl(alter.avatar_url);
  const [imgError, setImgError] = useState(false);
  const boxShadow = fronting
    ? isPrimary
      ? `inset 0 0 0 3px #fbbf24, inset 0 0 0 5px ${alterColor}, 0 0 0 1px ${alterColor}, 0 0 24px ${alterColor}ff`
      : `inset 0 0 0 3px ${alterColor}, 0 0 0 1px ${alterColor}, 0 0 20px ${alterColor}ff`
    : `inset 0 0 0 2px ${alterColor}80`;
  const sizeClass = compact
    ? (fronting ? "w-16 h-16" : "w-14 h-14")
    : (fronting ? "w-20 h-20" : "w-16 h-16");

  return (
    <div
      className="flex flex-col items-center gap-2"
      data-alter-id={alter.id}
      style={{ userSelect: "none" }}
    >
      {resolvedUrl && !imgError ? (
        <img
          src={resolvedUrl}
          alt={alter.name}
          style={{ boxShadow }}
          className={`rounded-full object-cover transition-all cursor-pointer select-none ${sizeClass} ${anonymize === "all" ? "blur-sm" : ""}`}
          draggable={false}
          onError={() => setImgError(true)}
        />
      ) : (
        <div
          style={{
            backgroundColor: fronting ? `${alterColor}30` : "hsl(var(--muted))",
            boxShadow,
          }}
          className={`rounded-full flex items-center justify-center transition-all cursor-pointer select-none ${sizeClass} ${anonymize === "all" ? "blur-sm" : ""}`}
        >
          <span className="text-xs font-semibold text-muted-foreground">
            {alter.name.slice(0, 2)}
          </span>
        </div>
      )}
      <span className={`text-xs text-center font-medium truncate w-full px-1 ${anonymize !== "off" ? "blur-sm" : ""}`}>
        {alter.alias?.slice(0, 5) || alter.name.slice(0, 5)}
      </span>
    </div>
  );
}

export default function AlterGridView({ alters, activeSessions = [], allAlters = [], cols = 3, anonymize = "off" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const gridRef = useRef(null);
  const gestureRef = useRef(null); // { alterId, startX, startY, triggered }
  const compact = cols >= 4;

  // Always-current refs so touch handlers don't go stale
  const altersRef = useRef(alters);
  const activeSessionsRef = useRef(activeSessions);
  altersRef.current = alters;
  activeSessionsRef.current = activeSessions;

  const isFronting = (alterId) => activeSessions.some(s => s.alter_id === alterId);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    const findAlterId = (target) => {
      let node = target;
      while (node && node !== el) {
        if (node.dataset?.alterId) return node.dataset.alterId;
        node = node.parentElement;
      }
      return null;
    };

    const doToggleFront = (alter) => {
      const sessions = activeSessionsRef.current;
      const session = sessions.find(s => s.alter_id === alter.id);
      if (session) {
        base44.entities.FrontingSession.update(session.id, { end_time: new Date().toISOString() })
          .then(() => {
            toast(`${alter.name} left front`);
            queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
            queryClient.invalidateQueries({ queryKey: ["activeFront"] });
          })
          .catch(() => toast.error("Failed to update front"));
      } else {
        base44.entities.FrontingSession.create({
          alter_id: alter.id,
          start_time: new Date().toISOString(),
          is_primary: sessions.length === 0,
        })
          .then(() => {
            toast(`${alter.name} joined front`);
            queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
            queryClient.invalidateQueries({ queryKey: ["activeFront"] });
          })
          .catch(() => toast.error("Failed to update front"));
      }
    };

    const doTogglePrimary = (alter) => {
      const sessions = activeSessionsRef.current;
      const mySession = sessions.find(s => s.alter_id === alter.id);
      if (!mySession) return;
      if (mySession.is_primary) {
        base44.entities.FrontingSession.update(mySession.id, { is_primary: false })
          .then(() => {
            toast(`${alter.name} is now co-fronting`);
            queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
            queryClient.invalidateQueries({ queryKey: ["activeFront"] });
          })
          .catch(() => toast.error("Failed to update primary status"));
      } else {
        const prevPrimary = sessions.find(s => s.is_primary && s.id !== mySession.id);
        Promise.all([
          prevPrimary ? base44.entities.FrontingSession.update(prevPrimary.id, { is_primary: false }) : Promise.resolve(),
          base44.entities.FrontingSession.update(mySession.id, { is_primary: true }),
        ])
          .then(() => {
            toast.success(`${alter.name} is now primary!`);
            queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
            queryClient.invalidateQueries({ queryKey: ["activeFront"] });
          })
          .catch(() => toast.error("Failed to update primary status"));
      }
    };

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) { gestureRef.current = null; return; }
      const touch = e.touches[0];
      const alterId = findAlterId(e.target);
      if (!alterId) return;
      gestureRef.current = { alterId, startX: touch.clientX, startY: touch.clientY, triggered: false };
    };

    const onTouchMove = (e) => {
      const g = gestureRef.current;
      if (!g) return;
      if (e.touches.length !== 1) { gestureRef.current = null; return; }
      const touch = e.touches[0];
      const dx = touch.clientX - g.startX;
      const dy = touch.clientY - g.startY;

      // Clear the gesture if vertical movement takes over
      if (!g.triggered && Math.abs(dy) > Math.abs(dx) + 5) {
        gestureRef.current = null;
        return;
      }

      // If horizontal intent, block scroll
      if (Math.abs(dx) > 6) e.preventDefault();

      if (g.triggered || Math.abs(dx) < SWIPE_THRESHOLD) return;

      g.triggered = true;
      if (navigator.vibrate) navigator.vibrate(40);
      const alter = altersRef.current.find(a => a.id === g.alterId);
      if (!alter) return;
      if (dx > 0) doToggleFront(alter);
      else doTogglePrimary(alter);
    };

    const onTouchEnd = (e) => {
      const g = gestureRef.current;
      gestureRef.current = null;
      if (!g || g.triggered) return;
      const touch = e.changedTouches[0];
      const dx = Math.abs(touch.clientX - g.startX);
      const dy = Math.abs(touch.clientY - g.startY);
      if (dx <= TAP_SLOP && dy <= TAP_SLOP) {
        const alter = altersRef.current.find(a => a.id === g.alterId);
        if (alter) navigate(`/alter/${alter.id}`);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [navigate, queryClient]); // stable refs — alters/sessions accessed via altersRef/activeSessionsRef

  const colsClass = {
    2: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
    3: "grid-cols-3 sm:grid-cols-4 md:grid-cols-5",
    4: "grid-cols-4 sm:grid-cols-5 md:grid-cols-6",
    5: "grid-cols-5 sm:grid-cols-6 md:grid-cols-7",
  }[cols] || "grid-cols-3 sm:grid-cols-4 md:grid-cols-5";

  return (
    <div ref={gridRef} className={`grid ${colsClass} gap-3`} style={{ touchAction: "pan-y" }}>
      {alters.map((alter) => (
        <AlterCard
          key={alter.id}
          alter={alter}
          fronting={isFronting(alter.id)}
          isPrimary={activeSessions.find(s => s.alter_id === alter.id)?.is_primary ?? false}
          compact={compact}
          anonymize={anonymize}
        />
      ))}
    </div>
  );
}
