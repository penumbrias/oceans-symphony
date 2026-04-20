import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, X, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { CATEGORY_ICONS } from "./reminderHelpers";
import { formatSnoozeLabel, DEFAULT_SNOOZE_OPTIONS } from "./snoozeHelpers";
import SearchableSelect from "@/components/shared/SearchableSelect";
import AlterScopeSection from "./AlterScopeSection";
import { registerPush, isPushEnabled } from "@/lib/pushRegistration";
import { useTerms } from "@/lib/useTerms";
import { toast } from "sonner";

const CATEGORIES = ["check_in", "habit", "meds", "grounding", "appointment", "custom"];
const TRIGGER_TYPES = ["scheduled", "interval", "contextual", "event"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const CONTEXTUAL_ON_BASE = [
  { value: "no_front_update", labelKey: "front" },
  { value: "emotion_logged", label: "Emotion logged" },
  { value: "alter_fronts", labelKey: "alter" },
  { value: "symptom_logged", label: "Symptom logged" },
  { value: "sleep_ended", label: "After sleep ends" },
];
const AUTO_RESOLVE_ON = [
  { value: "check_in", label: "Check-in saved" },
  { value: "symptom_checkin", label: "Symptom logged" },
  { value: "activity", label: "Activity logged" },
  { value: "front_update", labelKey: "front" },
];
const DISTRESS_EMOTIONS = ["anxious", "overwhelmed", "panic", "scared", "terrified", "crisis", "unsafe", "dissociated", "numb", "frozen"];
const BASE_EMOTIONS = ["happy", "content", "calm", "grateful", "hopeful", "excited", "proud", "loved", "safe", "sad", "anxious", "overwhelmed", "angry", "scared", "frustrated", "ashamed", "guilty", "lonely", "confused", "dissociated", "numb", "depressed", "panic", "terrified", "crisis", "unsafe", "frozen", "tired", "bored", "curious"];

const ACTION_TYPE_OPTIONS = [
  { value: "open_check_in",        label: "Check in" },
  { value: "open_grounding",       label: "Grounding exercise" },
  { value: "open_set_front",       label: "Set who's fronting" },
  { value: "open_journal",         label: "Open journal" },
  { value: "open_diary",           label: "Open diary" },
  { value: "open_symptom_check_in",label: "Log a symptom" },
  { value: "open_system_map",      label: "View system map" },
  { value: "open_timeline",        label: "View timeline" },
  { value: "open_todo",            label: "View to-do list" },
  { value: "log_symptom",          label: "Log a specific symptom" },
  { value: "dismiss",              label: "Dismiss" },
  { value: "open_route",           label: "Other page…" },
];
const PRE_ALERT_OPTIONS = [15, 60, 1440];

const DEFAULT_FORM = {
  title: "",
  body: "",
  category: "custom",
  trigger_type: "scheduled",
  trigger_config: { times: ["09:00"], days: [0,1,2,3,4,5,6] },
  delivery_channels: ["in_app"],
  alter_id: null,
  alter_scope: null,
  alter_scope_catchup: false,
  inline_actions: [],
  auto_resolve_rule: null,
  quiet_hours_respect: true,
  snooze_options: DEFAULT_SNOOZE_OPTIONS,
  is_active: true,
};

function Collapsible({ label, summary, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/40 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors text-left">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2">
          {!open && summary && <span className="text-xs text-muted-foreground">{summary}</span>}
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {open && <div className="px-4 py-3 space-y-3 border-t border-border/30">{children}</div>}
    </div>
  );
}

function SnoozeAdder({ current, onAdd }) {
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("minutes");

  const handleAdd = () => {
    const num = parseInt(value);
    if (!num || num < 1) return;
    const mins = unit === "hours" ? num * 60 : num;
    if (!current.includes(mins)) onAdd(mins);
    setValue("");
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="flex items-center gap-2">
        <Input type="number" min={1} value={value} onChange={e => setValue(e.target.value)}
          placeholder="Amount" className="h-7 text-xs w-20 min-w-0" />
        <select value={unit} onChange={e => setUnit(e.target.value)}
          className="h-7 text-xs border border-border/50 rounded-lg px-2 bg-background min-w-0 max-w-[80px]">
          <option value="minutes">min</option>
          <option value="hours">hours</option>
        </select>
        <button type="button" onClick={handleAdd}
          className="h-7 px-2 text-xs border border-dashed border-border/50 rounded-lg hover:border-primary/50 hover:text-primary transition-colors flex items-center gap-1 whitespace-nowrap">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
      <button type="button" onClick={() => onAdd("tomorrow")} disabled={current.includes("tomorrow")}
        className="h-7 px-2 text-xs border border-dashed border-border/50 rounded-lg hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-40 whitespace-nowrap">
        + Tomorrow
      </button>
      <button type="button" onClick={() => onAdd("next_week")} disabled={current.includes("next_week")}
        className="h-7 px-2 text-xs border border-dashed border-border/50 rounded-lg hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-40 whitespace-nowrap">
        + Next week
      </button>
    </div>
  );
}

function PillRow({ options, value, onChange, multi = false, labels }) {
  const isSelected = (o) => multi ? (value || []).includes(o) : value === o;
  const toggle = (o) => {
    if (multi) {
      const arr = value || [];
      onChange(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o]);
    } else {
      onChange(o);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button key={o} type="button" onClick={() => toggle(o)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            isSelected(o) ? "bg-primary text-white border-primary" : "bg-muted/30 text-muted-foreground border-border/40 hover:border-primary/50"
          }`}>
          {labels ? labels[o] || o : o}
        </button>
      ))}
    </div>
  );
}

function TriggerConfig({ triggerType, config, onChange, alters = [], symptoms = [], customEmotions = [] }) {
  const terms = useTerms();
  const set = (key, val) => onChange({ ...config, [key]: val });
  const allEmotions = [...new Set([...BASE_EMOTIONS, ...customEmotions.map(e => e.name || e.label).filter(Boolean)])];

  // Build contextual options with terminology
  const CONTEXTUAL_ON = CONTEXTUAL_ON_BASE.map(o => {
    if (o.labelKey === "front") return { ...o, label: `${terms.Front} not updated` };
    if (o.labelKey === "alter") return { ...o, label: `${terms.Alter} ${terms.fronts}` };
    return o;
  });

  if (triggerType === "scheduled") {
    const times = config.times || ["09:00"];
    return (
      <div className="space-y-3">
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Times</Label>
          <div className="space-y-2 mt-1.5">
            {times.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input type="time" value={t} className="h-8 text-sm w-36"
                  onChange={e => { const ts = [...times]; ts[i] = e.target.value; set("times", ts); }} />
                {times.length > 1 && (
                  <button type="button" onClick={() => set("times", times.filter((_, j) => j !== i))}>
                    <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => set("times", [...times, "12:00"])}
              className="text-xs text-primary flex items-center gap-1 hover:underline">
              <Plus className="w-3 h-3" /> Add another time
            </button>
          </div>
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Days</Label>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {DAYS.map((d, i) => (
              <button key={i} type="button"
                onClick={() => {
                  const days = config.days || [0,1,2,3,4,5,6];
                  set("days", days.includes(i) ? days.filter(x => x !== i) : [...days, i]);
                }}
                className={`w-10 h-8 rounded-lg text-xs font-medium transition-all border ${
                  (config.days || [0,1,2,3,4,5,6]).includes(i)
                    ? "bg-primary text-white border-primary"
                    : "bg-muted/30 text-muted-foreground border-border/40"
                }`}>{d}</button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (triggerType === "interval") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium text-muted-foreground w-24">Every</Label>
          <Input type="number" min={5} value={config.every_minutes || 60} className="h-8 text-sm w-24"
            onChange={e => set("every_minutes", parseInt(e.target.value))} />
          <span className="text-sm text-muted-foreground">minutes</span>
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Restart clock after</Label>
          <select className="mt-1.5 h-8 text-sm border border-border/50 rounded-lg px-2 bg-background w-full"
            value={config.after_last || "fire"}
            onChange={e => set("after_last", e.target.value)}>
            <option value="fire">Last fire</option>
            <option value="check_in">Last check-in</option>
          </select>
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Active window (optional)</Label>
          <div className="flex items-center gap-2 mt-1.5">
            <Input type="time" value={config.active_window?.start || ""} className="h-8 text-sm w-32"
              onChange={e => set("active_window", { ...config.active_window, start: e.target.value })} />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="time" value={config.active_window?.end || ""} className="h-8 text-sm w-32"
              onChange={e => set("active_window", { ...config.active_window, end: e.target.value })} />
          </div>
        </div>
      </div>
    );
  }

  if (triggerType === "contextual") {
    const on = config.on || "no_front_update";
    return (
      <div className="space-y-3">
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Trigger when</Label>
          <select className="mt-1.5 h-8 text-sm border border-border/50 rounded-lg px-2 bg-background w-full"
            value={on} onChange={e => set("on", e.target.value)}>
            {CONTEXTUAL_ON.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {on === "no_front_update" && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-28">No update for</Label>
            <Input type="number" min={10} value={config.threshold_minutes || 120} className="h-8 text-sm w-24"
              onChange={e => set("threshold_minutes", parseInt(e.target.value))} />
            <span className="text-xs text-muted-foreground">minutes</span>
          </div>
        )}
        {on === "emotion_logged" && (
          <>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Match emotions (any = always fire)</Label>
                <button type="button" className="text-xs text-primary hover:underline"
                  onClick={() => set("matches", DISTRESS_EMOTIONS)}>
                  Distress presets
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allEmotions.map(e => (
                  <button key={e} type="button"
                    onClick={() => {
                      const arr = config.matches || [];
                      set("matches", arr.includes(e) ? arr.filter(x => x !== e) : [...arr, e]);
                    }}
                    className={`px-2 py-1 rounded-lg text-xs border transition-all ${
                      (config.matches || []).includes(e) ? "bg-primary text-white border-primary" : "bg-muted/30 text-muted-foreground border-border/40"
                    }`}>{e}</button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">Fires when a check-in is logged that includes any selected emotion.</p>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground w-28">Fire after</Label>
              <Input type="number" min={0} value={config.delay_minutes || 0} className="h-8 text-sm w-20"
                onChange={e => set("delay_minutes", parseInt(e.target.value))} />
              <span className="text-xs text-muted-foreground">min delay</span>
            </div>
          </>
        )}
        {on === "alter_fronts" && (
          <>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Which {terms.alter}</Label>
              <SearchableSelect
                className="mt-1.5"
                value={config.alter_id || null}
                onChange={id => set("alter_id", id)}
                options={alters.filter(a => !a.is_archived).map(a => ({
                  id: a.id,
                  label: a.name,
                  sublabel: a.alias || a.pronouns,
                  avatar_url: a.avatar_url,
                  color: a.color,
                }))}
                placeholder={`Any ${terms.alter}`}
                allowClear
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground w-28">Fire after</Label>
              <Input type="number" min={0} value={config.delay_minutes || 0} className="h-8 text-sm w-20"
                onChange={e => set("delay_minutes", parseInt(e.target.value))} />
              <span className="text-xs text-muted-foreground">min delay</span>
            </div>
          </>
        )}
        {on === "symptom_logged" && (
          <>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5">Which symptoms (any match fires)</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {symptoms.map(s => (
                  <button key={s.id} type="button"
                    onClick={() => {
                      const arr = config.symptom_ids || [];
                      set("symptom_ids", arr.includes(s.id) ? arr.filter(x => x !== s.id) : [...arr, s.id]);
                    }}
                    className={`px-2 py-1 rounded-lg text-xs border transition-all ${
                      (config.symptom_ids || []).includes(s.id) ? "bg-primary text-white border-primary" : "bg-muted/30 text-muted-foreground border-border/40"
                    }`}>{s.label}</button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">Fires when you log a check-in for any selected symptom.</p>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground w-28">Fire after</Label>
              <Input type="number" min={0} value={config.delay_minutes || 0} className="h-8 text-sm w-20"
                onChange={e => set("delay_minutes", parseInt(e.target.value))} />
              <span className="text-xs text-muted-foreground">min delay</span>
            </div>
          </>
        )}
        {on === "sleep_ended" && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-28">Fire after</Label>
            <Input type="number" min={0} value={config.delay_minutes || 0} className="h-8 text-sm w-20"
              onChange={e => set("delay_minutes", parseInt(e.target.value))} />
            <span className="text-xs text-muted-foreground">min after wake</span>
          </div>
        )}
      </div>
    );
  }

  if (triggerType === "event") {
    return (
      <div className="space-y-3">
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Event date/time</Label>
          <Input type="datetime-local" value={config.when ? config.when.slice(0, 16) : ""} className="h-8 text-sm mt-1.5"
            onChange={e => set("when", new Date(e.target.value).toISOString())} />
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground">Pre-alerts</Label>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {PRE_ALERT_OPTIONS.map(opt => {
              const label = opt === 15 ? "15 min" : opt === 60 ? "1 hour" : "1 day";
              const selected = (config.pre_alerts || []).includes(opt);
              return (
                <button key={opt} type="button"
                  onClick={() => {
                    const arr = config.pre_alerts || [];
                    set("pre_alerts", selected ? arr.filter(x => x !== opt) : [...arr, opt]);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    selected ? "bg-primary text-white border-primary" : "bg-muted/30 text-muted-foreground border-border/40"
                  }`}>{label}</button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function ReminderEditorModal({ isOpen, onClose, existing, onSaved }) {
  const terms = useTerms();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [hasAutoResolve, setHasAutoResolve] = useState(false);

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => base44.entities.Symptom.list(),
  });
  const { data: customEmotions = [] } = useQuery({
    queryKey: ["customEmotions"],
    queryFn: () => base44.entities.CustomEmotion.list(),
  });
  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => base44.entities.ActivityCategory.list(),
  });

  useEffect(() => {
    if (existing) {
      setForm({ ...DEFAULT_FORM, ...existing });
      setHasAutoResolve(!!existing.auto_resolve_rule);
    } else {
      setForm(DEFAULT_FORM);
      setHasAutoResolve(false);
    }
  }, [existing, isOpen]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handlePushRequest = async () => {
    try {
      await registerPush();
      toast.success("Push notifications enabled!");
    } catch (err) {
      toast.error(err.message || "Could not enable push notifications.");
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.delivery_channels.length) { toast.error("Choose at least one delivery channel"); return; }
    setSaving(true);
    const data = {
      ...form,
      alter_id: form.alter_id || null,
      alter_scope: form.alter_id ? (form.alter_scope || "always") : null,
      alter_scope_catchup: form.alter_id && form.alter_scope === "when_fronting" ? (form.alter_scope_catchup || false) : false,
      auto_resolve_rule: hasAutoResolve ? form.auto_resolve_rule : null,
    };
    if (existing?.id) {
      await base44.entities.Reminder.update(existing.id, data);
    } else {
      await base44.entities.Reminder.create(data);
    }
    setSaving(false);
    onSaved?.();
    onClose();
  };

  const toggleChannel = (ch) => {
    const arr = form.delivery_channels || [];
    set("delivery_channels", arr.includes(ch) ? arr.filter(x => x !== ch) : [...arr, ch]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Reminder" : "New Reminder"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pb-2">
          {/* Title */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Title *</Label>
            <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Morning meds" className="mt-1.5" />
          </div>

          {/* Body */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Body (optional)</Label>
            <Textarea value={form.body || ""} onChange={e => set("body", e.target.value)} placeholder="Additional detail..." className="mt-1.5 min-h-[60px]" />
          </div>

          {/* Category */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Category</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {CATEGORIES.map(c => (
                <button key={c} type="button" onClick={() => set("category", c)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    form.category === c ? "bg-primary text-white border-primary" : "bg-muted/30 text-muted-foreground border-border/40"
                  }`}>
                  <span>{CATEGORY_ICONS[c]}</span>
                  <span className="capitalize">{c.replace("_", " ")}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Trigger type */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Trigger type</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {TRIGGER_TYPES.map(t => (
                <button key={t} type="button" onClick={() => {
                  set("trigger_type", t);
                  const defaults = {
                    scheduled: { times: ["09:00"], days: [0,1,2,3,4,5,6] },
                    interval: { every_minutes: 60, after_last: "fire" },
                    contextual: { on: "no_front_update", threshold_minutes: 120 },
                    event: { when: null, pre_alerts: [] },
                  };
                  set("trigger_config", defaults[t]);
                }}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all capitalize ${
                    form.trigger_type === t ? "bg-primary text-white border-primary" : "bg-muted/30 text-muted-foreground border-border/40"
                  }`}>{t}</button>
              ))}
            </div>
            <div className="mt-3 p-3 bg-muted/20 rounded-xl border border-border/30">
              <TriggerConfig
                triggerType={form.trigger_type}
                config={form.trigger_config || {}}
                onChange={cfg => set("trigger_config", cfg)}
                alters={alters}
                symptoms={symptoms.filter(s => !s.is_archived)}
                customEmotions={customEmotions}
              />
            </div>
          </div>

          {/* Delivery channels */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Delivery channels</Label>
            <div className="flex gap-4 mt-2">
              {[{ id: "in_app", label: "In-app banner" }, { id: "push", label: "Browser push" }].map(ch => (
                <label key={ch.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={(form.delivery_channels || []).includes(ch.id)}
                    onChange={() => toggleChannel(ch.id)} className="rounded" />
                  <span className="text-sm">{ch.label}</span>
                </label>
              ))}
            </div>
            {(form.delivery_channels || []).includes("push") && typeof Notification !== "undefined" && Notification.permission !== "granted" && (
              <button type="button" onClick={handlePushRequest}
                className="mt-2 text-xs text-primary underline hover:text-primary/80">
                Enable browser notifications →
              </button>
            )}
          </div>

          {/* Quiet hours */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Respect quiet hours</p>
              <p className="text-xs text-muted-foreground">Won't fire during your quiet window (configured in Settings → Reminders)</p>
            </div>
            <Switch checked={!!form.quiet_hours_respect} onCheckedChange={v => set("quiet_hours_respect", v)} />
          </div>

          {/* Alter scope */}
          {(() => {
            const scopedAlter = alters.find(a => a.id === form.alter_id);
            const scopeSummary = !form.alter_id
              ? `For the whole ${terms.system}`
              : form.alter_scope === "when_fronting"
                ? `For ${scopedAlter?.name || "…"}, only when ${terms.fronting}`
                : `For ${scopedAlter?.name || "…"}, always active`;
            return (
              <Collapsible label={`${terms.Alter} scope`} summary={scopeSummary}>
                <AlterScopeSection form={form} set={set} alters={alters} />
              </Collapsible>
            );
          })()}

          {/* Inline actions */}
          <Collapsible label="Quick action buttons">
            <div className="space-y-2">
              {(form.inline_actions || []).map((action, i) => {
                const updateAction = (fields) => {
                  const updated = (form.inline_actions || []).map((a, j) => j === i ? { ...a, ...fields } : a);
                  set("inline_actions", updated);
                };
                const removeAction = () => set("inline_actions", (form.inline_actions || []).filter((_, j) => j !== i));

                return (
                  <div key={i} className="space-y-1.5 p-3 bg-muted/20 rounded-xl border border-border/30">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Button label, e.g. Try grounding"
                        value={action.label || ""}
                        className="h-7 text-xs flex-1"
                        onChange={e => updateAction({ label: e.target.value })}
                      />
                      <button type="button" onClick={removeAction} className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <select
                      className="h-7 text-xs border border-border/50 rounded-lg px-2 bg-background w-full"
                      value={action.action_type || "open_check_in"}
                      onChange={e => updateAction({ action_type: e.target.value, payload: {} })}
                    >
                      {ACTION_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {action.action_type === "log_symptom" && (
                      <SearchableSelect
                        value={action.payload?.symptom_id || null}
                        onChange={id => updateAction({ payload: { symptom_id: id } })}
                        options={symptoms.filter(s => !s.is_archived).map(s => ({
                          id: s.id,
                          label: s.label,
                          color: s.color,
                        }))}
                        placeholder="— pick symptom —"
                        allowClear
                      />
                    )}
                    {action.action_type === "open_route" && (
                      <Input
                        placeholder="/path (e.g. /analytics)"
                        value={action.payload?.path || ""}
                        className="h-7 text-xs"
                        onChange={e => updateAction({ payload: { path: e.target.value } })}
                      />
                    )}
                  </div>
                );
              })}

              {(form.inline_actions || []).length < 3 && (
                <button
                  type="button"
                  onClick={() => set("inline_actions", [...(form.inline_actions || []), { label: "", action_type: "open_check_in", payload: {} }])}
                  className="w-full flex items-center justify-center gap-1.5 h-8 text-xs border border-dashed border-border/50 rounded-xl text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add action
                </button>
              )}
              {(form.inline_actions || []).length >= 3 && (
                <p className="text-xs text-muted-foreground text-center">Maximum 3 actions reached</p>
              )}
            </div>
          </Collapsible>

          {/* Auto-resolve */}
          <Collapsible
            label="Auto-resolve"
            summary={!hasAutoResolve ? "Off" : (() => {
              const r = form.auto_resolve_rule;
              if (!r) return "Off";
              if (r.on === "check_in") return "Resolves when any check-in is logged";
              if (r.on === "front_update") return "Resolves when front is updated";
              if (r.on === "symptom_checkin") return "Resolves when symptom is logged";
              if (r.on === "activity") return "Resolves when activity is logged";
              return "Enabled";
            })()}
          >
            <p className="text-xs text-muted-foreground">If this rule is satisfied before the reminder fires, it won't fire that cycle. Useful for reminders you might complete before the scheduled time — like a meds reminder that auto-clears if you log meds earlier.</p>
            <div className="flex items-center justify-between">
              <span className="text-sm">Enable auto-resolve</span>
              <Switch checked={hasAutoResolve} onCheckedChange={v => {
                setHasAutoResolve(v);
                if (!v) set("auto_resolve_rule", null);
                else set("auto_resolve_rule", { on: "check_in", lookback_minutes: 120 });
              }} />
            </div>
            {hasAutoResolve && (() => {
              const rule = form.auto_resolve_rule || { on: "check_in", lookback_minutes: 120 };
              const setRule = (fields) => set("auto_resolve_rule", { ...rule, ...fields });
              const defaultLookback = { check_in: 120, front_update: 240, symptom_checkin: 60, activity: 60 };
              return (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Resolve when…</Label>
                    <select className="mt-1 h-8 text-sm border border-border/50 rounded-lg px-2 bg-background w-full"
                      value={rule.on || "check_in"}
                      onChange={e => setRule({ on: e.target.value, lookback_minutes: defaultLookback[e.target.value] || 60, symptom_id: undefined, category_id: undefined })}>
                      {AUTO_RESOLVE_ON.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {rule.on === "symptom_checkin" && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Which symptom</Label>
                      <SearchableSelect
                        className="mt-1"
                        value={rule.symptom_id || null}
                        onChange={id => setRule({ symptom_id: id })}
                        options={symptoms.filter(s => !s.is_archived).map(s => ({
                          id: s.id,
                          label: s.label,
                          color: s.color,
                        }))}
                        placeholder="— any symptom —"
                        allowClear
                      />
                    </div>
                  )}
                  {rule.on === "activity" && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Which activity category</Label>
                      <SearchableSelect
                        className="mt-1"
                        value={rule.category_id || null}
                        onChange={id => setRule({ category_id: id })}
                        options={activityCategories.map(c => ({
                          id: c.id,
                          label: c.name,
                          color: c.color,
                        }))}
                        placeholder="— any category —"
                        allowClear
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground w-36">Lookback window</Label>
                    <Input type="number" min={5} value={rule.lookback_minutes || 60} className="h-8 text-sm w-24"
                      onChange={e => setRule({ lookback_minutes: parseInt(e.target.value) })} />
                    <span className="text-xs text-muted-foreground">minutes before fire</span>
                  </div>
                </div>
              );
            })()}
          </Collapsible>

          {/* Snooze options */}
          <Collapsible label="Snooze options">
            <p className="text-xs text-muted-foreground mb-3">These are the snooze durations shown when you tap Snooze on this reminder's notification.</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {(form.snooze_options || DEFAULT_SNOOZE_OPTIONS).map((opt, i) => (
                <span key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/40 border border-border/40 text-xs">
                  {formatSnoozeLabel(opt)}
                  <button type="button" onClick={() => set("snooze_options", (form.snooze_options || DEFAULT_SNOOZE_OPTIONS).filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <SnoozeAdder current={form.snooze_options || DEFAULT_SNOOZE_OPTIONS} onAdd={(opt) => set("snooze_options", [...(form.snooze_options || DEFAULT_SNOOZE_OPTIONS), opt])} />
            <button type="button" onClick={() => set("snooze_options", DEFAULT_SNOOZE_OPTIONS)}
              className="mt-2 text-xs text-muted-foreground hover:text-primary underline">
              Reset to defaults
            </button>
          </Collapsible>

          {/* Save */}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="button" className="flex-1" onClick={handleSave} loading={saving} disabled={saving}>
              {existing ? "Save Changes" : "Create Reminder"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}