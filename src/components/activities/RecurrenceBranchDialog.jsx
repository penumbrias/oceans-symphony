import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Repeat } from "lucide-react";
import { RECURRENCE_BRANCHES } from "@/lib/recurrenceUtils";

// Tiny chooser modal asked BEFORE the real edit/delete/lifecycle action
// is taken on a recurring plan. Three branches:
//   - This instance only
//   - This and future
//   - All instances
//
// Render this BEFORE opening the editor — never stacked on top of the
// Plan modal — so the user picks a branch first, then the heavier modal
// loads with the right scope already settled.

export default function RecurrenceBranchDialog({
  isOpen,
  onClose,
  onChoose,
  // Optional override of the verb shown in the title — defaults to
  // "edit" but the lifecycle popover passes "mark", "delete", etc.
  actionLabel = "edit",
  // Optional descriptive subtitle (e.g. activity name).
  subject = null,
}) {
  if (!isOpen) return null;

  const choose = (branch) => {
    onChoose?.(branch);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-primary" />
            <span>Recurring plan</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            How much of this series should the {actionLabel} affect
            {subject ? <> for <span className="font-medium text-foreground">{subject}</span></> : null}?
          </p>

          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start text-left h-auto py-2.5"
              onClick={() => choose(RECURRENCE_BRANCHES.THIS_ONLY)}
            >
              <div>
                <div className="text-sm font-semibold">This instance only</div>
                <div className="text-xs text-muted-foreground font-normal">
                  Splits this one off from the series. Other occurrences stay as scheduled.
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-left h-auto py-2.5"
              onClick={() => choose(RECURRENCE_BRANCHES.THIS_AND_FUTURE)}
            >
              <div>
                <div className="text-sm font-semibold">This and all future</div>
                <div className="text-xs text-muted-foreground font-normal">
                  Applies to this occurrence and every later one in the series.
                </div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-left h-auto py-2.5"
              onClick={() => choose(RECURRENCE_BRANCHES.ALL)}
            >
              <div>
                <div className="text-sm font-semibold">All instances</div>
                <div className="text-xs text-muted-foreground font-normal">
                  Applies to every occurrence in the series, past and future.
                </div>
              </div>
            </Button>
          </div>

          <Button variant="ghost" className="w-full" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
