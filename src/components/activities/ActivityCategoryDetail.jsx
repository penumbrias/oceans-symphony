// One activity's page on the Activities screen: what it is, how it's been
// going (from the real Activity log), its sub-activities, and the
// "Who & feelings" links (System Needs, step 3) — which alters enjoy,
// need, dislike… it, and which feelings it helps with or brings up.
//
// Reads Activity / ActivityCategory / Alter / CustomEmotion; writes only
// AlterActivityLink and FeelingLink. Every tree walk goes through the
// cycle-guarded categoryTreeUtils helpers.

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, startOfWeek, endOfWeek, startOfDay, subDays } from "date-fns";
import { ArrowLeft, ChevronRight, Plus, X, Trash2, CalendarRange, Users, Heart } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import AlterSearchSelect from "@/components/shared/AlterSearchSelect";
import MentionTextarea from "@/components/shared/MentionTextarea";
import EmotionWheelPicker from "@/components/emotions/EmotionWheelPicker";
import { confirm } from "@/components/shared/ConfirmDialog";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";
import { indexById, getAncestorIds, getChildren, MAX_RENDER_DEPTH } from "@/lib/categoryTreeUtils";
import { categoryIdOf, countsTowardTotals, minutesOf } from "@/lib/planner/rollup";
import { statusFor, STATUS_LABELS, countableMinutes } from "@/lib/activityStatus";
import { FEELING_EFFECTS, allRelations, relationLabel, clampStrength, toggleFeelingLink, LINK_TYPES_QUERY_KEY } from "@/lib/activityLinks";
import RelationTypePicker from "@/components/activities/RelationTypePicker";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import RichText from "@/components/shared/RichText";
import { sharedList } from "@/lib/sharedLists";

const fmtMin = (min) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

// This category and everything under it (cycle-guarded, depth-clamped).
function subtreeIds(rootId, categories) {
  const out = new Set([rootId]);
  const walk = (id, depth) => {
    if (depth > MAX_RENDER_DEPTH * 4) return;
    for (const c of getChildren(id, categories)) {
      if (out.has(c.id)) continue;
      out.add(c.id);
      walk(c.id, depth + 1);
    }
  };
  walk(rootId, 0);
  return out;
}

function Section({ title, icon, action, children }) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">{icon}{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-muted/30 px-2.5 py-2 min-w-0">
      <p className="text-[0.6875rem] text-muted-foreground truncate">{label}</p>
      <p className="text-sm font-semibold tabular-nums truncate">{value}</p>
    </div>
  );
}

function StrengthDots({ value, onChange }) {
  return (
    <span className="inline-flex gap-1" role={onChange ? "radiogroup" : undefined}>
      {[1, 2, 3, 4, 5].map((n) => (
        onChange ? (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} of 5`}
            onClick={() => onChange(n)}
            className={`w-6 h-6 rounded-full border text-[0.6875rem] ${n <= value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"}`}>
            {n}
          </button>
        ) : (
          <span key={n} aria-hidden className={`w-1.5 h-1.5 rounded-full ${n <= value ? "bg-primary" : "bg-muted"}`} />
        )
      ))}
    </span>
  );
}

