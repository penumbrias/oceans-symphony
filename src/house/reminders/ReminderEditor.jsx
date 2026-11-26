// The house's reminder editor: board 24-ReminderEditorPhone, and the right
// panel of the Reminders room on a computer. A title bar (the reminder's
// name · Cancel · Save), label-and-field rows, the grid of "when should
// this fire?" kinds with that kind's settings in a sunken box under it, then
// who it's for, its buttons, how it's delivered, quiet hours, clearing
// itself, snooze lengths, and "Last fired · … Delete" at the foot.
//
// Every option the old editor (ReminderEditorModal) has is drawn here with
// the house kit. The form, its defaults, what each kind starts as and the
// data that is saved come from src/lib/reminderForm.js (the old editor
// uses the same), and the save is saveReminder (src/lib/reminderEntry.js),
// so the schedulers see exactly the same Reminder row from either house.

import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button, IconButton } from "@/house/kit/Button";
import { Panel } from "@/house/kit/Panel";
import { TextField, NumberField, DateField, TimeField, FieldShell } from "@/house/kit/Field";
import { Checkbox, Segmented } from "@/house/kit/Choices";
import { AlterPicker, NestedPicker } from "@/house/kit/Pickers";
import Menu from "@/house/kit/Menu";
import { showToast } from "@/house/kit/Toast";
import NotificationStatusCard from "@/components/shared/NotificationStatusCard";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { clockPattern } from "@/lib/timeFormat";
import { isPushEnabled } from "@/lib/pushRegistration";
import { saveReminder } from "@/lib/reminderEntry";
import { flattenCategoryTree } from "@/lib/categoryTreeUtils";
import {
  CATEGORIES, CATEGORY_LABELS, DAYS, ALL_DAYS, DISTRESS_EMOTIONS, BASE_EMOTIONS, AUTO_RESOLVE_ON_BASE, DEFAULT_LOOKBACK,
  PRE_ALERT_OPTIONS, preAlertLabel, getActionTypeOptions, MAX_INLINE_ACTIONS, DEFAULT_SNOOZE_OPTIONS, formatSnoozeLabel,
  snoozeMinutes, formFromReminder, reminderKinds, reminderKindOf, kindPatch, reminderFormProblem, reminderSaveData,
  alterScopeWarnings, resolveWords,
} from "@/lib/reminderForm";
import { eventParts, eventIso } from "@/house/reminders/remindersModel";

function Line({ label, children, top = false, className = "" }) {
  return (
    <div className={`hrm-line${top ? " hrm-line--top" : ""} ${className}`}>
      <span className="hrm-line-label">{label}</span>
      <div className="hrm-line-field">{children}</div>
    </div>
  );
}

function Chip({ on = false, children, ...rest }) {
  return (
    <Button rank={on ? "primary" : "secondary"} aria-pressed={on} className="hrm-chip" {...rest}>{children}</Button>
  );
}

