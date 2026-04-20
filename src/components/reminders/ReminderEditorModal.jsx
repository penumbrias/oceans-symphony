import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, X, ChevronDown, ChevronRight } from "lucide-react";
import { CATEGORY_ICONS } from "./reminderHelpers";
import { registerPush, isPushEnabled } from "@/lib/pushRegistration";
import { toast } from "sonner";

const CATEGORIES = ["check_in", "habit", "meds", "grounding", "appointment", "custom"];
const TRIGGER_TYPES = ["scheduled", "interval", "contextual", "event"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const CONTEXTUAL_ON = [
  { value: "no_front_update", label: "Front not updated" },
  { value: "emotion_logged", label: "Emotion logged" },
  { value: "sleep_ended", label: "After sleep ends" },
];
const AUTO_RESOLVE_ON = [
  { value: "check_in", label: "Check-in saved" },
  { value: "symptom_checkin", label: "Symptom logged" },
  { value: "activity", label: "Activity logged" },
  { value: "front_update", label: "Front updated" },
];
const DISTRESS_EMOTIONS = ["anxious", "overwhelmed", "dissociated", "sad", "angry", "scared", "numb", "depressed"];
const PRE_ALERT_OPTIONS = [15, 60, 1440];

const DEFAULT_FORM = {
  title: "",
  body: "",
  category: "custom",
  trigger_type: "scheduled",
  trigger_config: { times: ["09:00"], days: [0,1,2,3,4,5,6] },
  delivery_channels: ["in_app"],
  alter_id: "",
  alter_scope: "always",
  inline_actions: [],
  auto_resolve_rule: null,
  quiet_hours_respect: true,
  snooze_options: [10, 60, 240, "tomorrow"],
  is_active: true,
};

function Collapsible({ label, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/40 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors text-left text-sm font-medium">
        {label}
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 py-3 space-y-3 border-t border-border/30">{children}</div>}
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

function TriggerConfig({ triggerType, config, onChange }) {
  const set = (key, val) => onChange({ ...config, [key]: val });

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
              <Label className="text-xs font-medium text-muted-foreground">Match emotions (any = always)</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {DISTRESS_EMOTIONS.map(e => (
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
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [hasAlterScope, setHasAlterScope] = useState(false);
  const [hasAutoResolve, setHasAutoResolve] = useState(false);
  const [newAction, setNewAction] = useState(null);

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  useEffect(() => {
    if (existing) {
      setForm({ ...DEFAULT_FORM, ...existing });
      setHasAlterScope(!!existing.alter_id);
      setHasAutoResolve(!!existing.auto_resolve_rule);
    } else {
      setForm(DEFAULT_FORM);
      setHasAlterScope(false);
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
      alter_id: hasAlterScope ? form.alter_id : null,
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
              <p className="text-xs text-muted-foreground">Won't fire during your quiet window</p>
            </div>
            <Switch checked={!!form.quiet_hours_respect} onCheckedChange={v => set("quiet_hours_respect", v)} />
          </div>

          {/* Alter scope */}
          <Collapsible label="Tie to a specific alter">
            <div className="flex items-center justify-between">
              <span className="text-sm">Enable alter scope</span>
              <Switch checked={hasAlterScope} onCheckedChange={setHasAlterScope} />
            </div>
            {hasAlterScope && (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground">Alter</Label>
                  <select className="mt-1 h-8 text-sm border border-border/50 rounded-lg px-2 bg-background w-full"
                    value={form.alter_id || ""} onChange={e => set("alter_id", e.target.value)}>
                    <option value="">— select alter —</option>
                    {alters.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">When to fire</Label>
                  <select className="mt-1 h-8 text-sm border border-border/50 rounded-lg px-2 bg-background w-full"
                    value={form.alter_scope || "always"} onChange={e => set("alter_scope", e.target.value)}>
                    <option value="always">Always</option>
                    <option value="when_fronting">Only when fronting</option>
                  </select>
                </div>
              </>
            )}
          </Collapsible>

          {/* Inline actions */}
          <Collapsible label="Quick action buttons">
            <div className="space-y-2">
              {(form.inline_actions || []).map((action, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-muted/20 rounded-lg text-xs">
                  <span className="flex-1 truncate">{action.label} → {action.action_type}</span>
                  <button type="button" onClick={() => set("inline_actions", (form.inline_actions || []).filter((_, j) => j !== i))}>
                    <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
              {(form.inline_actions || []).length < 3 && (
                <div className="space-y-2 p-3 bg-muted/10 rounded-lg border border-dashed border-border/40">
                  <Input placeholder="Button label" value={newAction?.label || ""} className="h-7 text-xs"
                    onChange={e => setNewAction(a => ({ ...a, label: e.target.value }))} />
                  <select className="h-7 text-xs border border-border/50 rounded-lg px-2 bg-background w-full"
                    value={newAction?.action_type || "dismiss"}
                    onChange={e => setNewAction(a => ({ ...a, action_type: e.target.value }))}>
                    <option value="open_route">Open route</option>
                    <option value="log_symptom">Log symptom</option>
                    <option value="open_check_in">Open check-in</option>
                    <option value="open_grounding">Open grounding</option>
                    <option value="dismiss">Dismiss</option>
                  </select>
                  {newAction?.action_type === "open_route" && (
                    <Input placeholder="/path" value={newAction?.payload?.path || ""} className="h-7 text-xs"
                      onChange={e => setNewAction(a => ({ ...a, payload: { path: e.target.value } }))} />
                  )}
                  <Button size="sm" type="button" className="w-full h-7 text-xs" onClick={() => {
                    if (!newAction?.label) return;
                    set("inline_actions", [...(form.inline_actions || []), { label: newAction.label, action_type: newAction.action_type || "dismiss", payload: newAction.payload || {} }]);
                    setNewAction(null);
                  }}>Add action</Button>
                </div>
              )}
            </div>
          </Collapsible>

          {/* Auto-resolve */}
          <Collapsible label="Auto-resolve rule">
            <div className="flex items-center justify-between">
              <span className="text-sm">Enable auto-resolve</span>
              <Switch checked={hasAutoResolve} onCheckedChange={setHasAutoResolve} />
            </div>
            {hasAutoResolve && (
              <div>
                <Label className="text-xs text-muted-foreground">Resolve when</Label>
                <select className="mt-1 h-8 text-sm border border-border/50 rounded-lg px-2 bg-background w-full"
                  value={form.auto_resolve_rule?.on || "check_in"}
                  onChange={e => set("auto_resolve_rule", { on: e.target.value })}>
                  {AUTO_RESOLVE_ON.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
          </Collapsible>

          {/* Snooze options */}
          <Collapsible label="Snooze options">
            <p className="text-xs text-muted-foreground">Current: {(form.snooze_options || []).map(o => o === "tomorrow" ? "Tomorrow" : `${o}m`).join(", ")}</p>
          </Collapsible>

          {/* Save */}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="button" className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : existing ? "Save Changes" : "Create Reminder"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}