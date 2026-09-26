import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import MentionTextarea from "@/components/shared/MentionTextarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Wind } from "lucide-react";
import BreathingExercise from "@/components/grounding/BreathingExercise";

export default function CheckInStep1({ data, onChange, alters: altersProp }) {
  const step = data?.step1_arrive || {};
  const { data: fetchedAlters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(), enabled: !altersProp });
  const alters = altersProp || fetchedAlters;
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
                <MentionTextarea
                  id="step1-notes"
                  placeholder="Any observations..."
                  value={step.notes || ""}
                  onChange={(v) => onChange({ step1_arrive: { ...step, notes: v } })}
                  alters={alters}
                  signposts
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
