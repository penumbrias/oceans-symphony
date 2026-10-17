// The guided goal builder (System Needs, phase 5): one question per
// screen, each with example picks, every one but the first skippable.
// "Start from an idea" templates fill the answers in; the person can still
// change each one on its way past.
//
// With an existing `goal` it is the goal's editor instead: the same
// questions on one screen, without the first-step and when questions.

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, X, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { SearchableMultiSelect } from "@/components/shared/SearchableSelect";
import PlanTimeChoice from "@/components/planner/PlanTimeChoice";
import { prepareAuthoredText, recordAuthoredText, isLogCommandError } from "@/lib/authoredText";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import {
  GOAL_TEMPLATES, WHY_EXAMPLES, IMPACT_EXAMPLES, FIRST_STEP_EXAMPLES, stepToPlan,
} from "@/lib/goals";
import { format } from "date-fns";

const chip = (on = false) => `text-xs px-2.5 py-1 rounded-full border ${
  on ? "border-primary text-primary bg-primary/10" : "border-border/60 text-muted-foreground hover:text-foreground"
}`;
const inputCls = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

function appendText(prev, add) {
  const p = String(prev || "").trim();
  if (!p) return add;
  return /[.!?…]$/.test(p) ? `${p} ${add}` : `${p}. ${add}`;
}

function initialForm(goal, seed) {
  const g = goal || seed || {};
  return {
    title: g.title || "",
    why: g.why || "",
    impact: g.impact || "",
    for_everyone: g.for_everyone ?? false,
    owner_alter_ids: g.owner_alter_ids || [],
    struggler_alter_ids: g.struggler_alter_ids || [],
    supporter_alter_ids: g.supporter_alter_ids || [],
    target_date: g.target_date || "",
    template_id: g.template_id || null,
    wish_id: g.wish_id || null,
    steps: seed?.steps || [""],
  };
}

