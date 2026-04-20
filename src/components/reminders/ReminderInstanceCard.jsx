import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Clock, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORY_ICONS } from "./reminderHelpers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const DEFAULT_SNOOZE_OPTIONS = [10, 60, 240, "tomorrow"];

const STATUS_LABELS = {
  acted: "Done",
  dismissed: "Dismissed",
  auto_resolved: "Auto-resolved",
};

export default function ReminderInstanceCard({ instance, reminder, onAction, onSnooze, onDone, onDismiss, readOnly = false }) {
  if (!reminder) return null;

  const displayTime = instance.fired_at || instance.scheduled_for;
  const snoozeOptions = reminder.snooze_options || DEFAULT_SNOOZE_OPTIONS;

  const formatSnooze = (opt) => {
    if (opt === "tomorrow") return "Tomorrow morning";
    if (opt < 60) return `${opt} minutes`;
    if (opt === 60) return "1 hour";
    return `${opt / 60} hours`;
  };

  const Icon = CATEGORY_ICONS[reminder.category] || CATEGORY_ICONS.custom;

  return (
    <div className={`bg-card border border-border/50 rounded-xl p-4 space-y-3 transition-all ${readOnly ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-base">{Icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm text-foreground leading-tight">{reminder.title}</p>
            {readOnly && (
              <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full flex-shrink-0">
                {STATUS_LABELS[instance.status] || instance.status}
              </span>
            )}
          </div>
          {reminder.body && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{reminder.body}</p>
          )}
          {displayTime && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(displayTime), { addSuffix: true })}
            </p>
          )}
        </div>
      </div>

      {!readOnly && (
        <>
          {/* Inline action buttons */}
          {(reminder.inline_actions || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {reminder.inline_actions.map((action, idx) => (
                <Button key={idx} size="sm" variant="outline"
                  className="text-xs h-7 px-3"
                  onClick={() => onAction(action)}>
                  {action.label}
                </Button>
              ))}
            </div>
          )}

          {/* Done / Snooze / Dismiss row */}
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
                    {formatSnooze(opt)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button size="sm" variant="ghost"
              className="text-xs h-7 px-3 text-muted-foreground hover:text-foreground"
              onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </>
      )}
    </div>
  );
}