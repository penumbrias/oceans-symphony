import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export default function CheckInStep3({ data, onChange, alters = [] }) {
  const step = data?.step3_greet || {};
  const [alterInput, setAlterInput] = useState("");

  const addAlter = () => {
    if (alterInput.trim()) {
      const noticed = step.noticed_alters || [];
      onChange({
        step3_greet: {
          ...step,
          noticed_alters: [...noticed, alterInput.trim()]
        }
      });
      setAlterInput("");
    }
  };

  const removeAlter = (index) => {
    const noticed = step.noticed_alters || [];
    onChange({
      step3_greet: {
        ...step,
        noticed_alters: noticed.filter((_, i) => i !== index)
      }
    });
  };

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
              <Label className="text-sm mb-2 block">Alters noticed or present</Label>
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Add alter name..."
                  value={alterInput}
                  onChange={(e) => setAlterInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addAlter()}
                  className="flex-1"
                />
                <Button onClick={addAlter} size="sm">
                  Add
                </Button>
              </div>
              {step.noticed_alters && step.noticed_alters.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {step.noticed_alters.map((alter, idx) => (
                    <div
                      key={idx}
                      className="bg-primary/10 text-primary text-sm px-3 py-1 rounded-full flex items-center gap-2"
                    >
                      {alter}
                      <button
                        onClick={() => removeAlter(idx)}
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