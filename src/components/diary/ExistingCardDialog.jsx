import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function ExistingCardDialog({
  isOpen,
  onClose,
  onUpdate,
  onCreateNew,
  existingCard,
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Card Already Exists</DialogTitle>
          <DialogDescription>
            You already have a diary card for today. Would you like to update it or create a new one?
          </DialogDescription>
        </DialogHeader>

        <div className="bg-card border border-border/50 rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium">{existingCard?.name}</p>
          <p className="text-xs text-muted-foreground">
            Created: {new Date(existingCard?.created_date).toLocaleString()}
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={onCreateNew}>
            Create New Card
          </Button>
          <Button onClick={onUpdate}>
            Update Existing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}