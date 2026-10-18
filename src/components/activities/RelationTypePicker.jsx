// The relation chips in the "Link alter" form: the preset relations plus
// the user's own types (ActivityLinkType). New types can be made right
// here, and "Edit your types" renames them, changes what they count as, or
// removes them. Removing is a soft mark, so links that use a removed type
// keep its label.

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/shared/ConfirmDialog";
import {
  allRelations, COUNTS_AS, LINK_TYPES_QUERY_KEY, createLinkType, updateLinkType, removeLinkType,
} from "@/lib/activityLinks";

const chip = (on) => `text-xs px-2.5 py-1 rounded-full border ${on ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground"}`;
const inputCls = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";

function CountsAsChoice({ value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {COUNTS_AS.map((c) => (
        <button key={c.id || "none"} type="button" role="radio" aria-checked={(value || null) === c.id}
          onClick={() => onChange(c.id)} className={chip((value || null) === c.id)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

export default function RelationTypePicker({ value, onChange, types = [] }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [countsAs, setCountsAs] = useState(null);
  const [managing, setManaging] = useState(false);
  const [busy, setBusy] = useState(false);

  const shown = allRelations(types, { includeRemoved: true }).filter((r) => !r.removed || r.id === value);
  const mine = types.filter((ct) => !ct.removed_at);
  const refresh = () => qc.invalidateQueries({ queryKey: LINK_TYPES_QUERY_KEY });

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); refresh(); }
    catch (e) { toast.error(e?.message || "Couldn't save that."); }
    finally { setBusy(false); }
  };

  const add = () => {
    const v = label.trim();
    if (!v) return;
    if (shown.some((r) => r.label.toLowerCase() === v.toLowerCase())) { toast.error("There's already a type with that name."); return; }
    run(async () => {
      const row = await createLinkType(v, countsAs);
      onChange(row.id);
      setLabel(""); setCountsAs(null); setAdding(false);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {shown.map((r) => (
          <button key={r.id} type="button" aria-pressed={value === r.id} onClick={() => onChange(r.id)} className={chip(value === r.id)}>
            {r.label}
          </button>
        ))}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={`${chip(false)} flex items-center gap-1 border-dashed`}>
            <Plus className="w-3 h-3" /> Your own
          </button>
        )}
      </div>

      {adding && (
        <div className="rounded-lg border border-border/60 p-2 space-y-1.5">
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus
            aria-label="New link type" placeholder="e.g. Comforted by, Learning, Shares with…"
            onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <CountsAsChoice value={countsAs} onChange={setCountsAs} label="What it counts as" />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !label.trim()} onClick={add}>Add type</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setLabel(""); }}>Cancel</Button>
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <button type="button" onClick={() => setManaging((m) => !m)} className="text-xs text-primary hover:underline">
          {managing ? "Done editing types" : "Edit your types"}
        </button>
      )}
      {managing && (
        <div className="space-y-2">
          {mine.map((ct) => (
            <div key={ct.id} className="rounded-lg border border-border/60 p-2 space-y-1.5">
              <div className="flex gap-2 items-center">
                <input className={inputCls} defaultValue={ct.label} aria-label={`Rename ${ct.label}`}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== ct.label) run(() => updateLinkType(ct, { label: v }));
                    else e.target.value = ct.label;
                  }} />
                <button type="button" aria-label={`Remove ${ct.label}`} disabled={busy}
                  className="p-1 text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Remove "${ct.label}"?`,
                      body: "It won't be offered for new links. Links that already use it keep it.",
                      confirmLabel: "Remove",
                    });
                    if (ok) run(() => removeLinkType(ct));
                  }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <CountsAsChoice value={ct.counts_as} label={`What ${ct.label} counts as`}
                onChange={(id) => run(() => updateLinkType(ct, { counts_as: id }))} />
            </div>
          ))}
          <p className="text-[0.6875rem] text-muted-foreground">
            "Counts as a need" puts it on the Needs balance. "Counts as interrupting" shows the gentle note when the activity starts.
          </p>
        </div>
      )}
    </div>
  );
}
