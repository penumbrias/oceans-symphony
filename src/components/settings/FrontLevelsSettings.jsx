// Fronting levels — Settings → Tracking setup.
//
// THE fronting system (always on since v0.121.0): the list is ordered
// closest-to-front first; each level has a label and a "counts as
// {fronting} time" flag that analytics honour. The default two levels ARE
// the classic fronting/co-fronting pair, so simple systems keep exactly
// the model they had.

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, Plus, Trash2, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useTerms } from "@/lib/useTerms";
import {
  useFrontLevels, DEFAULT_FRONT_LEVELS, newFrontLevelId, frontLevelLabel,
} from "@/lib/frontLevels";
import FrontLevelStylesEditor from "@/components/fronting/FrontLevelStylesEditor";

export default function FrontLevelsSettings() {
  const terms = useTerms();
  const qc = useQueryClient();
  const cfg = useFrontLevels();
  const [busy, setBusy] = useState(false);

  const persist = async (next) => {
    setBusy(true);
    try {
      if (cfg._settingsId) {
        await base44.entities.SystemSettings.update(cfg._settingsId, { front_levels: next });
      } else {
        await base44.entities.SystemSettings.create({ front_levels: next });
      }
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch {
      toast.error("Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  const save = (patch) => persist({ levels: cfg.levels, solo_swipe: cfg.solo_swipe, ...patch });
  const saveSolo = (patch) => save({ solo_swipe: { ...cfg.solo_swipe, ...patch } });

  const updateLevel = (id, change) =>
    save({ levels: cfg.levels.map((l) => (l.id === id ? { ...l, ...change } : l)) });
  const moveLevel = (id, dir) => {
    const i = cfg.levels.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cfg.levels.length) return;
    const next = [...cfg.levels];
    [next[i], next[j]] = [next[j], next[i]];
    save({ levels: next });
  };
  const removeLevel = (id) => {
    if (cfg.levels.length <= 2) { toast.error("Keep at least two levels"); return; }
    save({ levels: cfg.levels.filter((l) => l.id !== id) });
  };
  const addLevel = () =>
    save({ levels: [...cfg.levels, { id: newFrontLevelId(), label: "New level", counts_as_front: false }] });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">{terms.Fronting} levels</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          How close each {terms.alter} is to {terms.front}. The default two levels
          are the classic {terms.fronting}/co-{terms.fronting} pair — add levels
          (Close to {terms.front}, Observing, …) if your {terms.system} experiences
          more of a spectrum. Whoever sits at the topmost level leads.
        </p>
      </div>

      {(
        <>
          <p className="text-[0.6875rem] text-muted-foreground uppercase tracking-wide">
            Closest to {terms.front} first
          </p>
          <div className="space-y-2">
            {cfg.levels.map((level, i) => (
              <div key={level.id} className="rounded-xl border border-border/50 p-2.5 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Input
                    defaultValue={frontLevelLabel(level, terms)}
                    maxLength={40}
                    className="h-8 text-sm flex-1"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== frontLevelLabel(level, terms)) updateLevel(level.id, { label: v });
                    }}
                  />
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={i === 0 || busy}
                    aria-label="Move up" onClick={() => moveLevel(level.id, -1)}>
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={i === cfg.levels.length - 1 || busy}
                    aria-label="Move down" onClick={() => moveLevel(level.id, 1)}>
                    <ArrowDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    disabled={busy} aria-label="Delete level" onClick={() => removeLevel(level.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>Counts as {terms.fronting} time (analytics & reports)</span>
                  <Switch checked={level.counts_as_front} disabled={busy}
                    onCheckedChange={(v) => updateLevel(level.id, { counts_as_front: !!v })} />
                </label>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" disabled={busy} onClick={addLevel}>
              <Plus className="w-3.5 h-3.5" /> Add level
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground" disabled={busy}
              onClick={() => save({ levels: DEFAULT_FRONT_LEVELS })}>
              <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
            </Button>
          </div>
          <p className="text-[0.6875rem] text-muted-foreground">
            Set a level from the Set {terms.Front} window, an {terms.alter}'s panel in
            Currently {terms.Fronting}, or (new UI) press-and-hold an {terms.alter} in
            the who's-here widget and drag along the spectrum.
          </p>

          {/* Per-level display styles — the ONE editor (also reached from
              the pinned bar's panel via this same component). */}
          <FrontLevelStylesEditor />

          {/* The rail's sideways "sole" gesture — while holding and picking
              a level, sliding sideways commits the alter as the only one. */}
          <div className="rounded-xl border border-border/50 p-2.5 space-y-2.5">
            <label className="flex items-center justify-between gap-3 text-xs font-medium">
              <span>Slide sideways for "sole {terms.fronter}"</span>
              <Switch checked={cfg.solo_swipe.enabled} disabled={busy}
                onCheckedChange={(v) => saveSolo({ enabled: !!v })} />
            </label>
            {cfg.solo_swipe.enabled && (
              <>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>Slide direction</span>
                  <div className="flex gap-1">
                    {[["left", "Left"], ["right", "Right"]].map(([v, label]) => (
                      <button key={v} type="button" disabled={busy} aria-pressed={cfg.solo_swipe.direction === v}
                        onClick={() => saveSolo({ direction: v })}
                        className={`text-xs px-2.5 py-1 rounded-full border ${cfg.solo_swipe.direction === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>What it clears</span>
                  <div className="flex gap-1">
                    {[["level", "That level"], ["all", `Everyone else`]].map(([v, label]) => (
                      <button key={v} type="button" disabled={busy} aria-pressed={cfg.solo_swipe.scope === v}
                        onClick={() => saveSolo({ scope: v })}
                        className={`text-xs px-2.5 py-1 rounded-full border ${cfg.solo_swipe.scope === v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[0.6875rem] text-muted-foreground">
                  {cfg.solo_swipe.scope === "all"
                    ? `Everyone else leaves ${terms.front} — the held ${terms.alter} becomes the only one.`
                    : `Other ${terms.alters} at the picked level move one level further out (or leave ${terms.front} if it's the last level).`}
                </p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
