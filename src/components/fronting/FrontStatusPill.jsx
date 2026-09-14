import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { useTerms } from "@/lib/useTerms";
import { getSessionLevel, frontLevelLabel } from "@/lib/frontLevels";
import { toggleFrontFor } from "@/hooks/useSwipeActions";
import { useFrontGesture, commitFrontLevel } from "@/components/fronting/FrontLevelRail";

// The fronting STATUS PILL — the shared control grammar in one chip:
//
//   tap  → the configured tap action (Fronting-levels settings):
//            "toggle"   add / remove from front (default)
//            "level_up" step one level closer to front
//            "picker"   open the level picker
//   hold → the level rail (hold and slide), exactly as on every other
//          front-capable surface.
//
// Shows where the alter stands right now: their level while fronting,
// "Not fronting" otherwise. First mounted in AlterActionMenu's header
// (replacing the old level dropdown); designed to spread to any surface
// that shows an alter's fronting status.
export default function FrontStatusPill({ alter, session = null, className = "" }) {
  const t = useTerms();
  const qc = useQueryClient();
  const gesture = useFrontGesture();
  const cfg = gesture.cfg;

  const isFronting = !!session;
  const levelId = isFronting ? getSessionLevel(session, cfg) : null;
  const level = levelId ? cfg.levels.find((l) => l.id === levelId) : null;
  const label = isFronting
    ? (level ? frontLevelLabel(level, t) : t.Fronting)
    : `Not ${t.fronting}`;

  const stepLevelUp = async () => {
    if (!isFronting) {
      // Joining via "level up" starts at the OUTERMOST level and walks in.
      const outer = cfg.levels[cfg.levels.length - 1];
      await toggleFrontFor(alter, [], base44, qc, toast, t);
      if (outer) await commitFrontLevel({ alterId: alter.id, levelId: outer.id, queryClient: qc, cfg });
      return;
    }
    const idx = cfg.levels.findIndex((l) => l.id === levelId);
    if (idx <= 0) return; // already front-most
    await commitFrontLevel({ alterId: alter.id, levelId: cfg.levels[idx - 1].id, queryClient: qc, cfg });
  };

  const onTap = async () => {
    // A hold that just committed on the rail fires a trailing click —
    // the shared gesture hook tracks that window.
    if (gesture.suppressed()) return;
    try {
      if (cfg.tap_action === "picker") await gesture.quickSet(alter, session);
      else if (cfg.tap_action === "level_up") await stepLevelUp();
      else await toggleFrontFor(alter, [], base44, qc, toast, t);
    } catch (e) {
      toast.error(e?.message || "Failed");
    }
  };

  const holdProps = cfg.enabled ? gesture.getHoldProps(alter, levelId) : {};

  return (
    <>
      <button
        type="button"
        {...holdProps}
        onClick={onTap}
        aria-label={`${alter?.name || t.Alter}: ${label}. Tap to ${
          cfg.tap_action === "picker" ? "pick a level" : cfg.tap_action === "level_up" ? "step a level up" : `toggle ${t.fronting}`
        }, hold and slide for the level rail.`}
        style={{ touchAction: "pan-y" }}
        className={`px-2.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap select-none transition-colors ${
          isFronting
            ? "border-primary/60 bg-primary/10 text-primary"
            : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40"
        } ${className}`}
      >
        {label}
      </button>
      {gesture.node}
    </>
  );
}
