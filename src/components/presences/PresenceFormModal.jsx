import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PresenceForm from "./PresenceForm";

// Thin dialog wrapper around PresenceForm for the standalone "record a
// presence" entry point on the New Presences page (the SetFront tab embeds the
// form directly instead).
export default function PresenceFormModal({ open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-md flex flex-col overflow-hidden"
        style={{ maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 2rem)" }}
      >
        <DialogHeader>
          <DialogTitle>New presence</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto min-h-0 pr-1">
          <PresenceForm onSaved={onClose} onCancel={onClose} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