export default function GoalBuilder({ goal = null, seed = null, alters = [], onDone, onCancel }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const editing = !!goal;
  const [form, setForm] = useState(() => initialForm(goal, seed));
  const [screen, setScreen] = useState(0);
  const [when, setWhen] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const { data: categories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  const alterOptions = useMemo(
    () => (alters || []).filter((a) => !a.is_archived)
      .map((a) => ({ id: a.id, label: formatAlter(a), color: a.color, avatar_url: a.avatar_url || a.image_url })),
    [alters, formatAlter],
  );
  const pickAlters = (key, placeholder) => (
    <SearchableMultiSelect
      value={form[key]}
      onChange={(next) => set(key, next || [])}
      options={alterOptions}
      placeholder={placeholder}
      searchPlaceholder={`Search ${t.alters}…`}
    />
  );

  const applyTemplate = (tpl) => setForm((p) => ({
    ...p, title: tpl.title, why: p.why || tpl.why, template_id: tpl.id, steps: [...tpl.steps],
  }));

  const screens = [
    {
      id: "what", q: "What do we want?",
      body: (
        <div className="space-y-3">
          <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && form.title.trim()) setScreen(1); }}
            aria-label="Goal" placeholder="Something we're working toward…" autoFocus />
          {!editing && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Or start from an idea</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {GOAL_TEMPLATES.map((tpl) => (
                  <button key={tpl.id} type="button" onClick={() => applyTemplate(tpl)}
                    className={`text-left text-sm px-3 py-2 rounded-lg border ${
                      form.template_id === tpl.id ? "border-primary bg-primary/10" : "border-border/60 hover:bg-muted/40"
                    }`}>
                    <span className="mr-1.5" aria-hidden="true">{tpl.emoji}</span>{tpl.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      id: "why", q: "Why does it matter?",
      body: (
        <div className="space-y-2">
          <MentionTextarea value={form.why} onChange={(v) => set("why", v)} alters={alters} signposts
            placeholder="What makes this worth it…" className="min-h-[70px] text-sm" />
          <div className="flex flex-wrap gap-1.5">
            {WHY_EXAMPLES.map((ex) => (
              <button key={ex} type="button" className={chip()} onClick={() => set("why", appendText(form.why, ex))}>{ex}</button>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "impact", q: "What would it change for us?",
      body: (
        <div className="space-y-2">
          <MentionTextarea value={form.impact} onChange={(v) => set("impact", v)} alters={alters} signposts
            placeholder="What reaching it would do…" className="min-h-[70px] text-sm" />
          <div className="flex flex-wrap gap-1.5">
            {IMPACT_EXAMPLES.map((ex) => (
              <button key={ex} type="button" className={chip()} onClick={() => set("impact", appendText(form.impact, ex))}>{ex}</button>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "who", q: "Who wants it?",
      body: (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.for_everyone} onChange={(e) => set("for_everyone", e.target.checked)} className="rounded" />
            Everyone in the {t.system}
          </label>
          {!form.for_everyone && pickAlters("owner_alter_ids", `Pick ${t.alters}`)}
        </div>
      ),
    },
    {
      id: "hard", q: "Who finds it hard?",
      hint: `Knowing who struggles with it helps plan around them, not against them.`,
      body: pickAlters("struggler_alter_ids", `Pick ${t.alters} (optional)`),
    },
    {
      id: "help", q: "Who can help?",
      body: pickAlters("supporter_alter_ids", `Pick ${t.alters} (optional)`),
    },
    {
      id: "step", q: "What's the smallest first step?", create: true,
      hint: "Small enough that it feels almost too easy.",
      body: (
        <div className="space-y-2">
          {form.steps.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input className={inputCls} value={s} aria-label={`Step ${i + 1}`}
                placeholder={i === 0 ? "The very first move…" : "Then…"}
                onChange={(e) => set("steps", form.steps.map((x, j) => (j === i ? e.target.value : x)))} />
              {form.steps.length > 1 && (
                <button type="button" aria-label={`Remove step ${i + 1}`} className="p-2 text-muted-foreground hover:text-foreground"
                  onClick={() => set("steps", form.steps.filter((_, j) => j !== i))}>
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            onClick={() => set("steps", [...form.steps, ""])}>
            <Plus className="w-3.5 h-3.5" /> Another step
          </button>
          <div className="flex flex-wrap gap-1.5">
            {FIRST_STEP_EXAMPLES.map((ex) => (
              <button key={ex} type="button" className={chip()}
                onClick={() => set("steps", form.steps[0]?.trim() ? [ex, ...form.steps] : [ex, ...form.steps.slice(1)])}>
                {ex}
              </button>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "when", q: "When could we try the first step?", create: true,
      body: (
        <div className="space-y-3">
          {when ? (
            <div className="flex items-center gap-2 text-sm">
              <span>Planned for {format(when, "EEE d MMM, HH:mm")}</span>
              <button type="button" className={chip()} onClick={() => setWhen(null)}>Change</button>
            </div>
          ) : (
            <PlanTimeChoice kind="later" item={{}} prompt="Pick a time and it goes in the planner." onPick={setWhen} />
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="goal-target-date">Hoping to reach the goal by (optional)</label>
            <input id="goal-target-date" type="date" className={`${inputCls} w-auto`} value={form.target_date}
              onChange={(e) => set("target_date", e.target.value)} />
          </div>
        </div>
      ),
    },
  ];

  const visible = editing ? screens.filter((s) => !s.create) : screens;
  const last = screen >= visible.length - 1;

  const save = async () => {
    const title = form.title.trim();
    if (!title) { setScreen(0); return; }
    const prep = async (text) => {
      if (!String(text || "").trim()) return { content: "", authorIds: [] };
      try {
        return await prepareAuthoredText(text.trim(), { alters, terms: t, surfaceLabel: "goal" });
      } catch (e) {
        if (isLogCommandError(e)) { toast.error(e.message); return null; }
        throw e;
      }
    };
    const why = await prep(form.why);
    if (why === null) return;
    const impact = await prep(form.impact);
    if (impact === null) return;
    setSaving(true);
    try {
      const fields = {
        title,
        why: why.content,
        impact: impact.content,
        for_everyone: form.for_everyone,
        owner_alter_ids: form.for_everyone ? [] : form.owner_alter_ids,
        struggler_alter_ids: form.struggler_alter_ids,
        supporter_alter_ids: form.supporter_alter_ids,
        target_date: form.target_date || null,
        author_alter_ids: [...new Set([...(why.authorIds || []), ...(impact.authorIds || [])])],
      };
      let saved;
      if (editing) {
        saved = await base44.entities.Goal.update(goal.id, fields);
      } else {
        saved = await base44.entities.Goal.create({
          ...fields, status: "active", status_changed_at: new Date().toISOString(),
          template_id: form.template_id, wish_id: form.wish_id,
        });
        const titles = form.steps.map((s) => s.trim()).filter(Boolean);
        const created = [];
        for (let i = 0; i < titles.length; i++) {
          created.push(await base44.entities.GoalStep.create({ goal_id: saved.id, kind: "check", order: i + 1, title: titles[i] }));
        }
        if (when && created[0]) await stepToPlan(created[0], when, saved);
        if (form.wish_id) {
          await base44.entities.Wish.update(form.wish_id, { status: "in_progress", status_changed_at: new Date().toISOString() })
            .catch(() => { /* the goal stands */ });
        }
      }
      const id = goal?.id || saved?.id;
      for (const p of [why, impact]) {
        if (!p.content) continue;
        await recordAuthoredText({ ...p, alters, sourceType: "goal", sourceId: id, sourceLabel: `Goal: ${title}`, navigatePath: `/goals?highlight=${id}` });
      }
      onDone?.(saved, { wishChanged: !!form.wish_id, categories });
    } catch (e) {
      toast.error(e?.message || "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="space-y-4">
        {visible.map((s) => (
          <div key={s.id} className="space-y-1.5">
            <p className="text-sm font-medium">{s.q}</p>
            {s.body}
          </div>
        ))}
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="goal-target-date-edit">Hoping to reach it by</label>
          <input id="goal-target-date-edit" type="date" className={`${inputCls} w-auto`} value={form.target_date}
            onChange={(e) => set("target_date", e.target.value)} />
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}><X className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !form.title.trim()}><Check className="w-3.5 h-3.5 mr-1" /> Save</Button>
        </div>
      </div>
    );
  }

  const cur = visible[screen];
  return (
    <div className="space-y-4" data-tour="goal-builder">
      <div className="flex items-center gap-1" aria-hidden="true">
        {visible.map((s, i) => (
          <span key={s.id} className={`h-1 flex-1 rounded-full ${i <= screen ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{cur.q}</h2>
        {cur.hint && <p className="text-xs text-muted-foreground">{cur.hint}</p>}
      </div>
      {cur.body}
      <div className="flex items-center gap-2 pt-2">
        {screen === 0 ? (
          <Button size="sm" variant="ghost" onClick={onCancel}><X className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setScreen((s) => s - 1)}><ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back</Button>
        )}
        <span className="flex-1" />
        {screen > 0 && !last && (
          <Button size="sm" variant="ghost" onClick={() => setScreen((s) => s + 1)}>Skip</Button>
        )}
        {last ? (
          <Button size="sm" onClick={save} disabled={saving || !form.title.trim()}>
            <Check className="w-3.5 h-3.5 mr-1" /> Make the goal
          </Button>
        ) : (
          <Button size="sm" onClick={() => setScreen((s) => s + 1)} disabled={screen === 0 && !form.title.trim()}>
            Next <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}

