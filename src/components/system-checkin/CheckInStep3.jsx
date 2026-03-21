import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function CheckInStep3({ data, onChange }) {
  const step = data?.step3_greet || {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Step 3: Soft Greeting (1 min)</CardTitle>
          <CardDescription>Offer a warm hello to those who are present</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
             <div className="p-3 bg-accent/30 rounded-lg">
               <p className="text-xs text-muted-foreground italic">
                 "Thank you for being here. I see you."
               </p>
             </div>

            <div>
              <Label htmlFor="step3-notes" className="text-sm mb-2 block">
                Notes
              </Label>
              <Textarea
                id="step3-notes"
                placeholder="Any reflections from the greeting?"
                value={step.notes || ""}
                onChange={(e) =>
                  onChange({
                    step3_greet: { ...step, notes: e.target.value }
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