// Needs (System Needs, phase 6): one place for what everyone wants.
//   • Balance — how long since each alter got something they enjoy or
//     wished for (src/lib/needs.js buildBalance).
//   • Wishes — everyone's shareable wishes, through the shared WishCard.
//   • Turns — "this now, that next" agreements; the second half is a plan.
// Goals live on their own page, linked from the top.
//
// ?tab=balance|wishes|turns picks the tab.

import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNowStrict, format } from "date-fns";
import { HeartHandshake, Target, ChevronRight, CalendarPlus, Plus, ChevronDown, Check, Heart } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import MentionTextarea from "@/components/shared/MentionTextarea";
import RichText from "@/components/shared/RichText";
import { SearchableSelect, SearchableMultiSelect } from "@/components/shared/SearchableSelect";
import PlanTimeChoice from "@/components/planner/PlanTimeChoice";
import WishCard from "@/components/wishes/WishCard";
import { flattenCategoryTree } from "@/lib/categoryTreeUtils";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useHighlightScroll } from "@/lib/useHighlightScroll";
import { LINK_TYPES_QUERY_KEY } from "@/lib/activityLinks";
import { WISHES_QUERY_KEY, WISH_KINDS, isOpenWish, sortWishes, createWish } from "@/lib/wishes";
import {
  TURNS_QUERY_KEY, ALTER_ACTIVITY_LINKS_QUERY_KEY, buildBalance, altersWithoutNeeds, sharedWishes,
  turnState, createTurn, planSecondHalf, setTurnStatus,
} from "@/lib/needs";

const list = (entity, ...args) => () => base44.entities[entity].list(...args).catch(() => []);
const small = "text-xs px-2 py-1 rounded-full border border-border/60 text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-40";
const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const sinceLabel = (iso) => (iso ? `${formatDistanceToNowStrict(new Date(iso))} ago` : "not yet");

const indentOption = (o) => (
  <span className="flex items-center gap-2 min-w-0">
    {o._depth > 0 && <span style={{ width: o._depth * 12 }} className="flex-shrink-0 text-muted-foreground text-xs text-right">↳</span>}
    {o.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: o.color }} />}
    <span className="truncate text-sm">{o.label}</span>
  </span>
);

function useCategoryOptions(categories) {
  return useMemo(
    () => flattenCategoryTree(categories).map((c) => ({ id: c.id, label: c.name, color: c.color, _depth: c._depth })),
    [categories],
  );
}

function useAlterOptions(alters) {
  const formatAlter = useAlterLabel();
  return useMemo(
    () => (alters || []).filter((a) => !a.is_archived)
      .map((a) => ({ id: a.id, label: formatAlter(a), color: a.color, avatar_url: a.avatar_url || a.image_url })),
    [alters, formatAlter],
  );
}

// ── Balance ──────────────────────────────────────────────────────────

