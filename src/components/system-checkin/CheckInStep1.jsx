import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function CheckInStep1({ data, onChange }) {
  const step = data?.step1_arrive || {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Step 1: Arrive (1 min)</CardTitle>
          <CardDescription>Ground yourself in the present moment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox
                id="breaths"
                checked={step.breaths_taken || false}
                onCheckedChange={(checked) =>
                  onChange({
                    step1_arrive: { ...step, breaths_taken: checked }
                  })
                }
              />
              <Label htmlFor="breaths" className="cursor-pointer flex-1">
                Take a few deep, slow breaths
              </Label>
            </div>

            <div className="p-3 bg-accent/30 rounded-lg">
              <p className="text-xs text-muted-foreground italic">
                "I'm here, I'm listening."
              </p>
            </div>

            <div>
              <Label htmlFor="step1-notes" className="text-sm mb-2 block">
                Notes
              </Label>
              <Textarea
                id="step1-notes"
                placeholder="Any observations..."
                value={step.notes || ""}
                onChange={(e) =>
                  onChange({
                    step1_arrive: { ...step, notes: e.target.value }
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