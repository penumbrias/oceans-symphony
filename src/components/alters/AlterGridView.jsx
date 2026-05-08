import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";

const SWIPE_THRESHOLD = 40;
const TAP_THRESHOLD = 10;

function AlterCard({ alter, fronting, isPrimary, compact, onTap, onSwipeRight, onSwipeLeft, anonymize = "off" }) {
  const alterColor = alter.color || "#9333ea";
  const resolvedUrl = useResolvedAvatarUrl(alter.avatar_url);
  const [imgError, setImgError] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const recentTouch = useRef(false);
  const [dragX, setDragX] = useState(0);

  const boxShadow = fronting
    ? isPrimary
      ? `inset 0 0 0 3px #fbbf24, inset 0 0 0 5px ${alterColor}, 0 0 0 1px ${alterColor}, 0 0 24px ${alterColor}ff`
      : `inset 0 0 0 3px ${alterColor}, 0 0 0 1px ${alterColor}, 0 0 20px ${alterColor}ff`
    : `inset 0 0 0 2px ${alterColor}80`;
  const sizeClass = compact
    ? (fronting ? "w-16 h-16" : "w-14 h-14")
    : (fronting ? "w-20 h-20" : "w-16 h-16");

  const handleTouchStart = (e) => {
    const t = e.touches[0];
    startX.current = t.clientX;
    startY.current = t.clientY;
    setDragX(0);
  };

  const handleTouchMove = (e) => {
    const t = e.touches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    if (Math.abs(dx) > Math.abs(dy)) {
      setDragX(Math.max(-60, Math.min(60, dx)));
    }
  };

  const handleTouchEnd = (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - startX.current;
    const dy = t.clientY - startY.current;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    setDragX(0);
    recentTouch.current = true;
    setTimeout(() => { recentTouch.current = false; }, 500);

    if (adx > SWIPE_THRESHOLD && adx > ady) {
      if (dx > 0) onSwipeRight();
      else onSwipeLeft();
    } else if (adx < TAP_THRESHOLD && ady < TAP_THRESHOLD) {
      onTap();
    }
  };

  const handleClick = () => {
    if (recentTouch.current) return;
    onTap();
  };

  const swipeHint = dragX > 12 ? "front" : dragX < -12 ? "primary" : null;

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div
        className="relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragX === 0 ? "transform 150ms ease-out" : "none",
          touchAction: "pan-y",
        }}
      >
        {resolvedUrl && !imgError ? (
          <img
            src={resolvedUrl}
            alt={alter.name}
            style={{ boxShadow }}
            className={`rounded-full object-cover transition-all cursor-pointer ${sizeClass} ${anonymize === "all" ? "blur-sm" : ""}`}
            draggable={false}
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            style={{
              backgroundColor: fronting ? `${alterColor}30` : "hsl(var(--muted))",
              boxShadow,
            }}
            className={`rounded-full flex items-center justify-center transition-all cursor-pointer ${sizeClass} ${anonymize === "all" ? "blur-sm" : ""}`}
          >
            <span className="text-xs font-semibold text-muted-foreground">
              {alter.name.slice(0, 2)}
            </span>
          </div>
        )}
      </div>
      {swipeHint && (
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${swipeHint === "front" ? "text-emerald-500" : "text-amber-500"}`}>
          {swipeHint === "front" ? (fronting ? "Remove" : "Add") : (isPrimary ? "Demote" : "Promote")}
        </span>
      )}
      {!swipeHint && (
        <span className={`text-xs text-center font-medium truncate w-full px-1 ${anonymize !== "off" ? "blur-sm" : ""}`}>
          {alter.alias?.slice(0, 5) || alter.name.slice(0, 5)}
        </span>
      )}
    </div>
  );
}

export default function AlterGridView({ alters, activeSessions = [], allAlters = [], cols = 3, anonymize = "off" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const compact = cols >= 4;

  const toggleFront = async (alter) => {
    try {
      const mySession = activeSessions.find(s => s.alter_id === alter.id);
      if (mySession) {
        await base44.entities.FrontingSession.update(mySession.id, {
          is_active: false,
          end_time: new Date().toISOString(),
        });
        toast.success(`${alter.name} removed from front`);
      } else {
        const hasPrimary = activeSessions.some(s => s.is_primary);
        await base44.entities.FrontingSession.create({
          alter_id: alter.id,
          is_primary: !hasPrimary,
          start_time: new Date().toISOString(),
          is_active: true,
        });
        toast.success(`${alter.name} added to front`);
      }
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    } catch (err) {
      toast.error(err.message || "Failed to update front");
    }
  };

  const togglePrimary = async (alter) => {
    const mySession = activeSessions.find(s => s.alter_id === alter.id);
    if (!mySession) {
      toast(`${alter.name} isn't fronting — swipe right to add to front first`);
      return;
    }
    try {
      if (mySession.is_primary) {
        await base44.entities.FrontingSession.update(mySession.id, { is_primary: false });
        toast.success(`${alter.name} demoted to co-fronter`);
      } else {
        const currentPrimary = activeSessions.find(s => s.is_primary);
        if (currentPrimary) {
          await base44.entities.FrontingSession.update(currentPrimary.id, { is_primary: false });
        }
        await base44.entities.FrontingSession.update(mySession.id, { is_primary: true });
        toast.success(`${alter.name} promoted to primary`);
      }
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    } catch (err) {
      toast.error(err.message || "Failed to update primary");
    }
  };

  const isFronting = (alterId) => activeSessions.some(s => s.alter_id === alterId);

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
          onTap={() => navigate(`/alter/${alter.id}`)}
          onSwipeRight={() => toggleFront(alter)}
          onSwipeLeft={() => togglePrimary(alter)}
          anonymize={anonymize}
        />
      ))}
    </div>
  );
}
