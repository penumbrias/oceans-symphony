import { formatDistanceToNow, format } from "date-fns";
import { useTerms } from "@/lib/useTerms";
import { Clock, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CATEGORY_ICONS } from "./reminderHelpers";
import { formatSnoozeLabel, DEFAULT_SNOOZE_OPTIONS } from "./snoozeHelpers";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clockPattern } from "@/lib/timeFormat";
import { useUiLook, UI_LOOKS } from "@/lib/uiLook";
import { useAlterLabel } from "@/lib/useAlterLabel";

const CATEGORY_DEFAULT_ACTIONS = {
  check_in: { label: "Check In", action_type: "open_check_in" },
  grounding: { label: "Open Grounding", action_type: "open_grounding" },
};

const STATUS_LABELS = {
  acted: "Done",
  dismissed: "Dismissed",
  auto_resolved: "Auto-resolved",
  snoozed: "Snoozed",
};

function AlterAvatar({ alter, categoryIcon }) {
  const resolvedUrl = useResolvedAvatarUrl(alter?.avatar_url);
  const [imgErrorFor, setImgError] = useState(null);
  const imgError = !!imgErrorFor && imgErrorFor === resolvedUrl;
  if (!alter) {
    return (
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-base">{categoryIcon}</span>
      </div>
    );
  }
  const borderColor = alter.color || "#3B82F6";
  return (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 border-2 overflow-hidden"
      style={{ borderColor }}
    >
      {resolvedUrl && !imgError ? (
        <img src={resolvedUrl} alt={alter.name} className="w-full h-full object-cover" onError={() => setImgError(resolvedUrl)} />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center text-white text-sm font-bold"
          style={{ backgroundColor: borderColor }}
        >
          {alter.name?.[0]?.toUpperCase() || "?"}
        </div>
      )}
    </div>
  );
}

export default function ReminderInstanceCard(props) {
  const pixel = useUiLook() === UI_LOOKS.PIXEL;
  return pixel ? <PixelInstanceRow {...props} /> : <SmoothInstanceCard {...props} />;
}

function effectiveActionsFor(reminder) {
  return (reminder.inline_actions || []).length > 0
    ? reminder.inline_actions
    : CATEGORY_DEFAULT_ACTIONS[reminder.category]
      ? [CATEGORY_DEFAULT_ACTIONS[reminder.category]]
      : [];
}