function BalanceItem({ item, alter, categories, onChanged }) {
  const navigate = useNavigate();
  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const plan = async (when) => {
    setBusy(true);
    try {
      const cat = categories.find((c) => c.id === item.categoryId);
      await base44.entities.Activity.create({
        timestamp: when.toISOString(),
        activity_name: item.title,
        activity_category_ids: item.categoryId ? [item.categoryId] : [],
        ...(cat?.color ? { color: cat.color } : {}),
        fronting_alter_ids: [alter.id],
        is_planned: true,
        status: "scheduled",
        ...(item.wish ? { wish_id: item.wish.id } : {}),
      });
      toast.success("Planned");
      setPlanning(false);
      onChanged();
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="space-y-1">
      <div className="flex items-center gap-2 text-sm">
        <span aria-hidden="true">{item.kind === "wish" ? "💗" : "✨"}</span>
        {item.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.color }} />}
        <button type="button" className="flex-1 min-w-0 text-left truncate text-foreground"
          onClick={() => navigate(item.kind === "wish"
            ? `/alter/${alter.id}?tab=wishlist&highlight=${item.wish.id}`
            : `/activities?category=${item.categoryId}`)}>
          {item.title}
        </button>
        <span className={`text-xs whitespace-nowrap ${item.last ? "text-muted-foreground" : "text-primary"}`}>{sinceLabel(item.last)}</span>
        {(item.kind === "activity" || item.categoryId) && (
          <button type="button" aria-label={`Plan ${item.title}`} title="Plan it" disabled={busy}
            className="p-1 text-muted-foreground hover:text-foreground" onClick={() => setPlanning((p) => !p)}>
            <CalendarPlus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {planning && (
        <div className="pl-6">
          <PlanTimeChoice kind="later" item={{}} busy={busy} prompt="When could it happen?" onPick={plan} />
        </div>
      )}
    </li>
  );
}

function BalanceTab({ alters, links, wishes, activities, categories, onChanged }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const navigate = useNavigate();
  const { data: linkTypes = [] } = useQuery({
    queryKey: LINK_TYPES_QUERY_KEY, queryFn: () => base44.entities.ActivityLinkType.list().catch(() => []),
  });
  const rows = useMemo(
    () => buildBalance({ alters, links, wishes, activities, categories, linkTypes }),
    [alters, links, wishes, activities, categories, linkTypes],
  );
  const without = useMemo(() => altersWithoutNeeds(alters, rows), [alters, rows]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        How long since each {t.alter} got something they enjoy, need or wished for. Longest first.
      </p>
      {rows.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm rounded-2xl" data-pf-surface>
          <HeartHandshake className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          Nothing noted yet. Add what {t.alters} enjoy on an activity's page, or wishes on their profile.
        </div>
      )}
      {rows.map((r) => (
        <div key={r.alter.id} data-highlight-id={r.alter.id} className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: r.alter.color || "var(--muted)" }} />
            <button type="button" className="font-medium text-left flex-1 min-w-0 truncate" onClick={() => navigate(`/alter/${r.alter.id}`)}>
              {formatAlter(r.alter)}
            </button>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {r.lastAny ? `last ${sinceLabel(r.lastAny)}` : "nothing yet"}
            </span>
          </div>
          <ul className="space-y-1.5">
            {r.items.map((it) => (
              <BalanceItem key={it.id} item={it} alter={r.alter} categories={categories} onChanged={onChanged} />
            ))}
          </ul>
        </div>
      ))}
      {without.length > 0 && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Nothing noted yet for {without.map((a) => formatAlter(a)).join(", ")}.
        </p>
      )}
    </div>
  );
}

// ── Wishes ───────────────────────────────────────────────────────────

