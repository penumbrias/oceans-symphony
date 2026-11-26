// A fired reminder as one slim pixel strip (pixel look only): icon, title,
// Done, Snooze, ⋯ and ×. Everything the full card offered is still here —
// the reminder's own actions and its note sit in the ⋯ menu — it just
// takes one line instead of a card. Used by the floating ReminderToast and
// the home screen's notice stack. Styles: src/styles/pixel/reminders.css.
import React from "react";
import { ChevronDown, MoreHorizontal, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORY_ICONS } from "./reminderHelpers";
import { formatSnoozeLabel } from "./snoozeHelpers";

const DEFAULT_SNOOZE = [10, 60, 240, "tomorrow"];

export default function PixelReminderStrip({
  reminder, floating = false, onAction, onDone, onSnooze, onDismiss,
  moreCount = 0, onOpenMore, menuZ = 210,
}) {
  const icon = CATEGORY_ICONS[reminder.category] || CATEGORY_ICONS.custom;
  const actions = reminder.inline_actions || [];
  const snoozeOptions = reminder.snooze_options || DEFAULT_SNOOZE;
  const first = actions[0];
  const rest = actions.slice(1);
  return (
    <div className={`px-rstrip${floating ? " px-rstrip-float" : ""}`} data-overlay-notification={floating ? "" : undefined}>
      <span className="px-rstrip-ico" aria-hidden="true">{icon}</span>
      <span className="px-rstrip-title" title={reminder.body || reminder.title}>
        {reminder.title}
        {moreCount > 0 && <span className="px-rstrip-more"> +{moreCount}</span>}
      </span>
      {first && (
        <button type="button" className="px-rstrip-btn px-rstrip-hide-sm" onClick={() => onAction(first)}>{first.label}</button>
      )}
      <button type="button" className="px-rstrip-btn px-rstrip-done" onClick={onDone}>Done</button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="px-rstrip-btn" aria-label="Snooze">
            <span className="px-rstrip-hide-sm">Snooze</span>
            <ChevronDown className="w-3 h-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" style={{ zIndex: menuZ }}>
          {snoozeOptions.map((opt, i) => (
            <DropdownMenuItem key={i} onClick={() => onSnooze(opt)}>{formatSnoozeLabel(opt)}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {(actions.length > 0 || reminder.body || moreCount > 0) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="px-rstrip-icon" aria-label="More reminder actions">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-[16rem]" style={{ zIndex: menuZ }}>
            {reminder.body && (
              <>
                <DropdownMenuLabel className="font-normal text-xs whitespace-normal">{reminder.body}</DropdownMenuLabel>
                {(actions.length > 0 || moreCount > 0) && <DropdownMenuSeparator />}
              </>
            )}
            {first && <DropdownMenuItem className="sm:hidden" onClick={() => onAction(first)}>{first.label}</DropdownMenuItem>}
            {rest.map((action, i) => (
              <DropdownMenuItem key={i} onClick={() => onAction(action)}>{action.label}</DropdownMenuItem>
            ))}
            {moreCount > 0 && onOpenMore && (
              <DropdownMenuItem onClick={onOpenMore}>{moreCount} more waiting · open Reminders</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <button type="button" className="px-rstrip-icon" aria-label="Dismiss reminder" onClick={onDismiss}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
