import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PresenceForm from "./PresenceForm";

// Dialog wrapper around PresenceForm for the standalone "record / edit a
// presence" entry points on the New Presences page. Pass `presence` to edit.
export default function PresenceFormModal({ open, onClose, presence = null }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-md flex flex-col overflow-hidden"
        style={{ maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 2rem)" }}
      >
        <DialogHeader>
          <DialogTitle>{presence?.id ? "Edit presence" : "New presence"}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto min-h-0 pr-1">
          <PresenceForm presence={presence} onSaved={onClose} onCancel={onClose} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
