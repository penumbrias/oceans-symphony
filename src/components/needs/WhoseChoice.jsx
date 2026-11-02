// "Whose is it?" for a wish or a turn (v0.331.0). Three answers:
//   • In front now — whoever is in front when it's saved, read fresh at
//     save time through defaultAttributionIds() (so the person's "Entries
//     belong to" setting applies). Nobody in front = the whole system.
//   • Whole system — nobody in particular (a wish "for everyone").
//   • Pick… — the standard searchable alter picker (SetFrontModal).
//
// Value: { mode: "front" | "everyone" | "pick", ids: [] }. Resolve it to
// owner ids with resolveWhose(value) right before the write.
// Sized in em so it follows a widget's own text size; chrome uses the
// widget accent (falling back to the app's primary off a board).

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import SetFrontModal from "@/components/fronting/SetFrontModal";
import { defaultAttributionIds } from "@/lib/checkinEntry";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";

export const WHOSE_FRONT = "front";
export const WHOSE_EVERYONE = "everyone";
export const WHOSE_PICK = "pick";
export const whoseFront = () => ({ mode: WHOSE_FRONT, ids: [] });
export const whoseEveryone = () => ({ mode: WHOSE_EVERYONE, ids: [] });
export const whosePicked = (ids) => (ids?.length ? { mode: WHOSE_PICK, ids: [...ids] } : whoseEveryone());

// [] means "the whole system".
export async function resolveWhose(whose) {
  if (whose?.mode === WHOSE_PICK) return (whose.ids || []).filter(Boolean);
  if (whose?.mode === WHOSE_EVERYONE) return [];
  try { return (await defaultAttributionIds()) || []; } catch { return []; }
}

const ACCENT = "var(--v2-accent, var(--color-primary))";
export const chipStyle = (on) => (on
  ? { borderColor: ACCENT, color: ACCENT, background: `color-mix(in srgb, ${ACCENT} 12%, transparent)` }
  : { borderColor: "color-mix(in srgb, currentColor 20%, transparent)" });
export const chipCls = "min-h-[2.25em] px-[0.8em] rounded-full border text-[0.8125em] disabled:opacity-40";

export default function WhoseChoice({ value, onChange, label = null, allowFront = true }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const [picking, setPicking] = useState(false);
  const mode = value?.mode || (allowFront ? WHOSE_FRONT : WHOSE_EVERYONE);
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list().catch(() => []) });
  // What "In front now" would save, shown under the choice. The ["activeFront"]
  // prefix means a switch refreshes it.
  const { data: frontIds = [] } = useQuery({
    queryKey: ["activeFront", "attribution"], queryFn: defaultAttributionIds, enabled: allowFront && mode === WHOSE_FRONT,
  });
  const byId = useMemo(() => new Map(alters.map((a) => [a.id, a])), [alters]);
  const names = (ids) => ids.map((id) => byId.get(id)).filter(Boolean).map((a) => formatAlter(a)).join(", ");

  const options = [
    ...(allowFront ? [{ id: WHOSE_FRONT, label: `${t.Fronting} now` }] : []),
    { id: WHOSE_EVERYONE, label: `Whole ${t.system}` },
    { id: WHOSE_PICK, label: mode === WHOSE_PICK ? `${t.Alters}…` : `Pick ${t.alters}…` },
  ];
  const pick = (id) => {
    if (id === WHOSE_PICK) { setPicking(true); return; }
    onChange(id === WHOSE_FRONT ? whoseFront() : whoseEveryone());
  };

  let hint = null;
  if (mode === WHOSE_FRONT) {
    hint = frontIds.length ? names(frontIds) : `Nobody's ${t.fronting}, so it's for the whole ${t.system}.`;
  } else if (mode === WHOSE_PICK) {
    hint = names(value?.ids || []);
  }

  return (
    <div className="space-y-[0.3em]">
      {label && <p className="text-[0.75em] opacity-70">{label}</p>}
      <div role="radiogroup" aria-label={label || `Whose`} className="flex flex-wrap gap-[0.35em]">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={mode === o.id} onClick={() => pick(o.id)}
            className={chipCls} style={chipStyle(mode === o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      {hint && (
        mode === WHOSE_PICK
          ? <button type="button" onClick={() => setPicking(true)} className="text-[0.75em] opacity-70 hover:opacity-100 text-left underline-offset-2 hover:underline">{hint}</button>
          : <p className="text-[0.75em] opacity-70">{hint}</p>
      )}
      <SetFrontModal open={picking} onClose={() => setPicking(false)}
        preselectedIds={mode === WHOSE_PICK ? value?.ids : []}
        selectionTitle={`Whose is it?`} selectionHint={`Pick one or more ${t.alters}. None picked = the whole ${t.system}.`}
        confirmLabel="Done"
        onConfirm={(ids) => onChange(whosePicked(ids))} />
    </div>
  );
}