// `pixel` draws the "Desktop: Activities" board's details pane (only in the
// pixel look): same data, links and editors, laid out as titled panels.
// `onRename` / `onAddSub` hand those jobs to the activity tree beside it.
export default function ActivityCategoryDetail({ categoryId, onBack, onOpen, pixel = false, desk = false, onRename = null, onAddSub = null }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: categories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list() });
  const { data: activities = [] } = useQuery({ ...sharedList("activities") });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: customEmotions = [] } = useQuery({ queryKey: ["customEmotions"], queryFn: () => base44.entities.CustomEmotion.list() });
  const { data: alterLinks = [] } = useQuery({
    queryKey: ["alterActivityLinks"], queryFn: () => base44.entities.AlterActivityLink.list(),
  });
  const { data: feelingLinks = [] } = useQuery({
    queryKey: ["feelingLinks"], queryFn: () => base44.entities.FeelingLink.list(),
  });
  const { data: linkTypes = [] } = useQuery({
    queryKey: LINK_TYPES_QUERY_KEY, queryFn: () => base44.entities.ActivityLinkType.list().catch(() => []),
  });

  const byId = useMemo(() => indexById(categories), [categories]);
  const cat = byId[categoryId] || null;
  const path = useMemo(
    () => (cat ? getAncestorIds(cat.id, byId).reverse().map((id) => byId[id]?.name).filter(Boolean) : []),
    [cat, byId]
  );
  const children = useMemo(() => (cat ? getChildren(cat.id, categories) : []), [cat, categories]);
  const ids = useMemo(() => (cat ? subtreeIds(cat.id, categories) : new Set()), [cat, categories]);

  const entries = useMemo(() => activities
    .filter((a) => ids.has(categoryIdOf(a)) || (a.activity_category_ids || []).some((id) => ids.has(id)))
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)), [activities, ids]);
  const stats = useMemo(() => {
    const done = entries.filter(countsTowardTotals);
    const now = Date.now();
    const monthAgo = now - 30 * 86400000;
    const last = done.find((a) => a.timestamp && new Date(a.timestamp).getTime() <= now);
    return {
      times: done.length,
      minutes: done.reduce((n, a) => n + minutesOf(a), 0),
      last: last ? new Date(last.timestamp) : null,
      month: done.filter((a) => a.timestamp && new Date(a.timestamp).getTime() >= monthAgo).length,
      upcoming: entries.filter((a) => statusFor(a) === "scheduled" && a.timestamp && new Date(a.timestamp).getTime() > now).length,
    };
  }, [entries]);

  // ── Pixel board extras: the 30-day bars, sub-activity counts, this
  // week's goal. Read-only; goals are set on the Planner.
  const { data: weekGoals = [] } = useQuery({
    queryKey: ["activityGoals", "all"], enabled: pixel,
    queryFn: () => base44.entities.ActivityGoal.list().catch(() => []),
  });
  const pixelBars = useMemo(() => {
    if (!pixel) return [];
    const today = startOfDay(new Date());
    const days = Array.from({ length: 30 }, (_, i) => ({ day: subDays(today, 29 - i), n: 0 }));
    const first = days[0].day.getTime();
    for (const a of entries) {
      if (!countsTowardTotals(a) || !a.timestamp) continue;
      const t = startOfDay(new Date(a.timestamp)).getTime();
      const i = Math.round((t - first) / 86400000);
      if (i >= 0 && i < 30) days[i].n += 1;
    }
    return days;
  }, [pixel, entries]);
  const subCounts = useMemo(() => {
    if (!pixel) return {};
    const out = {};
    for (const c of children) {
      const sub = subtreeIds(c.id, categories);
      out[c.id] = entries.filter((a) => countsTowardTotals(a)
        && (sub.has(categoryIdOf(a)) || (a.activity_category_ids || []).some((id) => sub.has(id)))).length;
    }
    return out;
  }, [pixel, children, categories, entries]);
  const weekGoal = useMemo(() => {
    if (!pixel) return null;
    const wk = format(startOfWeek(new Date()), "yyyy-MM-dd");
    const g = weekGoals.find((x) => x.week_start_date === wk && (x.source_type || "category") === "category" && x.activity_category_id === categoryId);
    if (!g) return null;
    const from = startOfWeek(new Date()), to = endOfWeek(new Date());
    const done = activities.filter((a) => (a.activity_category_ids || []).includes(categoryId)
      && a.timestamp && new Date(a.timestamp) >= from && new Date(a.timestamp) <= to)
      .reduce((n, a) => n + countableMinutes(a), 0);
    return { target: g.weekly_minutes || g.target_minutes || 0, done };
  }, [pixel, weekGoals, activities, categoryId]);
  const [whoEdit, setWhoEdit] = useState(false);
  useEffect(() => { setWhoEdit(false); setForm(null); setPickingFor(null); }, [categoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const myAlterLinks = useMemo(() => alterLinks.filter((l) => l.category_id === categoryId), [alterLinks, categoryId]);
  const myFeelingLinks = useMemo(() => feelingLinks.filter((l) => l.category_id === categoryId), [feelingLinks, categoryId]);
  const alterById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  // ── Who: one form for add + edit ─────────────────────────────────
  const [form, setForm] = useState(null); // { id?, alter_id, relation, strength, note }
  const [saving, setSaving] = useState(false);
  const openForm = (link = null) => setForm(link
    ? { id: link.id, alter_id: link.alter_id, relation: link.relation, strength: clampStrength(link.strength), note: link.note || "" }
    : { alter_id: null, relation: "enjoys", strength: 3, note: "" });
  const saveForm = async () => {
    if (!form?.alter_id || !form.relation) return;
    setSaving(true);
    try {
      const prepared = await prepareAuthoredText(form.note, { alters, terms: t, surfaceLabel: "activity link note" });
      if (prepared === null) { setSaving(false); return; }
      const data = {
        alter_id: form.alter_id, category_id: categoryId, relation: form.relation,
        strength: clampStrength(form.strength), note: prepared.content,
        author_alter_ids: prepared.authorIds,
      };
      const row = form.id
        ? await base44.entities.AlterActivityLink.update(form.id, data)
        : await base44.entities.AlterActivityLink.create(data);
      await recordAuthoredText({
        ...prepared, alters, sourceType: "activity_link", sourceId: row?.id || form.id,
        sourceLabel: "Activity note", navigatePath: `/activities?category=${encodeURIComponent(categoryId)}`,
      });
      qc.invalidateQueries({ queryKey: ["alterActivityLinks"] });
      setForm(null);
    } catch (e) {
      toast.error(isLogCommandError(e) ? e.message : (e?.message || "Couldn't save"));
    }
    setSaving(false);
  };
  const removeLink = async (link) => {
    const who = alterById[link.alter_id] ? formatAlter(alterById[link.alter_id]) : t.alter;
    const ok = await confirm({
      title: `Remove this link?`,
      body: `"${who} ${relationLabel(link.relation, linkTypes).toLowerCase()} ${cat?.name || "this"}" will be removed. The activity and its history stay.`,
      confirmLabel: "Remove", destructive: true,
    });
    if (!ok) return;
    try {
      await base44.entities.AlterActivityLink.delete(link.id);
      qc.invalidateQueries({ queryKey: ["alterActivityLinks"] });
      setForm(null);
    } catch (e) { toast.error(e?.message || "Couldn't remove"); }
  };

  // ── Feelings ─────────────────────────────────────────────────────
  const [pickingFor, setPickingFor] = useState(null); // effect id
  const toggleFeeling = async (effect, emotion) => {
    try {
      await toggleFeelingLink({ categoryId, emotion, effect, existing: myFeelingLinks });
      qc.invalidateQueries({ queryKey: ["feelingLinks"] });
    } catch (e) { toast.error(e?.message || "Couldn't save"); }
  };

  // A feeling that isn't on the wheel yet: add it to the user's own
  // emotions (same as the check-in picker does), then link it.
  const addCustomFeeling = async (effect, label) => {
    const name = (label || "").trim();
    if (!name) return;
    try {
      if (!customEmotions.some((e) => (e.label || "").toLowerCase() === name.toLowerCase())) {
        await base44.entities.CustomEmotion.create({ label: name });
        qc.invalidateQueries({ queryKey: ["customEmotions"] });
      }
      if (!myFeelingLinks.some((l) => l.effect === effect && l.emotion === name)) await toggleFeeling(effect, name);
    } catch (e) { toast.error(e?.message || "Couldn't add"); }
  };

  if (!cat) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="gap-1" onClick={onBack}><ArrowLeft className="w-4 h-4" /> All activities</Button>
        <p className="text-sm text-muted-foreground">This activity couldn't be found. It may have been deleted.</p>
      </div>
    );
  }

  const whoForm = form && (
          <div className="space-y-2.5">
            <AlterSearchSelect alters={alters} value={form.alter_id} terms={t} showNone={false}
              placeholder={`Pick ${t.alter}…`}
              onChange={(id) => setForm((f) => ({ ...f, alter_id: id }))} />
            <RelationTypePicker value={form.relation} types={linkTypes}
              onChange={(id) => setForm((f) => ({ ...f, relation: id }))} />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">How strongly</span>
              <StrengthDots value={form.strength} onChange={(n) => setForm((f) => ({ ...f, strength: n }))} />
            </div>
            <MentionTextarea value={form.note} onChange={(v) => setForm((f) => ({ ...f, note: v }))}
              alters={alters} signposts rows={2} placeholder="Note (optional)" />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={saveForm} disabled={!form.alter_id || saving}>{form.id ? "Save" : "Add"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              {form.id && (
                <Button size="sm" variant="ghost" className="ml-auto text-destructive gap-1"
                  onClick={() => removeLink(myAlterLinks.find((l) => l.id === form.id))}>
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </Button>
              )}
            </div>
          </div>
  );

  const feelingsEditor = (
    <>
        {FEELING_EFFECTS.map((eff) => {
          const list = myFeelingLinks.filter((l) => l.effect === eff.id);
          const open = pickingFor === eff.id;
          return (
            <div key={eff.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{eff.label}</p>
                <button type="button" onClick={() => setPickingFor(open ? null : eff.id)}
                  className="text-xs text-primary hover:underline">{open ? "Done" : list.length ? "Change" : "Add feelings"}</button>
              </div>
              {list.length === 0 && !open && <p className="text-xs text-muted-foreground">Nothing set.</p>}
              {list.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {list.map((l) => (
                    <span key={l.id} className="text-xs pl-2.5 pr-1 py-0.5 rounded-full border border-border/60 flex items-center gap-1">
                      {l.emotion}
                      <button type="button" aria-label={`Remove ${l.emotion}`} onClick={() => toggleFeeling(eff.id, l.emotion)}
                        className="p-0.5 rounded-full hover:bg-muted"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              {open && (
                <EmotionWheelPicker selectedEmotions={list.map((l) => l.emotion)}
                  onToggle={(emotion) => toggleFeeling(eff.id, emotion)} customEmotions={customEmotions}
                  onAddCustom={(label) => addCustomFeeling(eff.id, label)} />
              )}
            </div>
          );
        })}
    </>
  );

  const relations = allRelations(linkTypes, { includeRemoved: true });
  const known = new Set(relations.map((r) => r.id));
  const linksByRelation = [...relations, { id: "__other", label: "Other" }]
    .map((r) => ({ ...r, links: myAlterLinks.filter((l) => (r.id === "__other" ? !known.has(l.relation) : l.relation === r.id)) }))
    .filter((r) => r.links.length);

  if (pixel) {
    const maxBar = Math.max(1, ...pixelBars.map((d) => d.n));
    const feelingsSet = myFeelingLinks.length > 0;
    const effectLabel = (id) => FEELING_EFFECTS.find((e) => e.id === id)?.label || id;
    const whoOf = (a) => alterById[a.alter_id || (a.fronting_alter_ids || [])[0] || (a.alter_ids || [])[0]] || null;
    const fmtShort = (min) => {
      const h = Math.floor(min / 60), m = Math.round(min % 60);
      return h ? (m ? `${h} h ${m}` : `${h} h`) : `${m} min`;
    };
    return (
      <div className={`pa-detail${desk ? " desk" : ""}`}>
        <div className="pa-panel pa-head">
          {!desk && <button type="button" className="pa-btn sm" onClick={onBack}>&lt; All</button>}
          <span className="pa-bigsq" style={{ background: cat.color || "#8b5cf6" }} aria-hidden />
          <div className="pa-headtxt">
            <h2 className="pa-name-big">{cat.name}</h2>
            <p className="pa-path">{[...path, cat.name].join(" / ")}</p>
          </div>
          <span className="pa-headacts">
            <button type="button" className="pa-btn" onClick={() => navigate("/planner")}>Log or plan it on the Planner</button>
            {onRename && <button type="button" className="pa-btn" onClick={() => onRename(cat.id)}>Change</button>}
          </span>
        </div>
        <div className="pa-cols">
          <div className="pa-col">
            <section className="pa-panel">
              <div className="pa-ttl"><span>How it&apos;s going</span><span className="pa-ttl-note">Last 30 days{children.length ? ", with sub-activities" : ""}</span></div>
              <div className="pa-stats">
                <div className="pa-stat"><span className="pa-stat-l">Times done</span><span className="pa-stat-v">{stats.times}</span></div>
                <div className="pa-stat"><span className="pa-stat-l">Total time</span><span className="pa-stat-v">{stats.minutes ? fmtShort(stats.minutes) : "-"}</span></div>
                <div className="pa-stat"><span className="pa-stat-l">Last done</span><span className="pa-stat-v">{stats.last ? formatDistanceToNow(stats.last, { addSuffix: true }) : "not yet"}</span></div>
              </div>
              <div className="pa-bars" role="img" aria-label={`${stats.month} times in the last 30 days`}>
                {pixelBars.map((d) => (
                  <span key={d.day.toISOString()} className={`pa-bar${d.n ? "" : " zero"}`}
                    style={{ height: d.n ? `${Math.max(12, (d.n / maxBar) * 100)}%` : undefined, background: d.n ? (cat.color || "var(--color-primary)") : undefined }}
                    title={`${format(d.day, "MMM d")}: ${d.n}`} />
                ))}
              </div>
              <p className="pa-note">{stats.month} in the last 30 days{stats.upcoming ? ` · ${stats.upcoming} planned ahead` : ""}</p>
            </section>
            <section className="pa-panel pa-grow">
              <div className="pa-ttl"><span>Recent entries</span></div>
              <div className="pa-list">
                {entries.length === 0 && <p className="pa-empty">Nothing logged or planned yet.</p>}
                {entries.slice(0, 20).map((a) => {
                  const st = statusFor(a);
                  const who = whoOf(a);
                  return (
                    <button key={a.id} type="button" className="pa-entry" onClick={() => navigate(`/planner?activityId=${encodeURIComponent(a.id)}`)}>
                      <span className="pa-entry-d">{a.timestamp ? format(new Date(a.timestamp), "MMM d") : ""}</span>
                      <span className="pa-entry-n">{a.activity_name || byId[categoryIdOf(a)]?.name || cat.name}</span>
                      {st !== "logged" && st !== "done" && <span className="pa-chip">{STATUS_LABELS[st] || st}</span>}
                      <span className="pa-entry-m">{minutesOf(a) ? fmtShort(minutesOf(a)) : ""}</span>
                      <span className="pa-sq" style={{ background: who?.color || "transparent" }} title={who ? formatAlter(who) : undefined} />
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
          <div className="pa-col">
            <section className="pa-panel">
              <div className="pa-ttl">
                <span>Who &amp; feelings</span>
                <button type="button" className="pa-ttl-act" onClick={() => { setWhoEdit((v) => !v); setForm(null); setPickingFor(null); }}>{whoEdit ? "Done" : "Change"}</button>
              </div>
              <div className="pa-body">
                {whoForm ? whoForm : (
                  <div className="pa-chips">
                    {myAlterLinks.map((l) => {
                      const a = alterById[l.alter_id];
                      return (
                        <button key={l.id} type="button" className="pa-chip" onClick={() => openForm(l)}>
                          <span className="pa-sq" style={{ background: a?.color || "#8b5cf6" }} />
                          {a ? formatAlter(a) : `Unknown ${t.alter}`} {relationLabel(l.relation, linkTypes).toLowerCase()}
                        </button>
                      );
                    })}
                    <button type="button" className="pa-chip" onClick={() => openForm()}>+ Link {t.alter}</button>
                  </div>
                )}
                {!whoForm && (whoEdit ? (
                  <div className="pa-feel-edit">{feelingsEditor}</div>
                ) : (
                  <div className="pa-feel">
                    <span className="pa-mut">Feelings</span>
                    {myFeelingLinks.map((l) => (
                      <span key={l.id} className="pa-chip" title={effectLabel(l.effect)}>{l.emotion}</span>
                    ))}
                    <button type="button" className="pa-chip" onClick={() => setWhoEdit(true)}>{feelingsSet ? "Change" : "+ Add feelings"}</button>
                  </div>
                ))}
              </div>
            </section>
            <section className="pa-panel">
              <div className="pa-ttl">
                <span>Sub-activities</span>
                {onAddSub && <button type="button" className="pa-ttl-act" onClick={() => onAddSub(cat.id)}>+ add</button>}
              </div>
              <div className="pa-list">
                {children.length === 0 && <p className="pa-empty">None yet.</p>}
                {children.map((c) => (
                  <button key={c.id} type="button" className="pa-subrow" onClick={() => onOpen?.(c.id)}>
                    <span className="pa-sq" style={{ background: c.color || cat.color || "#8b5cf6" }} />
                    <span className="pa-entry-n">{c.name}</span>
                    <span className="pa-mut">{subCounts[c.id] ? `${subCounts[c.id]} time${subCounts[c.id] === 1 ? "" : "s"}` : "not yet"}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="pa-panel pa-grow">
              <div className="pa-ttl"><span>Weekly goal</span></div>
              <div className="pa-body">
                {weekGoal ? (
                  <>
                    <div className="pa-goalrow"><span>{fmtShort(weekGoal.target)} a week</span><span className="pa-pf">{fmtShort(weekGoal.done)}</span></div>
                    <div className="pa-meter"><span style={{ width: `${Math.min(100, weekGoal.target ? (weekGoal.done / weekGoal.target) * 100 : 0)}%`, background: cat.color || "var(--color-primary)" }} /></div>
                  </>
                ) : (
                  <>
                    <p className="pa-mut pa-small">No weekly goal for this activity this week.</p>
                    <button type="button" className="pa-btn sm" onClick={() => navigate("/planner")}>Set one on the Planner</button>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" /> All activities
        </Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate("/planner")}>
          <CalendarRange className="w-4 h-4" /> Planner
        </Button>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: cat.color || "#8b5cf6" }} />
        <div className="min-w-0">
          {path.length > 0 && <p className="text-xs text-muted-foreground truncate">{path.join(" › ")}</p>}
          <h2 className="text-xl font-semibold truncate">{cat.name}</h2>
        </div>
      </div>

      <Section title={children.length ? "How it's going (with sub-activities)" : "How it's going"}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Times done" value={stats.times} />
          <Stat label="Total time" value={stats.minutes ? fmtMin(stats.minutes) : "—"} />
          <Stat label="Last 30 days" value={`${stats.month}×`} />
          <Stat label="Last done" value={stats.last ? formatDistanceToNow(stats.last, { addSuffix: true }) : "Not yet"} />
        </div>
        {stats.upcoming > 0 && <p className="text-xs text-muted-foreground">{stats.upcoming} planned ahead.</p>}
      </Section>

      <Section title={`Who`} icon={<Users className="w-4 h-4" />}
        action={!form && (
          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => openForm()}>
            <Plus className="w-3.5 h-3.5" /> Link {t.alter}
          </Button>
        )}>
        {!form && linksByRelation.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No {t.alters} linked yet. Note who enjoys this, who needs it, who finds it hard, or who tends to interrupt it.
          </p>
        )}
        {!form && linksByRelation.map((r) => (
          <div key={r.id}>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{r.label}</p>
            <div className="space-y-1">
              {r.links.map((l) => {
                const a = alterById[l.alter_id];
                return (
                  <button key={l.id} type="button" onClick={() => openForm(l)}
                    className="w-full text-left flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: a?.color || "#8b5cf6" }} />
                    <span className="text-sm truncate flex-1">{a ? formatAlter(a) : `Unknown ${t.alter}`}</span>
                    <StrengthDots value={clampStrength(l.strength)} />
                    {l.note && <span className="text-xs text-muted-foreground truncate max-w-[40%]"><RichText content={l.note} /></span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {whoForm}
      </Section>

      <Section title="Feelings" icon={<Heart className="w-4 h-4" />}>
        {feelingsEditor}
      </Section>

      {children.length > 0 && (
        <Section title="Sub-activities">
          <div className="space-y-0.5">
            {children.map((c) => (
              <button key={c.id} type="button" onClick={() => onOpen?.(c.id)}
                className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40 text-left">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color || cat.color || "#8b5cf6" }} />
                <span className="text-sm flex-1 truncate">{c.name}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Recent entries">
        {entries.length === 0 && <p className="text-xs text-muted-foreground">Nothing logged or planned yet.</p>}
        <div className="space-y-0.5">
          {entries.slice(0, 10).map((a) => {
            const st = statusFor(a);
            return (
              <button key={a.id} type="button" onClick={() => navigate(`/planner?activityId=${encodeURIComponent(a.id)}`)}
                className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40 text-left">
                <span className="text-sm flex-1 truncate">{a.activity_name || byId[categoryIdOf(a)]?.name || cat.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                  {a.timestamp ? format(new Date(a.timestamp), "d MMM, HH:mm") : ""}
                  {minutesOf(a) ? ` · ${fmtMin(minutesOf(a))}` : ""}
                </span>
                {st !== "logged" && st !== "done" && (
                  <span className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{STATUS_LABELS[st] || st}</span>
                )}
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
