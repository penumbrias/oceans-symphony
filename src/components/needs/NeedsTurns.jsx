// Turn agreements (v0.331.0 as widget pieces): "this now, that next" when
// alters want different things. The second half becomes a plan so it
// doesn't get lost. Used by the Turns widget — its expanded view (the full
// list with the new-agreement form) is what the Needs page's Turns page
// starts with. Writes go through src/lib/needs.js. Sized in em.

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarPlus, Check, ChevronDown, Plus } from "lucide-react";
import MentionTextarea from "@/components/shared/MentionTextarea";
import RichText from "@/components/shared/RichText";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import PlanTimeChoice from "@/components/planner/PlanTimeChoice";
import WhoseChoice, { whoseFront, whoseEveryone, resolveWhose, chipCls, chipStyle } from "@/components/needs/WhoseChoice";
import { flattenCategoryTree } from "@/lib/categoryTreeUtils";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { Muted } from "@/v2/primitives";
import { TURNS_QUERY_KEY, turnState, createTurn, planSecondHalf, setTurnStatus } from "@/lib/needs";

const inputCls = "w-full min-w-0 h-11 px-3 rounded-lg border text-[0.875em]";
const inputStyle = { borderColor: "color-mix(in srgb, currentColor 20%, transparent)", background: "transparent" };
const actionCls = `${chipCls} inline-flex items-center gap-[0.3em]`;
const quiet = chipStyle(false);

const indentOption = (o) => (
  <span className="flex items-center gap-2 min-w-0">
    {o._depth > 0 && <span style={{ width: o._depth * 12 }} className="flex-shrink-0 opacity-60 text-xs text-right">↳</span>}
    {o.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: o.color }} />}
    <span className="truncate text-sm">{o.label}</span>
  </span>
);

export const sortTurns = (turns) => [...(turns || [])].sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")));

function useRefreshTurns() {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: TURNS_QUERY_KEY }); qc.invalidateQueries({ queryKey: ["activities"] }); };
}

function HalfFields({ label, who, setWho, title, setTitle, cat, setCat, categoryOptions }) {
  return (
    <fieldset className="space-y-[0.4em] m-0 p-0 border-0">
      <legend className="font-medium text-[0.875em] mb-[0.2em]">{label}</legend>
      <WhoseChoice value={who} onChange={setWho} label="Who" />
      <input className={inputCls} style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="What they get to do…" aria-label={`${label}: what`} />
      <SearchableSelect value={cat} onChange={(id) => setCat(id || null)} options={categoryOptions} allowClear
        placeholder="Activity (optional)" searchPlaceholder="Search activities…" renderOption={indentOption} />
    </fieldset>
  );
}

