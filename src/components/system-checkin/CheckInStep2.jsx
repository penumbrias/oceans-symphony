import React from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import EmotionWheelPicker from "@/components/emotions/EmotionWheelPicker";
import { useTerms } from "@/lib/useTerms";

// "Feelings noticed" used to be a free-text Textarea. Now it's the same
// EmotionWheelPicker the Quick Check-In uses — selected labels live in
// step.feelings as an array of strings. SystemCheckIn.jsx tolerates the
// legacy string shape on load (existing records) but new saves are
// always arrays.

export default function CheckInStep2({ data, onChange, alters = [], groups = [] }) {
  const terms = useTerms();
  const queryClient = useQueryClient();
  const step = data?.step2_notice || {};

  // Normalize the persisted shape: legacy records stored a comma-/
  // semicolon-separated string; new ones store an array. The picker
  // wants the array form.
  const selectedEmotions = Array.isArray(step.feelings)
    ? step.feelings
    : (typeof step.feelings === "string" && step.feelings.trim()
      ? step.feelings.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
      : []);

  const { data: customEmotions = [] } = useQuery({
    queryKey: ["customEmotions"],
    queryFn: () => base44.entities.CustomEmotion.list(),
  });

  const addCustomEmotionMutation = useMutation({
    mutationFn: async ({ label, category = "custom" }) => {
      const cleanLabel = (label || "").trim();
      if (!cleanLabel) return null;
      const existing = customEmotions.find((e) => e.label.toLowerCase() === cleanLabel.toLowerCase());
      if (existing) return existing;
      return base44.entities.CustomEmotion.create({ label: cleanLabel, category });
    },
    onSuccess: (emotion) => {
      if (!emotion) return;
      // Auto-select the newly added emotion so the user doesn't have to
      // tap it again.
      const next = selectedEmotions.includes(emotion.label)
        ? selectedEmotions
        : [...selectedEmotions, emotion.label];
      onChange({ step2_notice: { ...step, feelings: next } });
      queryClient.invalidateQueries({ queryKey: ["customEmotions"] });
    },
  });

  const handleToggleEmotion = (label) => {
    const next = selectedEmotions.includes(label)
      ? selectedEmotions.filter((e) => e !== label)
      : [...selectedEmotions, label];
    onChange({ step2_notice: { ...step, feelings: next } });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Step 2: Notice Who's Near (1 min)</CardTitle>
          <CardDescription>Notice what, if anything, arises. No need to force anything. Showing up is what matters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {/* "Who's present" lives in the single "Notice who's near"
                section below (MeetingParticipantsSection) — no duplicate
                alters/groups picker here. Step 2 keeps the body / emotion
                check only. */}
            <div>
              <Label className="text-sm mb-2 block">Feelings noticed</Label>
              <EmotionWheelPicker
                selectedEmotions={selectedEmotions}
                onToggle={handleToggleEmotion}
                customEmotions={customEmotions}
                onAddCustom={(label, category) => addCustomEmotionMutation.mutate({ label, category })}
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
