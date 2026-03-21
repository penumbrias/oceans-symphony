import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
            <div>
              <Label className="text-sm mb-3 block">How did you greet?</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="silent"
                    name="greeting-type"
                    value="silent"
                    checked={step.greeting_type === "silent"}
                    onChange={(e) =>
                      onChange({
                        step3_greet: { ...step, greeting_type: e.target.value }
                      })
                    }
                  />
                  <Label htmlFor="silent" className="cursor-pointer">
                    Silently
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="loud"
                    name="greeting-type"
                    value="out_loud"
                    checked={step.greeting_type === "out_loud"}
                    onChange={(e) =>
                      onChange({
                        step3_greet: { ...step, greeting_type: e.target.value }
                      })
                    }
                  />
                  <Label htmlFor="loud" className="cursor-pointer">
                    Out loud
                  </Label>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="thanked"
                checked={step.thanked || false}
                onCheckedChange={(checked) =>
                  onChange({
                    step3_greet: { ...step, thanked: checked }
                  })
                }
              />
              <Label htmlFor="thanked" className="cursor-pointer flex-1">
                Thanked them for being here
              </Label>
            </div>

            <div>
              <Label htmlFor="step3-notes" className="text-sm mb-2 block">
                Notes
              </Label>
              <Textarea
                id="step3-notes"
                placeholder="What did you say or notice?"
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