// The pixel look's row for one fired reminder — the "Due now" rows of the
// Reminders phone board: a colour mark, the title, when it fired, the
// message, then a row of square buttons (its own actions first, the first
// one lit; Done, Snooze, Dismiss). Same handlers as the smooth card.
function PixelInstanceRow({ instance, reminder, alter, onAction, onSnooze, onDone, onDismiss, onUnsnooze, readOnly = false }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  if (!reminder) return null;
  const displayTime = instance.fired_at || instance.scheduled_for;
  const snoozeOptions = reminder.snooze_options?.length ? reminder.snooze_options : DEFAULT_SNOOZE_OPTIONS;
  const isSnoozed = instance.status === "snoozed";
  const actions = effectiveActionsFor(reminder);
  const when = isSnoozed && instance.snoozed_until
    ? `until ${format(new Date(instance.snoozed_until), clockPattern("h:mm a"))}`
    : displayTime
      ? `${format(new Date(displayTime), clockPattern("h:mm a"))}, ${formatDistanceToNow(new Date(displayTime), { addSuffix: true })}`
      : "";
  return (
    <div className={readOnly ? "prm-due prm-due-done" : "prm-due"}>
      <div className="prm-due-top">
        <span className="prm-sq" style={{ background: alter?.color || "var(--color-primary)" }} aria-hidden="true" />
        <b className="prm-due-title">{reminder.title}</b>
        <span className="prm-due-when">{readOnly || isSnoozed ? `${STATUS_LABELS[instance.status] || instance.status}${isSnoozed && when ? ` ${when}` : ""}` : when}</span>
      </div>
      {alter && (
        <div className="prm-due-for" style={{ color: alter.color || undefined }}>
          For {formatAlter(alter)}{reminder.alter_scope === "when_fronting" ? ` · when ${terms.fronting}` : ""}
        </div>
      )}
      {reminder.body && <div className="prm-due-body">{reminder.body}</div>}
      {!readOnly && isSnoozed && (
        <div className="prm-due-acts">
          <button type="button" className="prm-btn on" onClick={onUnsnooze}>Unsnooze now</button>
          <button type="button" className="prm-btn" onClick={onDismiss}>Dismiss</button>
        </div>
      )}
      {!readOnly && !isSnoozed && (
        <div className="prm-due-acts">
          {actions.map((action, idx) => (
            <button key={idx} type="button" className={idx === 0 ? "prm-btn on" : "prm-btn"} onClick={() => onAction(action)}>{action.label}</button>
          ))}
          <button type="button" className={actions.length ? "prm-btn" : "prm-btn on"} onClick={onDone}>Done</button>
          <span className="prm-split">
            <button type="button" className="prm-btn" onClick={() => onSnooze(snoozeOptions[0])}>Snooze {formatSnoozeLabel(snoozeOptions[0])}</button>
            {snoozeOptions.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="prm-btn prm-btn-sq" aria-label="More snooze times"><ChevronDown className="w-3.5 h-3.5" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {snoozeOptions.map((opt, idx) => (
                    <DropdownMenuItem key={idx} onClick={() => onSnooze(opt)}>{formatSnoozeLabel(opt)}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </span>
          <button type="button" className="prm-btn" onClick={onDismiss}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

function SmoothInstanceCard({ instance, reminder, alter, onAction, onSnooze, onDone, onDismiss, onUnsnooze, readOnly = false }) {
  const terms = useTerms();
  if (!reminder) return null;

  const displayTime = instance.fired_at || instance.scheduled_for;
  const snoozeOptions = reminder.snooze_options?.length ? reminder.snooze_options : DEFAULT_SNOOZE_OPTIONS;
  const isSnoozed = instance.status === "snoozed";

  const Icon = CATEGORY_ICONS[reminder.category] || CATEGORY_ICONS.custom;

  const effectiveActions = (reminder.inline_actions || []).length > 0
    ? reminder.inline_actions
    : CATEGORY_DEFAULT_ACTIONS[reminder.category]
      ? [CATEGORY_DEFAULT_ACTIONS[reminder.category]]
      : [];

  return (
    <div className={`bg-card border border-border/50 rounded-xl p-4 space-y-3 transition-all ${readOnly ? "opacity-60" : ""} ${isSnoozed ? "border-amber-200/60 dark:border-amber-800/40" : ""}`}>
      <div className="flex items-start gap-3">
        <AlterAvatar alter={alter} categoryIcon={Icon} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm text-foreground leading-tight">{reminder.title}</p>
            {(readOnly || isSnoozed) && (
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${isSnoozed ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" : "text-muted-foreground bg-muted/50"}`}>
                {STATUS_LABELS[instance.status] || instance.status}
              </span>
            )}
          </div>
          {alter && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: (alter.color || "#3B82F6") + "22",
                  color: alter.color || "#3B82F6",
                  border: `1px solid ${(alter.color || "#3B82F6")}44`,
                }}
              >
                For {alter.name}
              </span>
              {reminder.alter_scope === "when_fronting" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border/40">
                  · when {terms.fronting}
                </span>
              )}
            </div>
          )}
          {reminder.body && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{reminder.body}</p>
          )}
          {isSnoozed && instance.snoozed_until && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Snoozed until {format(new Date(instance.snoozed_until), clockPattern("MMM d, h:mm a"))}
            </p>
          )}
          {!isSnoozed && displayTime && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(displayTime), { addSuffix: true })}
            </p>
          )}
        </div>
      </div>

      {isSnoozed && !readOnly && (
        <div className="flex items-center gap-2 pt-1 border-t border-border/30">
          <Button size="sm" variant="outline" className="text-xs h-7 px-3" onClick={onUnsnooze}>
            Unsnooze now
          </Button>
          <Button size="sm" variant="ghost" className="text-xs h-7 px-3 text-muted-foreground" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      )}

      {!readOnly && !isSnoozed && (
        <>
          {effectiveActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {effectiveActions.map((action, idx) => (
                <Button key={idx} size="sm" variant="outline" className="text-xs h-7 px-3" onClick={() => onAction(action)}>
                  {action.label}
                </Button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1 border-t border-border/30">
            <Button size="sm" className="text-xs h-7 px-3" onClick={onDone}>Done</Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="text-xs h-7 px-3 gap-1">
                  Snooze <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {snoozeOptions.map((opt, idx) => (
                  <DropdownMenuItem key={idx} onClick={() => onSnooze(opt)}>
                    {formatSnoozeLabel(opt)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button size="sm" variant="ghost" className="text-xs h-7 px-3 text-muted-foreground hover:text-foreground" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </>
      )}
    </div>
  );
}