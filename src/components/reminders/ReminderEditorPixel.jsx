import { useState } from "react";
import { format } from "date-fns";
import { ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import NotificationStatusCard from "@/components/shared/NotificationStatusCard";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { clockPattern } from "@/lib/timeFormat";
import { CATEGORY_ICONS } from "./reminderHelpers";
import { formatSnoozeLabel, DEFAULT_SNOOZE_OPTIONS } from "./snoozeHelpers";
import "@/styles/pixel/reminders.css";

// The reminder editor in the pixel look — the "Reminder" phone board
// (ReminderEditorPhone): a title bar with Cancel / Save, label-and-field
// rows, a grid of "when should this fire?" kinds with that kind's settings
// in a sunken box under it, then who it's for, its buttons, how it's
// delivered, and Delete at the foot.
//
// Layout only. The form, the field editors and the save all belong to
// ReminderEditorModal (passed in), so both looks write the same record the
// same way.

const CATEGORY_LABELS = {
  check_in: "Check in", habit: "Habit", meds: "Meds",
  grounding: "Grounding", appointment: "Appointment", custom: "Other",
};

// Each kind is a trigger type, or the contextual trigger's "on".
function kindOf(form) {
  if (form.trigger_type === "contextual") return `ctx:${form.trigger_config?.on || "no_front_update"}`;
  return form.trigger_type;
}

function Row({ label, children, top = false }) {
  return (
    <div className={top ? "prm-erow prm-erow-top" : "prm-erow"}>
      <span className="prm-elabel">{label}</span>
      <div className="prm-efield">{children}</div>
    </div>
  );
}

function Chip({ on = false, children, ...rest }) {
  return (
    <button type="button" aria-pressed={on} className={on ? "prm-chip sel" : "prm-chip"} {...rest}>{children}</button>
  );
}

export default function ReminderEditorPixel({
  form, set, existing, saving, onSave, onClose, onDelete,
  hasAutoResolve, toggleChannel, alters,
  renderTrigger, renderActions, renderAutoResolve, renderSnooze, renderScope, triggerDefaults,
}) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const [open, setOpen] = useState({ scope: false, actions: false, resolve: false, snooze: false });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const kinds = [
    { id: "scheduled", label: "At set times" },
    { id: "interval", label: "Every so often" },
    { id: "ctx:emotion_logged", label: "Feeling logged" },
    { id: "ctx:symptom_logged", label: "Symptom logged" },
    { id: "ctx:alter_fronts", label: `${terms.Alter} ${terms.fronts}` },
    { id: "ctx:sleep_ended", label: "After sleep ends" },
    { id: "ctx:no_front_update", label: "No update for" },
    { id: "event", label: "On a date" },
  ];
  const kind = kindOf(form);
  const pickKind = (id) => {
    if (id === kind) return;
    if (id.startsWith("ctx:")) {
      const on = id.slice(4);
      set("trigger_type", "contextual");
      set("trigger_config", on === "no_front_update" ? { ...triggerDefaults.contextual } : { on });
    } else {
      set("trigger_type", id);
      set("trigger_config", triggerDefaults[id]);
    }
  };

  const scoped = alters.find((a) => a.id === form.alter_id);
  const actions = form.inline_actions || [];
  const snoozeOpts = form.snooze_options || DEFAULT_SNOOZE_OPTIONS;
  const channels = form.delivery_channels || [];
  const rule = form.auto_resolve_rule;
  const resolveLabel = !hasAutoResolve || !rule ? "off"
    : rule.on === "check_in" ? "a check-in is saved"
    : rule.on === "front_update" ? `the ${terms.front} is updated`
    : rule.on === "symptom_checkin" ? "a symptom is logged"
    : rule.on === "activity" ? "an activity is logged" : "on";
  const lastFired = existing?.last_fired_at ? new Date(existing.last_fired_at) : null;

  return (
    <div className="prm-ed">
      <div className="prm-ttl prm-ed-ttl">
        <button type="button" className="prm-btn prm-ed-back" aria-label="Back" onClick={onClose}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="prm-ed-name">{form.title?.trim() || (existing ? "Reminder" : "New reminder")}</span>
        <span className="prm-ttl-acts">
          <button type="button" className="prm-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="prm-btn on" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : existing ? "Save" : "Create"}
          </button>
        </span>
      </div>

      <div className="prm-ed-body">
        <Row label="Title">
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Morning meds" />
        </Row>
        <Row label="Message" top>
          <Textarea value={form.body || ""} onChange={(e) => set("body", e.target.value)} placeholder="What it says when it fires (optional)" className="min-h-[56px]" />
        </Row>
        <Row label="Kind" top>
          {Object.keys(CATEGORY_LABELS).map((c) => (
            <Chip key={c} on={form.category === c} onClick={() => set("category", c)}>
              <span aria-hidden="true">{CATEGORY_ICONS[c]}</span>{CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </Row>

        <div className="prm-sub">When should this fire?</div>
        <div className="prm-kinds" role="group" aria-label="When should this fire?">
          {kinds.map((k) => (
            <Chip key={k.id} on={kind === k.id} onClick={() => pickKind(k.id)}>{k.label}</Chip>
          ))}
        </div>
        <div className="prm-ins">{renderTrigger()}</div>

        <Row label="For" top>
          <Chip on={!form.alter_id} onClick={() => { set("alter_id", null); set("alter_scope", null); set("alter_scope_catchup", false); }}>everyone</Chip>
          {scoped && (
            <Chip on onClick={() => toggle("scope")}>
              <span className="prm-sq" style={{ background: scoped.color || "var(--px-text-2)" }} aria-hidden="true" />
              {formatAlter(scoped)}{form.alter_scope === "when_fronting" ? ` · when ${terms.fronting}` : ""}
            </Chip>
          )}
          <button type="button" className="prm-link" aria-expanded={open.scope} onClick={() => toggle("scope")}>
            {open.scope ? "done" : `or pick ${terms.alters}`}
          </button>
        </Row>
        {open.scope && <div className="prm-ins">{renderScope()}</div>}

        <Row label="Buttons" top>
          {actions.map((a, i) => (
            <Chip key={i} onClick={() => toggle("actions")}>{a.label || "(no label)"}</Chip>
          ))}
          {actions.length < 3 ? (
            <Chip onClick={() => {
              set("inline_actions", [...actions, { label: "", action_type: "open_check_in", payload: {} }]);
              setOpen((o) => ({ ...o, actions: true }));
            }}>+ (max 3)</Chip>
          ) : null}
          {actions.length > 0 && (
            <button type="button" className="prm-link" aria-expanded={open.actions} onClick={() => toggle("actions")}>
              {open.actions ? "done" : "change"}
            </button>
          )}
        </Row>
        {open.actions && <div className="prm-ins">{renderActions()}</div>}

        <Row label="Deliver by" top>
          <Chip on={channels.includes("in_app")} onClick={() => toggleChannel("in_app")}>In the app</Chip>
          <Chip on={channels.includes("push")} onClick={() => toggleChannel("push")}>Notification</Chip>
        </Row>
        {channels.includes("push") && <NotificationStatusCard onlyWhenIssues />}

        <button type="button" className="prm-tickrow" aria-pressed={!!form.quiet_hours_respect}
          onClick={() => set("quiet_hours_respect", !form.quiet_hours_respect)}>
          <span className={form.quiet_hours_respect ? "prm-tick y" : "prm-tick"} aria-hidden="true">{form.quiet_hours_respect ? "x" : ""}</span>
          <span>Respect quiet hours <span className="prm-mut">(set in Settings → Reminders)</span></span>
        </button>

        <Row label="Clears itself" top>
          <Chip on={hasAutoResolve} onClick={() => toggle("resolve")} aria-expanded={open.resolve}>
            {hasAutoResolve ? `when ${resolveLabel}` : "off"}
          </Chip>
          <button type="button" className="prm-link" onClick={() => toggle("resolve")}>{open.resolve ? "done" : "change"}</button>
        </Row>
        {open.resolve && <div className="prm-ins">{renderAutoResolve()}</div>}

        <Row label="Snooze" top>
          {snoozeOpts.map((o, i) => <Chip key={i} onClick={() => toggle("snooze")}>{formatSnoozeLabel(o)}</Chip>)}
          <button type="button" className="prm-link" aria-expanded={open.snooze} onClick={() => toggle("snooze")}>{open.snooze ? "done" : "change"}</button>
        </Row>
        {open.snooze && <div className="prm-ins">{renderSnooze()}</div>}
      </div>

      <div className="prm-ed-foot">
        <span className="prm-mut">
          {lastFired ? `Last fired ${format(lastFired, clockPattern("MMM d, h:mm a"))}` : existing ? "Hasn't fired yet" : "New reminder"}
        </span>
        {existing && onDelete && (
          <button type="button" className="prm-btn prm-danger" onClick={() => onDelete(existing)}>… Delete</button>
        )}
      </div>
    </div>
  );
}
