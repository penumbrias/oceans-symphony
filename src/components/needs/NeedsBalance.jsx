// The whole needs balance (v0.331.0): every alter, longest waiting first,
// each with what they enjoy, need or wished for and how long since it last
// happened, with a Plan it button on each. This is the Needs balance
// widget's expanded view, which the Needs page's Balance page starts with.
// Reads buildBalance (src/lib/needs.js), like the compact widget, so the
// numbers always agree. Sized in em (widget contract).

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { CalendarPlus } from "lucide-react";
import PlanTimeChoice from "@/components/planner/PlanTimeChoice";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { Dot, Muted } from "@/v2/primitives";
import { altersWithoutNeeds, planBalanceItem } from "@/lib/needs";

const sinceLabel = (iso) => (iso ? `${formatDistanceToNowStrict(new Date(iso))} ago` : "not yet");

function BalanceItem({ item, alter, categories }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const plan = async (when) => {
    setBusy(true);
    try {
      await planBalanceItem(item, alter, when, categories);
      toast.success("Planned");
      setPlanning(false);
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };
  const canPlan = item.kind === "activity" || !!item.categoryId;
  return (
    <li>
      <div className="flex items-center gap-[0.5em] min-h-[2.75em]">
        <span aria-hidden="true" className="text-[0.875em]">{item.kind === "wish" ? "💗" : "✨"}</span>
        <button type="button" className="flex-1 min-w-0 text-left truncate text-[0.875em]"
          onClick={() => navigate(item.kind === "wish"
            ? `/needs?tab=wishes&highlight=${item.wish.id}`
            : `/activities?category=${item.categoryId}`)}>
          {item.title}
        </button>
        <span className="text-[0.75em] whitespace-nowrap" style={item.last ? { opacity: 0.7 } : { color: "var(--v2-accent, var(--color-primary))" }}>
          {sinceLabel(item.last)}
        </span>
        {canPlan && (
          <button type="button" aria-label={`Plan ${item.title}`} title="Plan it" disabled={busy} aria-expanded={planning}
            className="w-11 h-11 -my-1 flex items-center justify-center rounded-lg opacity-70 hover:opacity-100 disabled:opacity-40"
            onClick={() => setPlanning((p) => !p)}>
            <CalendarPlus className="w-[1.1em] h-[1.1em]" />
          </button>
        )}
      </div>
      {planning && (
        <div className="pl-[1.6em] pb-[0.4em]">
          <PlanTimeChoice kind="later" item={{}} busy={busy} prompt="When could it happen?" onPick={plan} />
        </div>
      )}
    </li>
  );
}

export default function NeedsBalance({ rows, alters, categories }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const navigate = useNavigate();
  const without = useMemo(() => altersWithoutNeeds(alters, rows), [alters, rows]);
  if (!rows.length) {
    return <Muted>Nothing noted yet. Add what {t.alters} enjoy on an activity's page, or wishes for them under Wishes.</Muted>;
  }
  return (
    <div className="space-y-[0.9em]">
      {rows.map((r) => (
        <section key={r.alter.id} data-highlight-id={r.alter.id} aria-label={formatAlter(r.alter)}>
          <div className="flex items-center gap-[0.5em] min-h-[2.75em] border-b"
            style={{ borderColor: "color-mix(in srgb, currentColor 12%, transparent)" }}>
            <Dot color={r.alter.color} />
            <h3 className="m-0 flex-1 min-w-0">
              <button type="button" className="w-full text-left truncate font-medium text-[0.9375em]" onClick={() => navigate(`/alter/${r.alter.id}`)}>
                {formatAlter(r.alter)}
              </button>
            </h3>
            <span className="text-[0.75em] opacity-70 whitespace-nowrap">
              {r.lastAny ? `last ${sinceLabel(r.lastAny)}` : "nothing yet"}
            </span>
          </div>
          <ul className="m-0 p-0 list-none">
            {r.items.map((it) => <BalanceItem key={it.id} item={it} alter={r.alter} categories={categories} />)}
          </ul>
        </section>
      ))}
      {without.length > 0 && (
        <p className="text-[0.75em] opacity-70">
          Nothing noted yet for {without.map((a) => formatAlter(a)).join(", ")}.
        </p>
      )}
    </div>
  );
}
