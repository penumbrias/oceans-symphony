import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function CheckInStep4({ data, onChange }) {
  const step = data?.step4_share || {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Step 4: Invite Sharing (2 min)</CardTitle>
          <CardDescription>Create space for communication without pressure</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox
                id="invitation"
                checked={step.invitation_given || false}
                onCheckedChange={(checked) =>
                  onChange({
                    step4_share: { ...step, invitation_given: checked }
                  })
                }
              />
              <Label htmlFor="invitation" className="cursor-pointer flex-1">
                Invited parts to share if they wanted to
              </Label>
            </div>

            <div className="p-3 bg-accent/30 rounded-lg">
              <p className="text-xs text-muted-foreground italic">
                "Is there anything someone inside would like me to know today?"
              </p>
            </div>

            <div>
              <Label htmlFor="step4-notes" className="text-sm mb-2 block">
                Anything you would like to record?
              </Label>
              <Textarea
                id="step4-notes"
                placeholder="Any reflections, responses, or observations..."
                value={step.notes || ""}
                onChange={(e) =>
                  onChange({
                    step4_share: { ...step, notes: e.target.value }
                  })
                }
                className="resize-none h-24"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}