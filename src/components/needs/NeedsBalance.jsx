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
import { useUiLook } from "@/lib/uiLook";
import "@/styles/pixel/care.css";

// Pixel look (NeedsPhone): how long since, short, coloured by how long.
const shortSince = (iso) => (iso ? formatDistanceToNowStrict(new Date(iso)) : "not yet");
const waitColor = (iso) => {
  if (!iso) return "#ef8a6a";
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  return days >= 10 ? "#ef8a6a" : days >= 3 ? "#e3c16f" : "#86b88f";
};

const sinceLabel = (iso) => (iso ? `${formatDistanceToNowStrict(new Date(iso))} ago` : "not yet");

function BalanceItem({ item, alter, categories, pixel = false }) {
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
  const open = () => navigate(item.kind === "wish"
    ? `/needs?tab=wishes&highlight=${item.wish.id}`
    : `/activities?category=${item.categoryId}`);
  if (pixel) {
    const kind = item.kind === "wish" ? "Wish" : item.relation === "needs" ? "Needs" : "Enjoys";
    return (
      <li>
        <div className="px-nb-item">
          <span className="px-nb-kind">{kind}</span>
          <button type="button" className="px-nb-title" onClick={open}>{item.title}</button>
          <span className={`px-nb-since${item.last ? "" : " never"}`}>{shortSince(item.last)}</span>
          {canPlan && (
            <button type="button" className={`px-cr-btn${planning ? " on" : ""}`} aria-label={`Plan ${item.title}`} disabled={busy}
              aria-expanded={planning} onClick={() => setPlanning((p) => !p)}>Plan it</button>
          )}
        </div>
        {planning && (
          <div className="px-nb-plan">
            <PlanTimeChoice kind="later" item={{}} busy={busy} prompt="When could it happen?" onPick={plan} />
          </div>
        )}
      </li>
    );
  }
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
  const pixel = useUiLook() === "pixel";
  if (pixel && rows.length) {
    return (
      <div className="px-nb">
        <p className="px-nb-intro">Everyone, longest waiting first. What they enjoy, need or wished for, and how long since it last happened.</p>
        {rows.map((r) => (
          <section key={r.alter.id} className="px-cr-pn" data-highlight-id={r.alter.id} aria-label={formatAlter(r.alter)}>
            <h3 className="px-cr-ttl">
              <span>
                <span className="px-cr-sq" style={{ background: r.alter.color || "var(--px-hi)" }} aria-hidden="true" />
                <button type="button" className="px-nb-name" onClick={() => navigate(`/alter/${r.alter.id}`)}>{formatAlter(r.alter)}</button>
              </span>
              <span className="px-nb-wait" style={{ color: waitColor(r.lastAny) }}>{shortSince(r.lastAny)}</span>
            </h3>
            <ul className="px-nb-items">
              {r.items.map((it) => <BalanceItem key={it.id} item={it} alter={r.alter} categories={categories} pixel />)}
            </ul>
          </section>
        ))}
        {without.length > 0 && (
          <p className="px-nb-without">Nothing noted yet for {without.map((a) => formatAlter(a)).join(", ")}.</p>
        )}
      </div>
    );
  }
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