function WishesTab({ alters, wishes, categories, onChanged }) {
  const t = useTerms();
  const alterOptions = useAlterOptions(alters);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("item");
  const [owners, setOwners] = useState([]);
  const [adding, setAdding] = useState(false);
  const [showFinished, setShowFinished] = useState(false);
  const alterById = useMemo(() => new Map((alters || []).map((a) => [a.id, a])), [alters]);
  const all = useMemo(() => sortWishes(sharedWishes(wishes)), [wishes]);
  const open = all.filter(isOpenWish);
  const finished = all.filter((w) => !isOpenWish(w));

  const add = async () => {
    const text = title.trim();
    if (!text) return;
    setAdding(true);
    try {
      await createWish({ title: text, kind, ownerIds: owners });
      setTitle("");
      onChanged();
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-2">
        <div className="flex gap-2">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Something wished for…" aria-label="New wish" />
          <Button size="sm" onClick={add} disabled={adding || !title.trim()}><Plus className="w-4 h-4 mr-1" /> Add</Button>
        </div>
        <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-1.5">
          {WISH_KINDS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)}
              className={`text-xs px-2.5 py-1 rounded-full border ${
                kind === k.id ? "border-primary text-primary bg-primary/10" : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}>
              {k.emoji} {k.label}
            </button>
          ))}
        </div>
        <SearchableMultiSelect value={owners} onChange={(v) => setOwners(v || [])} options={alterOptions}
          placeholder={`Whose wish? (empty = everyone in the ${t.system})`} searchPlaceholder={`Search ${t.alters}…`} />
      </div>

      {open.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm rounded-2xl" data-pf-surface>
          <Heart className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          No open wishes. Private wishes only show on their {t.alter}'s profile.
        </div>
      )}
      {open.map((w) => (
        <WishCard key={w.id} wish={w} alters={alters} categories={categories} alterById={alterById} onChanged={onChanged} showOwners />
      ))}
      {finished.length > 0 && (
        <div className="space-y-3">
          <button type="button" onClick={() => setShowFinished((s) => !s)} aria-expanded={showFinished}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFinished ? "rotate-180" : ""}`} />
            Done and let go ({finished.length})
          </button>
          {showFinished && finished.map((w) => (
            <WishCard key={w.id} wish={w} alters={alters} categories={categories} alterById={alterById} onChanged={onChanged} showOwners />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Turns ────────────────────────────────────────────────────────────

function HalfFields({ label, who, setWho, title, setTitle, cat, setCat, alterOptions, categoryOptions, terms }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <SearchableMultiSelect value={who} onChange={(v) => setWho(v || [])} options={alterOptions}
        placeholder={`Which ${terms.alters}`} searchPlaceholder={`Search ${terms.alters}…`} />
      <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What they get to do…" aria-label={`${label}: what`} />
      <SearchableSelect value={cat} onChange={(id) => setCat(id || null)} options={categoryOptions} allowClear
        placeholder="Activity (optional)" searchPlaceholder="Search activities…" renderOption={indentOption} />
    </div>
  );
}

function TurnForm({ alters, categories, onDone, onCancel }) {
  const t = useTerms();
  const alterOptions = useAlterOptions(alters);
  const categoryOptions = useCategoryOptions(categories);
  const [firstWho, setFirstWho] = useState([]);
  const [firstTitle, setFirstTitle] = useState("");
  const [firstCat, setFirstCat] = useState(null);
  const [secondWho, setSecondWho] = useState([]);
  const [secondTitle, setSecondTitle] = useState("");
  const [secondCat, setSecondCat] = useState(null);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(null);
  const [saving, setSaving] = useState(false);
  const catName = (id) => categories.find((c) => c.id === id)?.name || "";
  const ready = (firstTitle.trim() || firstCat) && (secondTitle.trim() || secondCat);

  const save = async () => {
    if (!ready) return;
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
      const turn = await createTurn({
        first_title: firstTitle.trim() || catName(firstCat), first_alter_ids: firstWho, first_category_id: firstCat,
        second_title: secondTitle.trim() || catName(secondCat), second_alter_ids: secondWho, second_category_id: secondCat,
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
    <div className="rounded-xl border border-primary/30 bg-card p-4 space-y-4">
      <HalfFields label="First" who={firstWho} setWho={setFirstWho} title={firstTitle} setTitle={setFirstTitle}
        cat={firstCat} setCat={setFirstCat} alterOptions={alterOptions} categoryOptions={categoryOptions} terms={t} />
      <HalfFields label="Then" who={secondWho} setWho={setSecondWho} title={secondTitle} setTitle={setSecondTitle}
        cat={secondCat} setCat={setSecondCat} alterOptions={alterOptions} categoryOptions={categoryOptions} terms={t} />
      <div className="space-y-1">
        <p className="text-sm font-medium">When is the second turn?</p>
        {when ? (
          <div className="flex items-center gap-2 text-sm">
            <span>{format(when, "EEE d MMM, HH:mm")}</span>
            <button type="button" className={small} onClick={() => setWhen(null)}>Change</button>
          </div>
        ) : (
          <PlanTimeChoice kind="later" item={{}} prompt="Pick a time and it goes in the planner." onPick={setWhen} />
        )}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">Anything agreed alongside it? (optional)</p>
        <MentionTextarea toolbar value={note} onChange={setNote} alters={alters} signposts placeholder="e.g. quiet until 4, then music" className="min-h-[60px] text-sm" />
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={save} disabled={saving || !ready}><Check className="w-3.5 h-3.5 mr-1" /> Agree</Button>
      </div>
    </div>
  );
}

function TurnCard({ turn, alters, activities, categories, onChanged }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const navigate = useNavigate();
  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const state = turnState(turn, activities);
  const plan = activities.find((a) => a.id === turn.second_plan_id);
  const names = (ids) => (ids || []).map((id) => alters.find((a) => a.id === id)).filter(Boolean).map((a) => formatAlter(a)).join(", ");
  const run = async (fn, msg) => {
    setBusy(true);
    try { await fn(); if (msg) toast.success(msg); onChanged(); }
    catch (e) { toast.error(e?.message || "Couldn't save that."); }
    finally { setBusy(false); }
  };
  const half = (who, title) => (
    <span><span className="font-medium">{names(who) || `Someone in the ${t.system}`}</span>: {title}</span>
  );
  return (
    <div data-highlight-id={turn.id} className={`rounded-xl border p-3 space-y-2 ${state === "open" ? "border-border/50 bg-muted/10" : "border-border/30 opacity-75"}`}>
      <div className="text-sm space-y-0.5">
        <p><span className="text-muted-foreground">First · </span>{half(turn.first_alter_ids, turn.first_title)}</p>
        <p><span className="text-muted-foreground">Then · </span>{half(turn.second_alter_ids, turn.second_title)}</p>
      </div>
      {turn.note && <div className="text-xs text-muted-foreground"><RichText content={turn.note} alters={alters} terms={t} /></div>}
      <p className="text-xs">
        {state === "kept" ? "Kept 💜" : state === "let_go" ? "Let go" : plan
          ? <button type="button" className="text-primary hover:underline" onClick={() => navigate(`/planner?activityId=${plan.id}`)}>
              Second turn planned {plan.timestamp ? format(new Date(plan.timestamp), "EEE d MMM, HH:mm") : ""}
            </button>
          : <span className="text-muted-foreground">Second turn not planned yet</span>}
      </p>
      {planning && (
        <PlanTimeChoice kind="later" item={{}} busy={busy} prompt="When is the second turn?"
          onPick={(when) => run(async () => { await planSecondHalf(turn, when, categories); setPlanning(false); }, "Planned")} />
      )}
      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/30">
        {state === "open" ? (
          <>
            {!plan && (
              <button type="button" disabled={busy} className={small} onClick={() => setPlanning((p) => !p)}>
                <CalendarPlus className="w-3.5 h-3.5" /> Plan the second turn
              </button>
            )}
            <button type="button" disabled={busy} className={small} onClick={() => run(() => setTurnStatus(turn, "kept"), "Kept 💜")}>
              <Check className="w-3.5 h-3.5" /> Kept
            </button>
            <button type="button" disabled={busy} className={small} onClick={() => run(() => setTurnStatus(turn, "let_go"))}>Let go</button>
          </>
        ) : (
          <button type="button" disabled={busy} className={small} onClick={() => run(() => setTurnStatus(turn, "open"))}>Open it again</button>
        )}
      </div>
    </div>
  );
}

function TurnsTab({ alters, turns, activities, categories, onChanged }) {
  const t = useTerms();
  const [adding, setAdding] = useState(false);
  const [showFinished, setShowFinished] = useState(false);
  const sorted = useMemo(() => [...turns].sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || ""))), [turns]);
  const open = sorted.filter((x) => turnState(x, activities) === "open");
  const finished = sorted.filter((x) => turnState(x, activities) !== "open");
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        When {t.alters} want different things: agree who goes first, and the second turn goes in the planner so it doesn't get lost.
      </p>
      {adding ? (
        <TurnForm alters={alters} categories={categories} onCancel={() => setAdding(false)}
          onDone={() => { setAdding(false); onChanged(); toast.success("Agreed 💜"); }} />
      ) : (
        <Button size="sm" className="gap-1" onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> New turn agreement</Button>
      )}
      {open.map((x) => <TurnCard key={x.id} turn={x} alters={alters} activities={activities} categories={categories} onChanged={onChanged} />)}
      {finished.length > 0 && (
        <div className="space-y-3">
          <button type="button" onClick={() => setShowFinished((s) => !s)} aria-expanded={showFinished}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFinished ? "rotate-180" : ""}`} />
            Kept and let go ({finished.length})
          </button>
          {showFinished && finished.map((x) => <TurnCard key={x.id} turn={x} alters={alters} activities={activities} categories={categories} onChanged={onChanged} />)}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

const TABS = [
  { id: "balance", label: "Balance" },
  { id: "wishes", label: "Wishes" },
  { id: "turns", label: "Turns" },
];

export default function Needs() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((x) => x.id === params.get("tab")) ? params.get("tab") : "balance";
  const setTab = (id) => { const next = new URLSearchParams(params); next.set("tab", id); setParams(next, { replace: true }); };

  const { data: alters = [], isFetched } = useQuery({ queryKey: ["alters"], queryFn: list("Alter") });
  const { data: wishes = [] } = useQuery({ queryKey: WISHES_QUERY_KEY, queryFn: list("Wish") });
  const { data: links = [] } = useQuery({ queryKey: ALTER_ACTIVITY_LINKS_QUERY_KEY, queryFn: list("AlterActivityLink") });
  const { data: activities = [] } = useQuery({ queryKey: ["activities"], queryFn: list("Activity") });
  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: list("ActivityCategory") });
  const { data: turns = [] } = useQuery({ queryKey: TURNS_QUERY_KEY, queryFn: list("TurnAgreement") });
  const { data: goals = [] } = useQuery({ queryKey: ["goals"], queryFn: list("Goal") });
  const openGoals = goals.filter((g) => !g.parent_id && !["done", "let_go"].includes(g.status || "active")).length;

  useHighlightScroll([isFetched, tab]);

  const refresh = () => {
    for (const key of [WISHES_QUERY_KEY, TURNS_QUERY_KEY, ["activities"]]) qc.invalidateQueries({ queryKey: key });
  };

  return (
    <div className="min-h-screen p-4"
      style={{ paddingBottom: "calc(1rem + var(--bottom-nav-height, 56px) + var(--os-sab))" }}>
      <div className="max-w-2xl mx-auto space-y-4" data-tour="needs-page">
        <h1 className="font-display text-3xl font-semibold text-foreground">Needs</h1>

        <button type="button" onClick={() => navigate("/goals")}
          className="w-full flex items-center gap-2 rounded-xl border border-border/50 bg-muted/10 px-3 py-2.5 text-left hover:bg-muted/30">
          <Target className="w-4 h-4 text-primary" />
          <span className="flex-1 text-sm">Goals{openGoals > 0 ? ` · ${openGoals} in progress` : ""}</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>

        <div role="tablist" aria-label="Needs" className="flex gap-1 p-1 rounded-xl bg-muted/40">
          {TABS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
              className={`flex-1 text-sm py-1.5 rounded-lg ${tab === x.id ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}>
              {x.label}
            </button>
          ))}
        </div>

        {tab === "balance" && <BalanceTab alters={alters} links={links} wishes={wishes} activities={activities} categories={categories} onChanged={refresh} />}
        {tab === "wishes" && <WishesTab alters={alters} wishes={wishes} categories={categories} onChanged={refresh} />}
        {tab === "turns" && <TurnsTab alters={alters} turns={turns} activities={activities} categories={categories} onChanged={refresh} />}
      </div>
    </div>
  );
}
