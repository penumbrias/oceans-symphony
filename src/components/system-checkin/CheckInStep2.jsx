import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import AlterGroupPicker from "./AlterGroupPicker";

export default function CheckInStep2({ data, onChange, alters = [], groups = [] }) {
  const step = data?.step2_notice || {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Step 2: Notice Who's Near (1 min)</CardTitle>
          <CardDescription>Notice what, if anything, arises. No need to force anything. Showing up is what matters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
             <div>
               <Label className="text-sm mb-2 block">Alters & Groups present</Label>
               <AlterGroupPicker
                 alters={alters}
                 groups={groups}
                 selected={step.alters_present || []}
                 onChange={(selected) =>
                   onChange({
                     step2_notice: { ...step, alters_present: selected }
                   })
                 }
               />
             </div>

            <div>
              <Label htmlFor="step2-feelings" className="text-sm mb-2 block">
                Feelings noticed
              </Label>
              <Textarea
                id="step2-feelings"
                placeholder="What emotions or feelings do you notice?"
                value={step.feelings || ""}
                onChange={(e) =>
                  onChange({
                    step2_notice: { ...step, feelings: e.target.value }
                  })
                }
                className="resize-none h-16"
              />
            </div>

            <div>
              <Label htmlFor="step2-sensations" className="text-sm mb-2 block">
                Sensations, colors, or textures
              </Label>
              <Textarea
                id="step2-sensations"
                placeholder="Any physical sensations, colors, or textures?"
                value={step.sensations || ""}
                onChange={(e) =>
                  onChange({
                    step2_notice: { ...step, sensations: e.target.value }
                  })
                }
                className="resize-none h-16"
              />
            </div>

            <div>
              <Label htmlFor="step2-notes" className="text-sm mb-2 block">
                Additional notes
              </Label>
              <Textarea
                id="step2-notes"
                placeholder="Any other observations..."
                value={step.notes || ""}
                onChange={(e) =>
                  onChange({
                    step2_notice: { ...step, notes: e.target.value }
                  })
                }
                className="resize-none h-16"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}