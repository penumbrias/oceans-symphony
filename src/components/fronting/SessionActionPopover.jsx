import React from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Tiny 2-button popover the user surfaces by double-tapping a
// FrontingSession-bearing UI element (dashboard fronter chips, the
// alter profile's History tab session cards, …). Both buttons route
// to /timeline with `?focusSessionId=<id>` and the Timeline page
// scrolls to that session's day + pulses a 3-second halo. The `edit`
// variant additionally opens the AlterSessionEdit modal pre-filled
// for that session.
//
// Extracted so both surfaces (dashboard chips + history cards) call
// the same code path — keeping them in sync if the destination
// param contract ever changes.
export default function SessionActionPopover({ open, onClose, session, alter, startTime }) {
  const navigate = useNavigate();

  const jumpToSession = () => {
    onClose?.();
    if (!session?.id) return;
    navigate(`/timeline?focusSessionId=${encodeURIComponent(session.id)}`);
  };
  const editSession = () => {
    onClose?.();
    if (!session?.id) return;
    navigate(`/timeline?focusSessionId=${encodeURIComponent(session.id)}&edit=1`);
  };

  const start = startTime || session?.start_time;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-base">
            {alter?.name ? `${alter.name}'s session` : "Front session"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {start ? `Started ${formatDistanceToNow(new Date(start), { addSuffix: true })}` : "Front session"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-2 pt-2">
          <Button onClick={jumpToSession} className="w-full justify-start">
            Jump to session on Timeline
          </Button>
          <Button onClick={editSession} variant="outline" className="w-full justify-start">
            Edit session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