export function TurnForm({ alters, categories, onDone, onCancel }) {
  const t = useTerms();
  const categoryOptions = useMemo(
    () => flattenCategoryTree(categories).map((c) => ({ id: c.id, label: c.name, color: c.color, _depth: c._depth })),
    [categories],
  );
  const [firstWho, setFirstWho] = useState(whoseFront);
  const [firstTitle, setFirstTitle] = useState("");
  const [firstCat, setFirstCat] = useState(null);
  const [secondWho, setSecondWho] = useState(whoseEveryone);
  const [secondTitle, setSecondTitle] = useState("");
  const [secondCat, setSecondCat] = useState(null);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(null);
  const [saving, setSaving] = useState(false);
  const catName = (id) => categories.find((c) => c.id === id)?.name || "";
  const ready = (firstTitle.trim() || firstCat) && (secondTitle.trim() || secondCat);

  const save = async () => {
    if (!ready || saving) return;
    let prepared = { content: "", authorIds: [] };
    if (note.trim()) {
      try {
        prepared = await prepareAuthoredText(note.trim(), { alters, terms: t, surfaceLabel: "turn agreement" });
      } catch (e) {
        if (isLogCommandError(e)) { toast.error(e.message); return; }
        throw e;
      }
      if (!prepared) return;
    }
    setSaving(true);
    try {
      const [firstIds, secondIds] = await Promise.all([resolveWhose(firstWho), resolveWhose(secondWho)]);
      const turn = await createTurn({
        first_title: firstTitle.trim() || catName(firstCat), first_alter_ids: firstIds, first_category_id: firstCat,
        second_title: secondTitle.trim() || catName(secondCat), second_alter_ids: secondIds, second_category_id: secondCat,
        note: prepared.content, author_alter_ids: prepared.authorIds || [],
      }, when, categories);
      if (prepared.content) {
        await recordAuthoredText({ ...prepared, alters, sourceType: "turn", sourceId: turn.id, sourceLabel: "Turn agreement", navigatePath: `/needs?tab=turns&highlight=${turn.id}` });
      }
      onDone();
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-[1em]">
      <HalfFields label="First" who={firstWho} setWho={setFirstWho} title={firstTitle} setTitle={setFirstTitle}
        cat={firstCat} setCat={setFirstCat} categoryOptions={categoryOptions} />
      <HalfFields label="Then" who={secondWho} setWho={setSecondWho} title={secondTitle} setTitle={setSecondTitle}
        cat={secondCat} setCat={setSecondCat} categoryOptions={categoryOptions} />
      <div className="space-y-[0.3em]">
        <p className="font-medium text-[0.875em]">When is the second turn?</p>
        {when ? (
          <div className="flex items-center gap-[0.5em] text-[0.875em]">
            <span>{format(when, "EEE d MMM, HH:mm")}</span>
            <button type="button" className={actionCls} style={quiet} onClick={() => setWhen(null)}>Change</button>
          </div>
        ) : (
          <PlanTimeChoice kind="later" item={{}} prompt="Pick a time and it goes in the planner." onPick={setWhen} />
        )}
      </div>
      <div className="space-y-[0.3em]">
        <p className="font-medium text-[0.875em]">Anything agreed alongside it? (optional)</p>
        <MentionTextarea toolbar value={note} onChange={setNote} alters={alters} signposts placeholder="e.g. quiet until 4, then music" className="min-h-[60px] text-sm" />
      </div>
      <div className="flex gap-[0.5em] justify-end">
        <button type="button" className={actionCls} style={quiet} onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="button" onClick={save} disabled={saving || !ready}
          className="h-11 px-4 rounded-lg text-[0.875em] font-medium inline-flex items-center gap-[0.3em] disabled:opacity-40"
          style={{ background: "var(--v2-accent, var(--color-primary))", color: "var(--v2-on-accent, #fff)" }}>
          <Check className="w-[1em] h-[1em]" /> Agree
        </button>
      </div>
    </div>
  );
}

export function TurnCard({ turn, alters, activities, categories, compact = false }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const navigate = useNavigate();
  const refresh = useRefreshTurns();
  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const state = turnState(turn, activities);
  const plan = activities.find((a) => a.id === turn.second_plan_id);
  const names = (ids) => (ids || []).map((id) => alters.find((a) => a.id === id)).filter(Boolean).map((a) => formatAlter(a)).join(", ");
  const run = async (fn, msg) => {
    setBusy(true);
    try { await fn(); if (msg) toast.success(msg); refresh(); }
    catch (e) { toast.error(e?.message || "Couldn't save that."); }
    finally { setBusy(false); }
  };
  const half = (who, title) => (
    <span><span className="font-medium">{names(who) || `Someone in the ${t.system}`}</span>: {title}</span>
  );
  return (
    <div data-highlight-id={turn.id} className="py-[0.6em] space-y-[0.4em] border-b last:border-b-0"
      style={{ borderColor: "color-mix(in srgb, currentColor 12%, transparent)", opacity: state === "open" ? 1 : 0.75 }}>
      <div className="text-[0.875em] space-y-[0.1em]">
        <p><span className="opacity-70">First · </span>{half(turn.first_alter_ids, turn.first_title)}</p>
        <p><span className="opacity-70">Then · </span>{half(turn.second_alter_ids, turn.second_title)}</p>
      </div>
      {!compact && turn.note && <div className="text-[0.75em] opacity-80"><RichText content={turn.note} alters={alters} terms={t} /></div>}
      <p className="text-[0.75em]">
        {state === "kept" ? "Kept 💜" : state === "let_go" ? "Let go" : plan
          ? <button type="button" className="hover:underline" style={{ color: "var(--v2-accent, var(--color-primary))" }} onClick={() => navigate(`/planner?activityId=${plan.id}`)}>
              Second turn planned {plan.timestamp ? format(new Date(plan.timestamp), "EEE d MMM, HH:mm") : ""}
            </button>
          : <span className="opacity-70">Second turn not planned yet</span>}
      </p>
      {planning && (
        <PlanTimeChoice kind="later" item={{}} busy={busy} prompt="When is the second turn?"
          onPick={(when) => run(async () => { await planSecondHalf(turn, when, categories); setPlanning(false); }, "Planned")} />
      )}
      <div className="flex flex-wrap gap-[0.35em]">
        {state === "open" ? (
          <>
            {!plan && !compact && (
              <button type="button" disabled={busy} className={actionCls} style={quiet} aria-expanded={planning} onClick={() => setPlanning((p) => !p)}>
                <CalendarPlus className="w-[1em] h-[1em]" /> Plan the second turn
              </button>
            )}
            <button type="button" disabled={busy} className={actionCls} style={quiet} onClick={() => run(() => setTurnStatus(turn, "kept"), "Kept 💜")}>
              <Check className="w-[1em] h-[1em]" /> Kept
            </button>
            <button type="button" disabled={busy} className={actionCls} style={quiet} onClick={() => run(() => setTurnStatus(turn, "let_go"))}>Let go</button>
          </>
        ) : (
          <button type="button" disabled={busy} className={actionCls} style={quiet} onClick={() => run(() => setTurnStatus(turn, "open"))}>Open it again</button>
        )}
      </div>
    </div>
  );
}

// Everything: the intro, the new-agreement form, open turns, and the
// kept / let-go ones folded away.
export default function NeedsTurns({ alters, turns, activities, categories }) {
  const t = useTerms();
  const refresh = useRefreshTurns();
  const [adding, setAdding] = useState(false);
  const [showFinished, setShowFinished] = useState(false);
  const sorted = useMemo(() => sortTurns(turns), [turns]);
  const open = sorted.filter((x) => turnState(x, activities) === "open");
  const finished = sorted.filter((x) => turnState(x, activities) !== "open");
  return (
    <div className="space-y-[0.6em]">
      <p className="text-[0.75em] opacity-70">
        When {t.alters} want different things: agree who goes first, and the second turn goes in the planner so it doesn't get lost.
      </p>
      {adding ? (
        <TurnForm alters={alters} categories={categories} onCancel={() => setAdding(false)}
          onDone={() => { setAdding(false); refresh(); toast.success("Agreed 💜"); }} />
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="h-11 px-4 rounded-lg text-[0.875em] font-medium inline-flex items-center gap-[0.3em]"
          style={{ background: "var(--v2-accent, var(--color-primary))", color: "var(--v2-on-accent, #fff)" }}>
          <Plus className="w-[1em] h-[1em]" /> New turn agreement
        </button>
      )}
      {open.length === 0 && !adding && <Muted>No open turn agreements.</Muted>}
      <div>{open.map((x) => <TurnCard key={x.id} turn={x} alters={alters} activities={activities} categories={categories} />)}</div>
      {finished.length > 0 && (
        <div className="space-y-[0.4em]">
          <button type="button" onClick={() => setShowFinished((s) => !s)} aria-expanded={showFinished}
            className="min-h-[2.75em] text-[0.75em] opacity-70 hover:opacity-100 flex items-center gap-[0.3em]">
            <ChevronDown className={`w-[1.2em] h-[1.2em] transition-transform ${showFinished ? "rotate-180" : ""}`} />
            Kept and let go ({finished.length})
          </button>
          {showFinished && <div>{finished.map((x) => <TurnCard key={x.id} turn={x} alters={alters} activities={activities} categories={categories} />)}</div>}
        </div>
      )}
    </div>
  );
}
