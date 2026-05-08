import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { User, ChevronRight, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const SWIPE_THRESHOLD = 40;
const TAP_SLOP = 8;

function getContrastColor(hex) {
  if (!hex) return "hsl(var(--muted-foreground))";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

export function FrontingToggleButton({ alter, activeSessions = [] }) {
  const queryClient = useQueryClient();
  const longPressRef = useRef(null);

  // New individual model: each active session is one alter
  const mySession = activeSessions.find(s => s.alter_id === alter.id);
  const isFronting = !!mySession;
  const isPrimary = mySession?.is_primary ?? false;

  const handleToggle = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (isFronting) {
        // Remove this alter from front
        await base44.entities.FrontingSession.update(mySession.id, {
          is_active: false,
          end_time: new Date().toISOString(),
        });
        toast.success(`${alter.name} removed from front`);
      } else {
        // Add alter to front (as co-fronter by default)
        const hasPrimary = activeSessions.some(s => s.is_primary);
        await base44.entities.FrontingSession.create({
          alter_id: alter.id,
          is_primary: !hasPrimary, // become primary if no one is
          start_time: new Date().toISOString(),
          is_active: true,
        });
        toast.success(`${alter.name} added to front!`);
      }
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    } catch (err) {
      toast.error(err.message || "Failed to update front");
    }
  };

  const handleSetPrimary = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (!isFronting) {
        // Add as primary, demote current primary
        const currentPrimary = activeSessions.find(s => s.is_primary);
        if (currentPrimary) {
          await base44.entities.FrontingSession.update(currentPrimary.id, { is_primary: false });
        }
        await base44.entities.FrontingSession.create({
          alter_id: alter.id,
          is_primary: true,
          start_time: new Date().toISOString(),
          is_active: true,
        });
      } else if (!isPrimary) {
        // Promote to primary, demote current primary
        const currentPrimary = activeSessions.find(s => s.is_primary);
        if (currentPrimary) {
          await base44.entities.FrontingSession.update(currentPrimary.id, { is_primary: false });
        }
        await base44.entities.FrontingSession.update(mySession.id, { is_primary: true });
      } else if (isPrimary) {
  await base44.entities.FrontingSession.update(mySession.id, { is_primary: false });
  toast.success(`${alter.name} demoted to co-fronter`);
}
      toast.success(`${alter.name} is now primary!`);
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    } catch (err) {
      toast.error(err.message || "Failed to set primary");
    }
  };

  const onMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    longPressRef.current = setTimeout(() => {
      longPressRef.current = null;
      handleSetPrimary(e);
    }, 600);
  };

  const onMouseUp = (e) => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
      handleToggle(e);
    }
  };

  const onMouseLeave = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  return (
    <button
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      onTouchStart={onMouseDown}
      onTouchEnd={onMouseUp}
      className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
      style={{
        backgroundColor: isFronting
          ? isPrimary ? "#f59e0b20" : `${alter.color || "#9333ea"}20`
          : "hsl(var(--muted))",
        border: isFronting
          ? isPrimary ? "2px solid #f59e0b" : `2px solid ${alter.color || "#9333ea"}`
          : "2px solid hsl(var(--border))",
      }}
      title={isFronting ? (isPrimary ? "Primary fronter — tap to remove, hold to keep as co-fronter" : "Co-fronting — tap to remove, hold to set primary") : "Tap to add to front, hold to set as primary"}
    >
      {isFronting ? (
        <Zap className="w-3.5 h-3.5" style={{ color: isPrimary ? "#f59e0b" : alter.color || "#9333ea" }} fill={isPrimary ? "#f59e0b" : alter.color || "#9333ea"} />
      ) : (
        <Zap className="w-3.5 h-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

export default function AlterCard({ alter, index, activeSessions = [], anonymize = "off" }) {
  const queryClient = useQueryClient();
  const hasColor = alter.color && alter.color.length > 3;
  const bgColor = hasColor ? alter.color : null;
  const textColor = hasColor ? getContrastColor(alter.color) : null;

  const cardRef = useRef(null);
  const gestureRef = useRef(null);
  const buttonRef = useRef(null);
  const activeSessionsRef = useRef(activeSessions);
  activeSessionsRef.current = activeSessions;

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const doToggleFront = () => {
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
        const s = activeSessionsRef.current;
        base44.entities.FrontingSession.create({
          alter_id: alter.id,
          start_time: new Date().toISOString(),
          is_primary: s.length === 0,
        })
          .then(() => {
            toast(`${alter.name} joined front`);
            queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
            queryClient.invalidateQueries({ queryKey: ["activeFront"] });
          })
          .catch(() => toast.error("Failed to update front"));
      }
    };

    const doTogglePrimary = () => {
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
      // Let the toggle button handle its own touches
      if (buttonRef.current && buttonRef.current.contains(e.target)) return;
      const touch = e.touches[0];
      gestureRef.current = { startX: touch.clientX, startY: touch.clientY, triggered: false };
    };

    const onTouchMove = (e) => {
      const g = gestureRef.current;
      if (!g) return;
      if (e.touches.length !== 1) { gestureRef.current = null; return; }
      const touch = e.touches[0];
      const dx = touch.clientX - g.startX;
      const dy = touch.clientY - g.startY;

      if (!g.triggered && Math.abs(dy) > Math.abs(dx) + 5) {
        gestureRef.current = null;
        return;
      }

      if (Math.abs(dx) > 6) e.preventDefault();
      if (g.triggered || Math.abs(dx) < SWIPE_THRESHOLD) return;

      g.triggered = true;
      if (navigator.vibrate) navigator.vibrate(40);
      if (dx > 0) doToggleFront();
      else doTogglePrimary();
    };

    const onTouchEnd = () => {
      gestureRef.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [alter.id, queryClient]);

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
      className="flex items-center gap-2"
      style={{ touchAction: "pan-y" }}>
      <Link to={`/alter/${alter.id}`} className="flex-1 min-w-0">
        <div className="bg-card pt-1 pr-4 pb-2 pl-3 rounded-xl flex items-center gap-3 border border-border/50 hover:bg-muted/30 hover:border-border transition-all cursor-pointer group"
          style={{ borderLeftColor: bgColor || "transparent", borderLeftWidth: bgColor ? 3 : 1 }}>
          <div
            className={`w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border border-border/40 ${anonymize === "all" ? "blur-sm" : ""}`}
            style={{ backgroundColor: bgColor || "hsl(var(--muted))" }}>
            {alter.avatar_url ? (
              <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
            ) : null}
            <div className="w-full h-full items-center justify-center"
              style={{ display: alter.avatar_url ? "none" : "flex", color: textColor || "hsl(var(--muted-foreground))" }}>
              <User className="w-5 h-5" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate ${anonymize !== "off" ? "blur-sm" : ""}`}>{alter.name}</p>
            {alter.pronouns && <p className={`text-xs text-muted-foreground truncate ${anonymize !== "off" ? "blur-sm" : ""}`}>{alter.pronouns}</p>}
          </div>
          {alter.role && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${anonymize !== "off" ? "blur-sm" : ""}`}
              style={{ backgroundColor: bgColor ? `${bgColor}20` : "hsl(var(--muted))", color: bgColor || "hsl(var(--muted-foreground))" }}>
              {alter.role}
            </span>
          )}
        </div>
      </Link>
      <div ref={buttonRef}>
        <FrontingToggleButton alter={alter} activeSessions={activeSessions} />
      </div>
    </motion.div>
  );
}