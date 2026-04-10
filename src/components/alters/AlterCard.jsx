import React, { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { User, ChevronRight, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createIndividualSession, normalizeSessions } from "@/lib/frontingUtils";

function getContrastColor(hex) {
  if (!hex) return "hsl(var(--muted-foreground))";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

export function FrontingToggleButton({ alter, currentSession }) {
  const queryClient = useQueryClient();
  const longPressRef = useRef(null);
const isFronting = currentSession && (
  currentSession.alter_id === alter.id ||
  currentSession.primary_alter_id === alter.id ||
  (currentSession.co_fronter_ids || []).includes(alter.id)
);
  const isPrimary = currentSession?.primary_alter_id === alter.id;

 const handleToggle = async (e) => {
  e.preventDefault();
  e.stopPropagation();
  try {
    const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });
    const normalized = normalizeSessions(activeSessions);
    const activeFronterIds = normalized.filter(s => s.is_active).map(s => s.alterId);
    const isAlreadyFronting = activeFronterIds.includes(alter.id);

    if (activeSessions.length === 0 || !isAlreadyFronting) {
      // Add this alter — create a new individual session
      await createIndividualSession(base44.entities, {
        alterId: alter.id,
        startTime: new Date().toISOString(),
        isActive: true,
      });
      toast.success(`${alter.name} is now fronting!`);
    } else {
      // Remove this alter — find and end their session
      const alterSession = normalized.find(s => s.alterId === alter.id && s.is_active);
      if (alterSession) {
        if (alterSession.isLegacy) {
          // Legacy record — remove from group
          const raw = alterSession.raw;
          const remaining = [raw.primary_alter_id, ...(raw.co_fronter_ids || [])]
            .filter(id => id && id !== alter.id);
          if (remaining.length === 0) {
            await base44.entities.FrontingSession.update(raw.id, { is_active: false, end_time: new Date().toISOString() });
          } else {
            await base44.entities.FrontingSession.update(raw.id, {
              primary_alter_id: remaining[0],
              co_fronter_ids: remaining.slice(1),
            });
          }
        } else {
          // New individual record — just end it
          await base44.entities.FrontingSession.update(alterSession.sessionId, {
            is_active: false,
            end_time: new Date().toISOString(),
          });
        }
        toast.success(`${alter.name} removed from front`);
      }
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
    const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });
    const normalized = normalizeSessions(activeSessions);
    const isAlreadyFronting = normalized.some(s => s.alterId === alter.id && s.is_active);

    if (!isAlreadyFronting) {
      await createIndividualSession(base44.entities, {
        alterId: alter.id,
        startTime: new Date().toISOString(),
        isActive: true,
      });
    }
    toast.success(`${alter.name} is now fronting!`);
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

export default function AlterCard({ alter, index, currentSession = null }) {
  const hasColor = alter.color && alter.color.length > 3;
  const bgColor = hasColor ? alter.color : null;
  const textColor = hasColor ? getContrastColor(alter.color) : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
      className="flex items-center gap-2">
      <Link to={`/alter/${alter.id}`} className="flex-1 min-w-0">
        <div className="bg-card pt-1 pr-4 pb-2 pl-3 rounded-xl flex items-center gap-3 border border-border/50 hover:bg-muted/30 hover:border-border transition-all cursor-pointer group"
          style={{ borderLeftColor: bgColor || "transparent", borderLeftWidth: bgColor ? 3 : 1 }}>
          <div
            className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border border-border/40"
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
            <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">{alter.name}</p>
            {alter.pronouns && <p className="text-xs text-muted-foreground truncate">{alter.pronouns}</p>}
          </div>
          {alter.role && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: bgColor ? `${bgColor}20` : "hsl(var(--muted))", color: bgColor || "hsl(var(--muted-foreground))" }}>
              {alter.role}
            </span>
          )}
        </div>
      </Link>
      <FrontingToggleButton alter={alter} currentSession={currentSession} />
    </motion.div>
  );
}