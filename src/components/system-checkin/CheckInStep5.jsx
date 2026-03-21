import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function CheckInStep5({ data, onChange }) {
  const step = data?.step5_closing || {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Step 5: Gentle Closing</CardTitle>
          <CardDescription>Thank your system and reinforce connection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox
                id="gratitude"
                checked={step.gratitude_expressed || false}
                onCheckedChange={(checked) =>
                  onChange({
                    step5_closing: { ...step, gratitude_expressed: checked }
                  })
                }
              />
              <Label htmlFor="gratitude" className="cursor-pointer flex-1">
                Thanked your system for spending time together
              </Label>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="reminder"
                checked={step.reminder_given || false}
                onCheckedChange={(checked) =>
                  onChange({
                    step5_closing: { ...step, reminder_given: checked }
                  })
                }
              />
              <Label htmlFor="reminder" className="cursor-pointer flex-1">
                Reminded them "I'll keep coming back"
              </Label>
            </div>

            <div className="p-3 bg-accent/30 rounded-lg">
              <p className="text-xs text-muted-foreground italic">
                Thank your system for spending time together. Remind your parts, "I'll keep coming back".
              </p>
            </div>

            <div>
              <Label htmlFor="step5-notes" className="text-sm mb-2 block">
                Notes
              </Label>
              <Textarea
                id="step5-notes"
                placeholder="How did the check-in feel overall? Any final reflections?"
                value={step.notes || ""}
                onChange={(e) =>
                  onChange({
                    step5_closing: { ...step, notes: e.target.value }
                  })
                }
                className="resize-none h-20"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}