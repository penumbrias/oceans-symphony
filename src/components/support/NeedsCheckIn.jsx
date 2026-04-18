import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Save, CheckCircle } from "lucide-react";
import { format } from "date-fns";

const NEEDS = [
  { id: "safety", label: "Safety", description: "Having a place that feels physically and emotionally safe", emoji: "🏠" },
  { id: "nourishment", label: "Nourishment", description: "Eating enough, sleeping enough, basic physical care", emoji: "🌿" },
  { id: "connection", label: "Connection", description: "Spending time with people who feel safe", emoji: "🤝" },
  { id: "rest", label: "Rest & Restoration", description: "Activities that help you recharge", emoji: "🌙" },
  { id: "meaning", label: "Meaningful Activity", description: "Things that feel worthwhile or purposeful", emoji: "✨" },
  { id: "self_compassion", label: "Self-Compassion", description: "Treating yourself with some of the care you'd give someone you love", emoji: "🤍" },
];

const EXERCISE_ID = "needs_checkin";

export default function NeedsCheckIn({ onBack }) {
  const queryClient = useQueryClient();
  const [ratings, setRatings] = useState({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: entries = [] } = useQuery({
    queryKey: ["supportJournal", EXERCISE_ID],
    queryFn: () => base44.entities.SupportJournalEntry.filter({ exercise_id: EXERCISE_ID }),
    onSuccess: (data) => {
      const latest = data.sort((a, b) =>
        new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date)
      )[0];
      if (latest?.responses) setRatings(latest.responses);
    }
  });

  const latestEntry = entries.sort((a, b) =>
    new Date(b.updated_date || b.created_date) - new Date(a.updated_date || a.created_date)
  )[0];

  const handleRate = (id, val) => {
    setRatings(prev => ({ ...prev, [id]: val }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    if (latestEntry) {
      await base44.entities.SupportJournalEntry.update(latestEntry.id, { responses: ratings });
    } else {
      await base44.entities.SupportJournalEntry.create({
        exercise_id: EXERCISE_ID,
        exercise_title: "Healthy Needs Check-In",
        responses: ratings,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["supportJournal", EXERCISE_ID] });
    queryClient.invalidateQueries({ queryKey: ["supportJournalAll"] });
    setSaved(true);
    setSaving(false);
  };

  const rated = NEEDS.filter(n => ratings[n.id] !== undefined);
  const okayNeeds = rated.filter(n => (ratings[n.id] ?? 5) >= 6);
  const needsCare = rated.filter(n => (ratings[n.id] ?? 5) < 6);

  return (
    <div className="max-w-xl mx-auto p-4 space-y-6 pb-12">
      <div>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3 transition-colors">
          <ChevronLeft className="w-3 h-3" /> Back to Learn
        </button>
        <h2 className="text-lg font-semibold text-foreground">Healthy Needs Check-In</h2>
        <p className="text-sm text-muted-foreground mt-1">A gentle look at how your basic needs are being met right now. This is just a mirror — not an evaluation.</p>
      </div>

      <div className="space-y-4">
        {NEEDS.map(need => (
          <div key={need.id} className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-xl">{need.emoji}</span>
              <div>
                <p className="text-sm font-semibold text-foreground">{need.label}</p>
                <p className="text-xs text-muted-foreground">{need.description}</p>
              </div>
            </div>
            <div className="space-y-1">
              <input
                type="range"
                min={0}
                max={10}
                value={ratings[need.id] ?? 5}
                onChange={e => handleRate(need.id, Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Not at all met</span>
                <span className="font-semibold text-primary">{ratings[need.id] ?? 5} / 10</span>
                <span>Very well met</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Gentle summary */}
      {rated.length > 0 && (
        <div className="bg-card border border-border/60 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">A gentle reflection</p>
          {okayNeeds.length > 0 && (
            <div>
              <p className="text-xs text-green-600 font-medium mb-1">Areas where you seem to be doing okay:</p>
              <p className="text-xs text-muted-foreground">{okayNeeds.map(n => n.label).join(", ")}</p>
            </div>
          )}
          {needsCare.length > 0 && (
            <div>
              <p className="text-xs text-primary font-medium mb-1">Areas where you might want some extra care this week:</p>
              <p className="text-xs text-muted-foreground">{needsCare.map(n => n.label).join(", ")}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground italic">No advice here — just an invitation to notice what you might need.</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        {latestEntry && (
          <p className="text-xs text-muted-foreground">
            Last saved {format(new Date(latestEntry.updated_date || latestEntry.created_date), "MMM d, yyyy")}
          </p>
        )}
        <Button onClick={handleSave} disabled={saving} className="ml-auto gap-1.5">
          {saving ? null : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? "Saved" : "Save check-in"}
        </Button>
      </div>
    </div>
  );
}