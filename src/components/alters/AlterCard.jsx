import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { User, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isValidHexColor } from "@/lib/colorUtils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { needsHalo, getSurfaceBackground, adjustForContrast } from "@/lib/contrast";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useRotatingImageUrl } from "@/lib/imageRotation";
import { anonymizeBlurNames, anonymizeBlurAvatars } from "@/hooks/useAnonymizeMode";
import { useFrontGesture, useHoldMenu } from "@/components/fronting/FrontLevelRail";
import AlterActionMenu from "./AlterActionMenu";

function getContrastColor(hex) {
  if (!hex) return "var(--color-text-secondary)";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

export function FrontingToggleButton({ alter, activeSessions = [], gesture = null }) {
  const terms = useTerms();
  // The standard front control (v0.122.0): tap while NOT fronting puts
  // them straight on at the TOP level; tap while fronting opens the
  // tap-to-pick spectrum; press-and-hold opens the drag rail. A surface
  // that already hosts a gesture kit passes it in; standalone uses (the
  // folder/group member rows) self-host one.
  const own = useFrontGesture();
  const g = gesture || own;
  const mySession = activeSessions.find(s => s.alter_id === alter.id);
  const isFronting = !!mySession;
  const isPrimary = mySession?.is_primary ?? false;

  return (
    <>
    <button
      type="button"
      {...g.getHoldProps(alter, mySession?.front_level)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (g.suppressed()) return;
        g.quickSet(alter, mySession);
      }}
      className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
      style={{
        backgroundColor: isFronting
          ? isPrimary ? "#f59e0b20" : `${alter.color || "#9333ea"}20`
          : "var(--color-muted)",
        border: isFronting
          ? isPrimary ? "2px solid #f59e0b" : `2px solid ${alter.color || "#9333ea"}`
          : "2px solid var(--color-muted)",
      }}
      title={isFronting
        ? `${terms.Fronting} — tap to adjust their level or remove, hold for the spectrum`
        : `Tap to add to ${terms.front} at the top level, hold to pick a level`}
    >
      {isFronting ? (
        <Zap className="w-3.5 h-3.5" style={{ color: isPrimary ? "#f59e0b" : alter.color || "#9333ea" }} fill={isPrimary ? "#f59e0b" : alter.color || "#9333ea"} />
      ) : (
        <Zap className="w-3.5 h-3.5 text-muted-foreground" />
      )}
    </button>
    {!gesture && own.node}
    </>
  );
}

export default function AlterCard({ alter, index, activeSessions = [], anonymize = "off", rightAccessory = null, hideFront = false }) {
  const formatAlter = useAlterLabel();
  // Resolve through the hook so legacy `local-image://` avatars render
  // (a raw <img src="local-image://…"> can't be loaded by the browser).
  const rotatingAvatarUrl = useRotatingImageUrl({ alterId: alter.id, role: "avatar", mode: alter.avatar_rotation_mode, fallbackUrl: alter.avatar_url, alter });
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

  // Alters-page grammar (owner spec, v0.122.1): the CHIP is about the
  // alter — tap opens their profile (the one place tap goes straight
  // there), press-and-hold opens their action menu. Fronting lives
  // entirely on the bolt button beside it (tap = add at the top level /
  // adjust, hold = the level rail). hideFront drops the bolt for lists
  // where fronting doesn't belong (group members etc.).
  const gesture = useFrontGesture();
  const [menuOpen, setMenuOpen] = useState(false);
  const holdMenu = useHoldMenu(() => setMenuOpen(true));
  const mySession = activeSessions.find(s => s.alter_id === alter.id);
  const fronting = !!mySession;
  const isPrimary = mySession?.is_primary ?? false;

  return (
    <div className="flex items-center gap-2 select-none">
      {gesture.node}
      <div className="flex-1 min-w-0 relative"
        {...holdMenu.bind}
        onClick={() => { if (!holdMenu.suppressed()) navigate(`/alter/${alter.id}`); }}>
        <div className="bg-card pt-1 pr-4 pb-2 pl-3 rounded-xl flex items-center gap-3 border border-border/50 hover:bg-muted/30 hover:border-border transition-all cursor-pointer group"
          style={{ borderLeftColor: bgColor || "transparent", borderLeftWidth: bgColor ? 3 : 1 }}>
          <div
            className={`w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border border-border/40 ${anonymizeBlurAvatars(anonymize) ? "blur-sm" : ""}`}
            style={{ backgroundColor: bgColor || "var(--color-muted)" }}>
            {resolvedAvatar ? (
              <img src={resolvedAvatar} alt={alter.name} className="w-full h-full object-cover"
                onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
            ) : null}
            <div className="w-full h-full items-center justify-center"
              style={{ display: resolvedAvatar ? "none" : "flex", color: textColor || "var(--color-text-secondary)" }}>
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
            // Long roles used to push the NAME off the card (the chip
            // couldn't shrink). It now yields: capped width, ellipsis, the
            // full text in the tooltip.
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink min-w-0 max-w-[45%] truncate ${anonymizeBlurNames(anonymize) ? "blur-sm" : ""}`}
              title={alter.role}
              style={{
                backgroundColor: fillColor ? `${fillColor}${halo ? "55" : "20"}` : "var(--color-muted)",
                color: halo ? "var(--color-text-primary)" : (bgColor || "var(--color-text-secondary)"),
              }}>
              {alter.role}
            </span>
            );
          })()}
        </div>
      </div>
      {rightAccessory}
      {!hideFront && <FrontingToggleButton alter={alter} activeSessions={activeSessions} gesture={gesture} />}
      {menuOpen && (
        <AlterActionMenu alter={alter} activeSessions={activeSessions} session={mySession}
          onClose={() => setMenuOpen(false)} />
      )}
    </div>
  );
}