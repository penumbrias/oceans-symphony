import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Wind } from "lucide-react";
import BreathingExercise from "@/components/grounding/BreathingExercise";

export default function CheckInStep1({ data, onChange }) {
  const step = data?.step1_arrive || {};
  const [showBreathing, setShowBreathing] = useState(false);

  const handleBreathingComplete = () => {
    setShowBreathing(false);
    onChange({ step1_arrive: { ...step, breaths_taken: true } });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Step 1: Arrive (1 min)</CardTitle>
          <CardDescription>Ground yourself in the present moment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {showBreathing ? (
            <div className="rounded-xl border border-border/50 bg-muted/10 px-4 py-2">
              <BreathingExercise
                patternName="Box breathing"
                onStop={() => setShowBreathing(false)}
                onComplete={handleBreathingComplete}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="breaths"
                  checked={step.breaths_taken || false}
                  onCheckedChange={(checked) =>
                    onChange({ step1_arrive: { ...step, breaths_taken: checked } })
                  }
                />
                <Label htmlFor="breaths" className="cursor-pointer flex-1">
                  Take a few deep, slow breaths
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 flex-shrink-0"
                  onClick={() => setShowBreathing(true)}
                >
                  <Wind className="w-3.5 h-3.5" />
                  Guide me
                </Button>
              </div>

              <div className="p-3 bg-accent/30 rounded-lg">
                <p className="text-xs text-muted-foreground italic">
                  Remind your system, "I'm here, I'm listening."
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
                    onChange({ step1_arrive: { ...step, notes: e.target.value } })
                  }
                  className="resize-none h-20"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
