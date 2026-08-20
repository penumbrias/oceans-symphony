// Per-front-level display styles — shape / size / ring per level, stored in
// pinned_alters_config.levelStyles. ONE editor, embedded by
// FrontLevelsSettings (Settings → Tracking setup + the setup guide + the
// pinned bar's config panel via its Front-levels section) so the controls
// exist exactly once. Consumed by the pinned bar AND the alter lists
// (AlterCard) — the level's look is a system-wide display fact.

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useFrontLevels, frontLevelLabel } from "@/lib/frontLevels";
import { AVATAR_SHAPES, shapeLayerStyles } from "@/lib/avatarShapes";

export default function FrontLevelStylesEditor() {
  const terms = useTerms();
  const qc = useQueryClient();
  const levelCfg = useFrontLevels();
  const { data: rows = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settings = rows[0] || null;
  const config = settings?.pinned_alters_config || {};
  const levelStyles = (config.levelStyles && typeof config.levelStyles === "object") ? config.levelStyles : {};

  const setLevelStyle = async (levelId, patch) => {
    const cur = levelStyles[levelId] || {};
    const next = { ...cur, ...patch };
    for (const k of Object.keys(next)) if (next[k] === "" || next[k] == null) delete next[k];
    const all = { ...levelStyles };
    if (Object.keys(next).length) all[levelId] = next; else delete all[levelId];
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, { pinned_alters_config: { ...config, levelStyles: all } });
      } else {
        await base44.entities.SystemSettings.create({ pinned_alters_config: { levelStyles: all } });
      }
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch { /* next interaction retries */ }
  };

  if (!levelCfg?.enabled || !levelCfg.levels.length) return null;
  return (
    <div className="space-y-2.5">
      <p className="text-[0.6875rem] text-muted-foreground">
        Shape, size and ring per level — shown wherever {terms.fronting} {terms.alters} appear (pinned bar, {terms.alters} page).
      </p>
      {levelCfg.levels.map((lv) => {
        const ls = levelStyles[lv.id] || {};
        return (
          <div key={lv.id} className="rounded-lg border border-border/40 p-2 space-y-1.5">
            <p className="text-xs font-medium">{frontLevelLabel(lv, terms)}</p>
            <div className="flex flex-wrap items-center gap-1">
              <button type="button" aria-pressed={!ls.shape} title="Same shape as the bar"
                onClick={() => setLevelStyle(lv.id, { shape: "" })}
                className={`text-[0.6875rem] px-2 py-1 rounded-full border ${!ls.shape ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>—</button>
              {AVATAR_SHAPES.map((sh) => {
                const layers = shapeLayerStyles(sh.id);
                const on = ls.shape === sh.id;
                return (
                  <button key={sh.id} type="button" aria-pressed={on} aria-label={sh.label} title={sh.label}
                    onClick={() => setLevelStyle(lv.id, { shape: sh.id })}
                    className={`w-7 h-7 rounded-md border flex items-center justify-center ${on ? "border-primary/60 bg-primary/10" : "border-border/50"}`}>
                    <span className="w-4 h-4 block" style={{ background: on ? "var(--color-primary)" : "var(--color-text-secondary)", ...layers.inner }} />
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[0.6875rem] text-muted-foreground w-8">Size</span>
              {[["", "—"], [100, "100%"], [115, "115%"], [133, "133%"], [155, "155%"]].map(([v, lab]) => (
                <button key={lab} type="button" aria-pressed={(ls.scale ?? "") === v}
                  onClick={() => setLevelStyle(lv.id, { scale: v })}
                  className={`text-[0.6875rem] px-2 py-1 rounded-full border ${(ls.scale ?? "") === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>{lab}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[0.6875rem] text-muted-foreground w-8">Ring</span>
              {[["", "—"], [2, "2px"], [3, "3px"], [4, "4px"], [6, "6px"]].map(([v, lab]) => (
                <button key={lab} type="button" aria-pressed={(ls.ringW ?? "") === v}
                  onClick={() => setLevelStyle(lv.id, { ringW: v })}
                  className={`text-[0.6875rem] px-2 py-1 rounded-full border ${(ls.ringW ?? "") === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>{lab}</button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