export default function ReminderEditor({ existing, onClose, onSaved, onDelete, phone = false }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const [form, setForm] = useState(() => formFromReminder(existing));
  const [hasAutoResolve, setHasAutoResolve] = useState(!!existing?.auto_resolve_rule);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(null);
  const [open, setOpen] = useState({ scope: !!existing?.alter_id, action: null });
  const [snoozeAdd, setSnoozeAdd] = useState({ amount: null, unit: "minutes" });
  useEffect(() => {
    setForm(formFromReminder(existing));
    setHasAutoResolve(!!existing?.auto_resolve_rule);
    setProblem(null);
    setOpen({ scope: !!existing?.alter_id, action: null });
  }, [existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- a new reminder picked, not each refetch

  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: symptoms = [] } = useQuery({ queryKey: ["symptoms"], queryFn: () => base44.entities.Symptom.list() });
  const { data: customEmotions = [] } = useQuery({ queryKey: ["customEmotions"], queryFn: () => base44.entities.CustomEmotion.list() });
  const { data: activityCategories = [] } = useQuery({ queryKey: ["activityCategories"], queryFn: () => base44.entities.ActivityCategory.list() });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const cfg = form.trigger_config || {};
  const setCfg = (key, val) => setForm((f) => ({ ...f, trigger_config: { ...(f.trigger_config || {}), [key]: val } }));
  const kind = reminderKindOf(form);
  const liveAlters = alters.filter((a) => !a.is_archived);
  const liveSymptoms = symptoms.filter((s) => !s.is_archived);
  const allEmotions = useMemo(() => [...new Set([...BASE_EMOTIONS, ...customEmotions.map((e) => e.name || e.label).filter(Boolean)])], [customEmotions]);
  const actionTypes = getActionTypeOptions(terms);
  const autoResolveOn = AUTO_RESOLVE_ON_BASE.map((o) => (o.labelKey === "front" ? { ...o, label: `${terms.Front} updated` } : o));
  const categoryOptions = useMemo(() => flattenCategoryTree(activityCategories).map((c) => ({ id: c.id, label: c.name, color: c.color, _depth: c._depth })), [activityCategories]);
  const name = form.title?.trim() || (existing ? "Reminder" : "New reminder");

  const save = async () => {
    const p = reminderFormProblem(form);
    if (p) { setProblem(p); return; }
    setProblem(null);
    setSaving(true);
    try {
      let pushOn = true;
      const ch = form.delivery_channels || [];
      if (ch.includes("push") && !ch.includes("in_app")) {
        try { pushOn = await isPushEnabled(); } catch { pushOn = false; }
      }
      await saveReminder(existing, reminderSaveData(form, { hasAutoResolve, pushOn }));
      onSaved?.();
      showToast({ message: existing ? `Saved ${name}.` : `${name} is set.` });
      onClose?.();
    } catch (e) {
      // Nothing is lost: the form stays open with every word still in it.
      showToast({ tone: "failed", message: "Couldn't save this reminder.", detail: `${e?.message ? `${e.message}. ` : ""}Everything you typed is still here; try Save again.` });
    } finally {
      setSaving(false);
    }
  };

  const toggleIn = (key, v) => {
    const arr = cfg[key] || [];
    setCfg(key, arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };
  const delay = (words = "min") => (
    <NumberField label="Fire after" value={cfg.delay_minutes || 0} min={0} unit={words} onChange={(v) => setCfg("delay_minutes", v ?? 0)} />
  );

  // ── The kind's own settings (the sunken box) ──
  let kindBox = null;
  if (kind === "scheduled") {
    const times = cfg.times?.length ? cfg.times : ["09:00"];
    const days = cfg.days || ALL_DAYS;
    kindBox = (
      <>
        <div className="hrm-times" role="group" aria-label="Times">
          {times.map((t, i) => (
            <span key={i} className="hrm-time">
              <TimeField label={times.length > 1 ? `Time ${i + 1}` : "Time"} value={t}
                onChange={(v) => { if (!v) return; const ts = [...times]; ts[i] = v; setCfg("times", ts); }} />
              {times.length > 1 ? <IconButton icon={X} label={`Remove time ${i + 1}`} onClick={() => setCfg("times", times.filter((_, j) => j !== i))} /> : null}
            </span>
          ))}
          <Button rank="quiet" icon={Plus} onClick={() => setCfg("times", [...times, "12:00"])}>Add a time</Button>
        </div>
        <Line label="Days" top>
          {DAYS.map((d, i) => <Chip key={d} on={days.includes(i)} onClick={() => setCfg("days", days.includes(i) ? days.filter((x) => x !== i) : [...days, i])}>{d}</Chip>)}
        </Line>
      </>
    );
  } else if (kind === "interval") {
    const w = cfg.active_window || {};
    kindBox = (
      <>
        <NumberField label="Every" value={cfg.every_minutes || 60} min={5} unit="min" onChange={(v) => setCfg("every_minutes", v ?? 60)} />
        <Segmented label="Restart the clock after" showLabel value={cfg.after_last || "fire"} onChange={(v) => setCfg("after_last", v)}
          options={[{ value: "fire", label: "Last fire" }, { value: "check_in", label: "Last check-in" }]} />
        <div className="hrm-pair" role="group" aria-label="Only between set hours (optional)">
          <TimeField label="Only from" clearable value={w.start || null} onChange={(v) => setCfg("active_window", { ...w, start: v || "" })} />
          <TimeField label="until" clearable value={w.end || null} onChange={(v) => setCfg("active_window", { ...w, end: v || "" })} />
        </div>
      </>
    );
  } else if (kind === "ctx:no_front_update") {
    kindBox = <NumberField label={`No ${terms.front} update for`} value={cfg.threshold_minutes || 120} min={10} unit="min" onChange={(v) => setCfg("threshold_minutes", v ?? 120)} />;
  } else if (kind === "ctx:emotion_logged") {
    kindBox = (
      <>
        <Line label="Which feelings" top>
          {allEmotions.map((e) => <Chip key={e} on={(cfg.matches || []).includes(e)} onClick={() => toggleIn("matches", e)}>{e}</Chip>)}
          <Button rank="quiet" onClick={() => setCfg("matches", DISTRESS_EMOTIONS)}>Distress presets</Button>
        </Line>
        <p className="hrm-hint">None picked: any feeling. Fires when a check-in with one of these is saved.</p>
        {delay()}
      </>
    );
  } else if (kind === "ctx:alter_fronts") {
    kindBox = (
      <>
        <AlterPicker label={`Which ${terms.alter}`} value={cfg.alter_id || null} onChange={(id) => setCfg("alter_id", id || null)}
          alters={liveAlters} showNone noneLabel={`Any ${terms.alter}`} placeholder={`Any ${terms.alter}`} />
        {delay()}
      </>
    );
  } else if (kind === "ctx:symptom_logged") {
    kindBox = (
      <>
        <Line label="Which symptoms" top>
          {liveSymptoms.length === 0 ? <span className="hrm-hint">No symptoms yet: add them in Manage check-in.</span> : null}
          {liveSymptoms.map((s) => <Chip key={s.id} on={(cfg.symptom_ids || []).includes(s.id)} onClick={() => toggleIn("symptom_ids", s.id)}>{s.label}</Chip>)}
        </Line>
        {delay()}
      </>
    );
  } else if (kind === "ctx:sleep_ended") {
    kindBox = delay("min after waking");
  } else if (kind === "event") {
    const { day, time } = eventParts(cfg.when);
    kindBox = (
      <>
        <div className="hrm-pair">
          <DateField label="On" value={day} onChange={(v) => setCfg("when", v ? eventIso(v, time) : null)} />
          <TimeField label="At" value={time} onChange={(v) => { if (day) setCfg("when", eventIso(day, v)); }} />
        </div>
        <Line label="Pre-alerts" top>
          {PRE_ALERT_OPTIONS.map((o) => <Chip key={o} on={(cfg.pre_alerts || []).includes(o)} onClick={() => toggleIn("pre_alerts", o)}>{preAlertLabel(o)}</Chip>)}
        </Line>
      </>
    );
  }

  // ── Who it's for ──
  const scoped = alters.find((a) => a.id === form.alter_id);
  const warnings = alterScopeWarnings(form, alters, terms, formatAlter);
  const pickFor = (id) => {
    if (!id) { set("alter_id", null); set("alter_scope", null); set("alter_scope_catchup", false); return; }
    setForm((f) => ({ ...f, alter_id: id, alter_scope: f.alter_scope || "always" }));
  };

  // ── Buttons ──
  const actions = form.inline_actions || [];
  const setAction = (i, fields) => set("inline_actions", actions.map((a, j) => (j === i ? { ...a, ...fields } : a)));
  const editing = open.action != null && actions[open.action] ? open.action : null;

  // ── Clears itself ──
  const rule = form.auto_resolve_rule || { on: "check_in", lookback_minutes: 120 };
  const setRule = (fields) => set("auto_resolve_rule", { ...rule, ...fields });

  const snoozeOpts = form.snooze_options || DEFAULT_SNOOZE_OPTIONS;
  const addSnooze = (opt) => { if (opt != null && !snoozeOpts.includes(opt)) set("snooze_options", [...snoozeOpts, opt]); };
  const channels = form.delivery_channels || [];
  const toggleChannel = (c) => set("delivery_channels", channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c]);
  const lastFired = existing?.last_fired_at ? new Date(existing.last_fired_at) : null;

  return (
    <Panel className="hrm-pn hrm-ed" headingLevel={2} title={<span className="hrm-ed-name">{name}</span>}
      tools={(
        <span className="hrm-ed-acts">
          <Button rank="secondary" onClick={onClose}>Cancel</Button>
          <Button rank="primary" busy={saving} busyLabel="Saving…" onClick={save}>Save</Button>
        </span>
      )}>
      <div className="hrm-ed-body" data-tour="reminders-editor">
        {problem ? <p className="hrm-problem" role="alert">{problem}</p> : null}
        <Line label="Title"><TextField label="Title" value={form.title} onChange={(v) => set("title", v)} placeholder="e.g. Morning meds" /></Line>
        <Line label="Message" top>
          <FieldShell label="Message">
            {({ inputId, describedBy }) => (
              // ui-ok: a reminder's message is shown as written in the notification (the old editor's plain field, no save pipeline)
              <textarea id={inputId} aria-describedby={describedBy} className="hk-input hrm-msg" rows={2}
                value={form.body || ""} onChange={(e) => set("body", e.target.value)} placeholder="What it says when it fires (optional)" />
            )}
          </FieldShell>
        </Line>
        <Line label="Kind" top>
          {CATEGORIES.map((c) => <Chip key={c} on={form.category === c} onClick={() => set("category", c)}>{CATEGORY_LABELS[c]}</Chip>)}
        </Line>

        <h3 className="hrm-sub">When should this fire?</h3>
        <div className="hrm-kinds" role="group" aria-label="When should this fire?" data-tour="reminders-when">
          {reminderKinds(terms).map((k) => (
            <Chip key={k.id} on={kind === k.id} onClick={() => { if (k.id !== kind) setForm((f) => ({ ...f, ...kindPatch(k.id) })); }}>{k.label}</Chip>
          ))}
        </div>
        <div className="hrm-ins">{kindBox}</div>

        <Line label="For" top>
          <Chip on={!form.alter_id} onClick={() => { pickFor(null); setOpen((o) => ({ ...o, scope: false })); }}>everyone</Chip>
          {scoped ? <Chip on onClick={() => setOpen((o) => ({ ...o, scope: !o.scope }))}>{formatAlter(scoped)}{scoped.is_archived ? " (archived)" : ""}</Chip> : null}
          <Button rank="quiet" aria-expanded={open.scope} onClick={() => setOpen((o) => ({ ...o, scope: !o.scope }))}>{open.scope ? "done" : `or pick ${terms.alters}`}</Button>
        </Line>
        {open.scope ? (
          <div className="hrm-ins">
            <AlterPicker label={`Which ${terms.alter}`} value={form.alter_id || null} onChange={pickFor}
              alters={scoped?.is_archived ? [...liveAlters, scoped] : liveAlters} showNone noneLabel={`Everyone (the whole ${terms.system})`} placeholder="Everyone" />
            {scoped?.is_archived ? <p className="hrm-warn">{`The ${terms.alter} this was tied to is archived. Pick a new ${terms.alter} or switch to everyone.`}</p> : null}
            {form.alter_id ? (
              <Segmented label="It fires" showLabel value={form.alter_scope || "always"} onChange={(v) => set("alter_scope", v)}
                options={[{ value: "always", label: "Always" }, { value: "when_fronting", label: `Only when ${terms.fronting}` }]} />
            ) : null}
            {form.alter_id ? (
              <p className="hrm-hint">{form.alter_scope === "when_fronting"
                ? `It pauses itself while ${scoped ? formatAlter(scoped) : `this ${terms.alter}`} isn't in the ${terms.front}.`
                : `It fires as usual; the name just says who it's for.`}</p>
            ) : null}
            {form.alter_id && form.alter_scope === "when_fronting" && ["scheduled", "interval"].includes(form.trigger_type) ? (
              <Checkbox checked={!!form.alter_scope_catchup} onChange={(v) => set("alter_scope_catchup", v)}
                label={`Catch up when they next ${terms.front}`}
                description={`If ${scoped ? formatAlter(scoped) : `this ${terms.alter}`} wasn't ${terms.fronting} when it was due, fire the next time they are (up to 24 h).`} />
            ) : null}
            {warnings.map((w, i) => <p key={i} className="hrm-warn">{w}</p>)}
          </div>
        ) : null}

        <Line label="Buttons" top>
          {actions.map((a, i) => (
            <Chip key={i} on={editing === i} onClick={() => setOpen((o) => ({ ...o, action: o.action === i ? null : i }))}>{a.label || "(no label)"}</Chip>
          ))}
          {actions.length < MAX_INLINE_ACTIONS ? (
            <Button rank="secondary" className="hrm-chip" onClick={() => {
              set("inline_actions", [...actions, { label: "", action_type: "open_check_in", payload: {} }]);
              setOpen((o) => ({ ...o, action: actions.length }));
            }}>{`+ (max ${MAX_INLINE_ACTIONS})`}</Button>
          ) : null}
        </Line>
        {editing != null ? (
          <div className="hrm-ins">
            <TextField label="Button label" value={actions[editing].label || ""} placeholder="e.g. Try grounding" onChange={(v) => setAction(editing, { label: v })} />
            <NestedPicker label="Tapping it" value={actions[editing].action_type || "open_check_in"}
              options={actionTypes.map((o) => ({ id: o.value, label: o.label, _depth: 0 }))}
              onChange={(v) => { if (v) setAction(editing, { action_type: v, payload: {} }); }} />
            {actions[editing].action_type === "log_symptom" ? (
              <NestedPicker label="Which symptom" allowClear placeholder="Pick a symptom" value={actions[editing].payload?.symptom_id || null}
                options={liveSymptoms.map((s) => ({ id: s.id, label: s.label, color: s.color, _depth: 0 }))}
                onChange={(id) => setAction(editing, { payload: { symptom_id: id } })} />
            ) : null}
            {actions[editing].action_type === "open_route" ? (
              <TextField label="Page" value={actions[editing].payload?.path || ""} placeholder="/path (e.g. /analytics)" onChange={(v) => setAction(editing, { payload: { path: v } })} />
            ) : null}
            <span className="hrm-row-acts">
              <Button rank="quiet" icon={Trash2} onClick={() => { set("inline_actions", actions.filter((_, j) => j !== editing)); setOpen((o) => ({ ...o, action: null })); }}>Remove this button</Button>
              <Button rank="quiet" onClick={() => setOpen((o) => ({ ...o, action: null }))}>done</Button>
            </span>
          </div>
        ) : null}

        <Line label="Deliver by" top>
          <Chip on={channels.includes("in_app")} onClick={() => toggleChannel("in_app")}>In the app</Chip>
          <Chip on={channels.includes("push")} onClick={() => toggleChannel("push")}>Notification</Chip>
        </Line>
        {channels.includes("push") ? <NotificationStatusCard onlyWhenIssues /> : null}

        <Checkbox checked={!!form.quiet_hours_respect} onChange={(v) => set("quiet_hours_respect", v)}
          label="Respect quiet hours" description="Set in Settings → Notifications → Reminders" />
        <Checkbox checked={hasAutoResolve} label={hasAutoResolve ? `Clears itself when ${resolveWords(rule, terms)}` : "Clears itself"}
          description="If this happens before it fires, it skips that time (a meds reminder that clears when you log them early)."
          onChange={(v) => { setHasAutoResolve(v); set("auto_resolve_rule", v ? { on: "check_in", lookback_minutes: 120 } : null); }} />
        {hasAutoResolve ? (
          <div className="hrm-ins">
            <NestedPicker label="Clears when" value={rule.on || "check_in"} options={autoResolveOn.map((o) => ({ id: o.value, label: o.label, _depth: 0 }))}
              onChange={(v) => { if (v) setRule({ on: v, lookback_minutes: DEFAULT_LOOKBACK[v] || 60, symptom_id: undefined, category_id: undefined }); }} />
            {rule.on === "symptom_checkin" ? (
              <NestedPicker label="Which symptom" allowClear placeholder="Any symptom" value={rule.symptom_id || null}
                options={liveSymptoms.map((s) => ({ id: s.id, label: s.label, color: s.color, _depth: 0 }))} onChange={(id) => setRule({ symptom_id: id })} />
            ) : null}
            {rule.on === "activity" ? (
              <NestedPicker label="Which activity" allowClear placeholder="Any activity" value={rule.category_id || null}
                options={categoryOptions} onChange={(id) => setRule({ category_id: id })} />
            ) : null}
            <NumberField label="Looks back" value={rule.lookback_minutes || 60} min={5} unit="min before it fires" onChange={(v) => setRule({ lookback_minutes: v ?? 60 })} />
          </div>
        ) : null}

        <Line label="Snooze" top>
          {snoozeOpts.map((o, i) => (
            <span key={`${o}-${i}`} className="hrm-snz">
              <span>{formatSnoozeLabel(o)}</span>
              <IconButton icon={X} label={`Remove the ${formatSnoozeLabel(o)} snooze`} onClick={() => set("snooze_options", snoozeOpts.filter((_, j) => j !== i))} />
            </span>
          ))}
          {snoozeOpts.includes("tomorrow") ? null : <Button rank="secondary" className="hrm-chip" onClick={() => addSnooze("tomorrow")}>+ Tomorrow</Button>}
          {snoozeOpts.includes("next_week") ? null : <Button rank="secondary" className="hrm-chip" onClick={() => addSnooze("next_week")}>+ Next week</Button>}
          <Button rank="secondary" className="hrm-chip" aria-expanded={!!open.snooze} onClick={() => setOpen((o) => ({ ...o, snooze: !o.snooze }))}>{open.snooze ? "done" : "+ add"}</Button>
        </Line>
        {open.snooze ? (
          <div className="hrm-ins" role="group" aria-label="Add a snooze length">
            <NumberField label="Snooze for" value={snoozeAdd.amount} min={1} clearable onChange={(v) => setSnoozeAdd((x) => ({ ...x, amount: v }))} />
            <Segmented label="Unit" value={snoozeAdd.unit} onChange={(v) => setSnoozeAdd((x) => ({ ...x, unit: v }))}
              options={[{ value: "minutes", label: "min" }, { value: "hours", label: "hours" }]} />
            <span className="hrm-row-acts">
              <Button rank="quiet" onClick={() => set("snooze_options", DEFAULT_SNOOZE_OPTIONS)}>Reset to the usual</Button>
              <Button rank="primary" icon={Plus} disabledReason={snoozeMinutes(snoozeAdd.amount, snoozeAdd.unit) ? undefined : "Type a length first"}
                onClick={() => { addSnooze(snoozeMinutes(snoozeAdd.amount, snoozeAdd.unit)); setSnoozeAdd((x) => ({ ...x, amount: null })); }}>Add</Button>
            </span>
          </div>
        ) : null}
      </div>

      <div className="hrm-ed-foot">
        <span className="hrm-note">{lastFired ? `Last fired ${format(lastFired, clockPattern("MMM d, h:mm a"))}` : existing ? "Hasn't fired yet" : phone ? "" : "New reminder"}</span>
        {existing && onDelete ? (
          <Menu label={`More for ${name}`} items={[{ id: "delete", label: `Delete ${name}`, icon: Trash2, danger: true, onSelect: () => onDelete(existing) }]}>… Delete</Menu>
        ) : null}
      </div>
    </Panel>
  );
}
