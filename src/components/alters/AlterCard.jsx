import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { User, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isValidHexColor } from "@/lib/colorUtils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import useSwipeActions, { toggleFrontFor, togglePrimaryFor, replaceFrontWith } from "@/hooks/useSwipeActions";
import { useTerms } from "@/lib/useTerms";
import { needsHalo, getSurfaceBackground, adjustForContrast } from "@/lib/contrast";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useRotatingImageUrl } from "@/lib/imageRotation";
import { anonymizeBlurNames, anonymizeBlurAvatars } from "@/hooks/useAnonymizeMode";
import AlterActionMenu from "./AlterActionMenu";

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
  const terms = useTerms();
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
      // Refetch — never trust the render-time `activeSessions` snapshot. A
      // rapid second tap can fire after a previous tap's invalidation queued
      // a refetch but before it landed, so the closure can claim there's no
      // primary when one was just created. Match the pattern used by
      // useSwipeActions.togglePrimaryFor.
      const fresh = await base44.entities.FrontingSession.filter({ is_active: true });
      const freshMySession = fresh.find(s => s.alter_id === alter.id);
      if (freshMySession) {
        // Remove this alter from front
        await base44.entities.FrontingSession.update(freshMySession.id, {
          is_active: false,
          end_time: new Date().toISOString(),
        });
        toast.success(`${alter.name} removed from ${terms.front}`);
      } else {
        // Add alter to front (as co-fronter by default — promote to primary
        // only if nobody else holds primary right now)
        const hasPrimary = fresh.some(s => s.is_primary);
        await base44.entities.FrontingSession.create({
          alter_id: alter.id,
          is_primary: !hasPrimary,
          start_time: new Date().toISOString(),
          is_active: true,
        });
        toast.success(`${alter.name} added to ${terms.front}!`);
      }
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    } catch (err) {
      toast.error(err.message || `Failed to update ${terms.front}`);
    }
  };

  const handleSetPrimary = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      // Always refetch — the long-press timer runs 600ms after touchstart and
      // the closure-captured `activeSessions` may be stale by the time the
      // handler fires (parent re-renders frequently from query invalidations).
      const fresh = await base44.entities.FrontingSession.filter({ is_active: true });
      const freshMySession = fresh.find(s => s.alter_id === alter.id);
      const freshIsPrimary = !!freshMySession?.is_primary;

      if (freshIsPrimary) {
        // Already primary → demote
        await base44.entities.FrontingSession.update(freshMySession.id, { is_primary: false });
        toast.success(`${alter.name} demoted to co-${terms.fronter}`);
      } else {
        // Demote EVERY existing primary, not just the first match — handles
        // any case where stale duplicate primaries leaked into the DB.
        for (const s of fresh.filter(s => s.is_primary && s.alter_id !== alter.id)) {
          try { await base44.entities.FrontingSession.update(s.id, { is_primary: false }); } catch {}
        }
        if (freshMySession) {
          await base44.entities.FrontingSession.update(freshMySession.id, { is_primary: true });
        } else {
          await base44.entities.FrontingSession.create({
            alter_id: alter.id,
            is_primary: true,
            start_time: new Date().toISOString(),
            is_active: true,
          });
        }
        toast.success(`${alter.name} is now primary!`);
      }
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
      title={isFronting ? (isPrimary ? `Primary ${terms.fronter} — tap to remove, hold to keep as co-${terms.fronter}` : `Co-${terms.fronting} — tap to remove, hold to set primary`) : `Tap to add to ${terms.front}, hold to set as primary`}
    >
      {isFronting ? (
        <Zap className="w-3.5 h-3.5" style={{ color: isPrimary ? "#f59e0b" : alter.color || "#9333ea" }} fill={isPrimary ? "#f59e0b" : alter.color || "#9333ea"} />
      ) : (
        <Zap className="w-3.5 h-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

export default function AlterCard({ alter, index, activeSessions = [], anonymize = "off", rightAccessory = null, hideFront = false }) {
  const formatAlter = useAlterLabel();
  // Resolve through the hook so legacy `local-image://` avatars render
  // (a raw <img src="local-image://…"> can't be loaded by the browser).
  const rotatingAvatarUrl = useRotatingImageUrl({ alterId: alter.id, role: "avatar", mode: alter.avatar_rotation_mode, fallbackUrl: alter.avatar_url });
  const resolvedAvatar = useResolvedAvatarUrl(rotatingAvatarUrl);
  // Validate the saved value as a real CSS hex. `length > 3` used to
  // pass for invalid values like "#8b5c1" (5 hex digits — not a valid
  // CSS hex), which made the row render with no colour at all.
  const hasColor = isValidHexColor(alter.color);
  const bgColor = hasColor ? alter.color : null;
  const textColor = hasColor ? getContrastColor(alter.color) : null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const terms = useTerms();
  const [menuOpen, setMenuOpen] = useState(false);

  // Long-press opens the quick-actions menu (profile, subsystem, front,
  // primary, add to groups). The swipe hook cancels the long-press on any
  // movement, so it never collides with the front/primary swipe gestures.
  // hideFront removes the inline front/primary controls (the bolt + the
  // swipe gestures) — used where adjusting front from the chip doesn't
  // belong, e.g. a group/subsystem members list. Tap (open) and long-press
  // (menu) still work.
  const { bind, dragX, swipeHint } = useSwipeActions({
    onTap: () => navigate(`/alter/${alter.id}`),
    onSwipeRight: hideFront ? undefined : () => toggleFrontFor(alter, activeSessions, base44, queryClient, toast, terms),
    onSwipeLeft: hideFront ? undefined : () => togglePrimaryFor(alter, activeSessions, base44, queryClient, toast, terms),
    onSwipeLeftUp: hideFront ? undefined : () => replaceFrontWith(alter, base44, queryClient, toast, terms),
    onLongPress: () => setMenuOpen(true),
  });

  const mySession = activeSessions.find(s => s.alter_id === alter.id);
  const fronting = !!mySession;
  const isPrimary = mySession?.is_primary ?? false;

  return (
    <div className="flex items-center gap-2 select-none">
      <div className="flex-1 min-w-0 relative" {...bind}
        style={{
          transform: hideFront ? undefined : `translateX(${dragX}px)`,
          transition: dragX === 0 ? "transform 150ms ease-out" : "none",
          touchAction: "pan-y",
        }}>
        {!hideFront && swipeHint && (
          <span className={`absolute top-1 right-2 text-[0.5625rem] font-semibold uppercase tracking-wide pointer-events-none z-10 ${swipeHint === "front" ? "text-emerald-500" : swipeHint === "solo" ? "text-primary" : "text-amber-500"}`}>
            {swipeHint === "front" ? (fronting ? "Remove" : "Add") : swipeHint === "solo" ? "Solo" : (isPrimary ? "Demote" : "Promote")}
          </span>
        )}
        <div className="bg-card pt-1 pr-4 pb-2 pl-3 rounded-xl flex items-center gap-3 border border-border/50 hover:bg-muted/30 hover:border-border transition-all cursor-pointer group"
          style={{ borderLeftColor: bgColor || "transparent", borderLeftWidth: bgColor ? 3 : 1 }}>
          <div
            className={`w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border border-border/40 ${anonymizeBlurAvatars(anonymize) ? "blur-sm" : ""}`}
            style={{ backgroundColor: bgColor || "hsl(var(--muted))" }}>
            {resolvedAvatar ? (
              <img src={resolvedAvatar} alt={alter.name} className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
            ) : null}
            <div className="w-full h-full items-center justify-center"
              style={{ display: resolvedAvatar ? "none" : "flex", color: textColor || "hsl(var(--muted-foreground))" }}>
              <User className="w-5 h-5" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate ${anonymizeBlurNames(anonymize) ? "blur-sm" : ""}`}>
              {alter.emoji ? <span className="mr-1">{alter.emoji}</span> : null}{formatAlter(alter)}
            </p>
            {alter.pronouns && <p className={`text-xs text-muted-foreground truncate ${anonymizeBlurNames(anonymize) ? "blur-sm" : ""}`}>{alter.pronouns}</p>}
          </div>
          {alter.role && (() => {
            // The role chip sits on bg-card (the surface colour). If the
            // alter's chosen colour is so close to that surface that the
            // soft tint + text disappear, drop a thin neutral ring around
            // the chip so it stays visible — the colour itself is preserved.
            const surfaceBg = getSurfaceBackground();
            const halo = bgColor && needsHalo(bgColor, surfaceBg);
            const fillColor = halo ? adjustForContrast(bgColor, surfaceBg) : bgColor;
            return (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${anonymizeBlurNames(anonymize) ? "blur-sm" : ""}`}
              style={{
                backgroundColor: fillColor ? `${fillColor}${halo ? "55" : "20"}` : "hsl(var(--muted))",
                color: halo ? "hsl(var(--foreground))" : (bgColor || "hsl(var(--muted-foreground))"),
              }}>
              {alter.role}
            </span>
            );
          })()}
        </div>
      </div>
      {rightAccessory}
      {!hideFront && <FrontingToggleButton alter={alter} activeSessions={activeSessions} />}
      {menuOpen && <AlterActionMenu alter={alter} activeSessions={activeSessions} onClose={() => setMenuOpen(false)} />}
    </div>
  );
}