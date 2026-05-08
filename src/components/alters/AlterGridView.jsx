import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

const LONG_PRESS_MS = 500;
const DOUBLE_TAP_MS = 300;

function AlterCard({ alter, fronting, isPrimary, compact, onPointerDown, onPointerUp, onPointerLeave, onPointerCancel, anonymize = "off" }) {
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
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
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
  const longPressTimerRef = useRef(null);
  const longPressFiredRef = useRef(false);
  const lastTapRef = useRef({ alterId: null, time: 0 });
  const singleTapTimerRef = useRef(null);
  const compact = cols >= 4;

  const isFronting = (alterId) => activeSessions.some(s => s.alter_id === alterId);

  const toggleFronting = async (alter) => {
    const session = activeSessions.find(s => s.alter_id === alter.id);
    try {
      if (session) {
        await base44.entities.FrontingSession.update(session.id, { end_time: new Date().toISOString() });
        toast(`${alter.name} left front`);
      } else {
        const isFirst = activeSessions.length === 0;
        await base44.entities.FrontingSession.create({
          alter_id: alter.id,
          start_time: new Date().toISOString(),
          is_primary: isFirst,
        });
        toast(`${alter.name} joined front`);
      }
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
    } catch {
      toast.error("Failed to update front");
    }
  };

  const startLongPress = (alter) => {
    longPressFiredRef.current = false;
    longPressTimerRef.current = setTimeout(async () => {
      longPressFiredRef.current = true;
      // Cancel any pending single-tap
      clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;

      const mySession = activeSessions.find(s => s.alter_id === alter.id);
      if (!mySession) return;
      if (navigator.vibrate) navigator.vibrate(50);
      try {
        if (mySession.is_primary) {
          await base44.entities.FrontingSession.update(mySession.id, { is_primary: false });
          toast(`${alter.name} is now co-fronting`);
        } else {
          const prevPrimary = activeSessions.find(s => s.is_primary && s.id !== mySession.id);
          if (prevPrimary) {
            await base44.entities.FrontingSession.update(prevPrimary.id, { is_primary: false });
          }
          await base44.entities.FrontingSession.update(mySession.id, { is_primary: true });
          toast.success(`${alter.name} is now primary!`);
        }
        queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
        queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      } catch {
        toast.error("Failed to update primary status");
      }
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const handlePointerUp = (alter) => {
    cancelLongPress();
    if (longPressFiredRef.current) return;

    const now = Date.now();
    const last = lastTapRef.current;

    if (last.alterId === alter.id && now - last.time < DOUBLE_TAP_MS) {
      // Double tap → navigate to alter page
      clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
      lastTapRef.current = { alterId: null, time: 0 };
      navigate(`/alter/${alter.id}`);
    } else {
      // First tap → wait for possible double tap, then toggle fronting
      lastTapRef.current = { alterId: alter.id, time: now };
      clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = setTimeout(() => {
        lastTapRef.current = { alterId: null, time: 0 };
        toggleFronting(alter);
      }, DOUBLE_TAP_MS);
    }
  };

  const colsClass = {
    2: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
    3: "grid-cols-3 sm:grid-cols-4 md:grid-cols-5",
    4: "grid-cols-4 sm:grid-cols-5 md:grid-cols-6",
    5: "grid-cols-5 sm:grid-cols-6 md:grid-cols-7",
  }[cols] || "grid-cols-3 sm:grid-cols-4 md:grid-cols-5";

  return (
    <div className={`grid ${colsClass} gap-3`}>
      {alters.map((alter) => (
        <AlterCard
          key={alter.id}
          alter={alter}
          fronting={isFronting(alter.id)}
          isPrimary={activeSessions.find(s => s.alter_id === alter.id)?.is_primary ?? false}
          compact={compact}
          onPointerDown={() => startLongPress(alter)}
          onPointerUp={() => handlePointerUp(alter)}
          onPointerLeave={cancelLongPress}
          onPointerCancel={cancelLongPress}
          anonymize={anonymize}
        />
      ))}
    </div>
  );
}
