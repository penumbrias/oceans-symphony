import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export default function CheckInStep2({ data, onChange }) {
  const step = data?.step2_notice || {};
  const [partInput, setPartInput] = useState("");

  const addPart = () => {
    if (partInput.trim()) {
      const parts = step.parts_present || [];
      onChange({
        step2_notice: {
          ...step,
          parts_present: [...parts, partInput.trim()]
        }
      });
      setPartInput("");
    }
  };

  const removePart = (index) => {
    const parts = step.parts_present || [];
    onChange({
      step2_notice: {
        ...step,
        parts_present: parts.filter((_, i) => i !== index)
      }
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Step 2: Notice Who's Near (1 min)</CardTitle>
          <CardDescription>Gently scan inward - notice what arises naturally</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <Label className="text-sm mb-2 block">Parts or alters nearby</Label>
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="e.g., Host, Little, Protector..."
                  value={partInput}
                  onChange={(e) => setPartInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addPart()}
                  className="flex-1"
                />
                <Button onClick={addPart} size="sm">
                  Add
                </Button>
              </div>
              {step.parts_present && step.parts_present.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {step.parts_present.map((part, idx) => (
                    <div
                      key={idx}
                      className="bg-primary/10 text-primary text-sm px-3 py-1 rounded-full flex items-center gap-2"
                    >
                      {part}
                      <button
                        onClick={() => removePart(idx)}
                        className="hover:text-destructive transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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