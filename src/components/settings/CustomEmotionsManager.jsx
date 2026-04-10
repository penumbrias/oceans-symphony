// src/components/settings/CustomEmotionsManager.jsx
import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { localEntities } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Pencil, Check, X, Heart } from "lucide-react";
import { toast } from "sonner";

const db = isLocalMode() ? localEntities : base44.entities;

const CATEGORY_LABELS = {
  good: "Good",
  bad: "Bad",
  neutral: "Neutral",
  body: "Body & Nervous System",
  Happy: "Happy", Strong: "Strong", Peaceful: "Peaceful",
  Sad: "Sad", Angry: "Angry", Fearful: "Fearful",
  Calm: "Calm", Flight: "Flight", Fight: "Fight",
  Freeze: "Freeze", Collapse: "Collapse",
  custom: "Uncategorized",
};

const CATEGORY_COLORS = {
  good: "#22c55e", bad: "#ef4444", neutral: "#6b7280",
  body: "#f97316",
  Happy: "#f59e0b", Strong: "#16a34a", Peaceful: "#0ea5e9",
  Sad: "#a855f7", Angry: "#dc2626", Fearful: "#7c3aed",
  Calm: "#84cc16", Flight: "#fbbf24", Fight: "#f97316",
  Freeze: "#60a5fa", Collapse: "#94a3b8",
  custom: "hsl(var(--primary))",
};

function EmotionRow({ emotion, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(emotion.label);
  const [category, setCategory] = useState(emotion.category || "custom");

  const handleSave = () => {
    if (!label.trim()) return;
    onUpdate(emotion.id, { label: label.trim(), category });
    setEditing(false);
  };

  const color = CATEGORY_COLORS[emotion.category || "custom"] || "hsl(var(--primary))";

  if (editing) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg border border-primary/30 bg-primary/5">
        <Input
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          className="h-7 text-sm flex-1"
          autoFocus
        />
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="h-7 text-xs border border-input rounded-md bg-background px-1 flex-shrink-0"
        >
          {Object.entries(CATEGORY_LABELS).map(([val, lbl]) => (
            <option key={val} value={val}>{lbl}</option>
          ))}
        </select>
        <button onClick={handleSave} className="text-green-500 hover:text-green-600 flex-shrink-0">
          <Check className="w-4 h-4" />
        </button>
        <button onClick={() => { setEditing(false); setLabel(emotion.label); setCategory(emotion.category || "custom"); }}
          className="text-muted-foreground hover:text-foreground flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/50 bg-muted/10 group">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-sm font-medium flex-1">{emotion.label}</span>
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {CATEGORY_LABELS[emotion.category || "custom"] || emotion.category || "Uncategorized"}
      </span>
      <button onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground flex-shrink-0">
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => onDelete(emotion.id)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive flex-shrink-0">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function CustomEmotionsManager() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: customEmotions = [] } = useQuery({
    queryKey: ["customEmotions"],
    queryFn: () => db.CustomEmotion.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.CustomEmotion.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customEmotions"] });
      toast.success("Emotion deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => db.CustomEmotion.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customEmotions"] });
      toast.success("Emotion updated");
    },
    onError: () => toast.error("Failed to update"),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return customEmotions;
    const q = search.toLowerCase();
    return customEmotions.filter(e =>
      e.label.toLowerCase().includes(q) ||
      (CATEGORY_LABELS[e.category || "custom"] || "").toLowerCase().includes(q)
    );
  }, [customEmotions, search]);

  // Group by category for display
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(e => {
      const cat = e.category || "custom";
      if (!map[cat]) map[cat] = [];
      map[cat].push(e);
    });
    return map;
  }, [filtered]);

  if (customEmotions.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Custom Emotions</CardTitle>
              <CardDescription>Emotions you've added to the picker</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground italic">No custom emotions yet. Add them from the check-in picker.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Heart className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Custom Emotions</CardTitle>
            <CardDescription>
              {customEmotions.length} custom emotion{customEmotions.length !== 1 ? "s" : ""}. Hover to edit or delete. You can also move them to a different category.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {customEmotions.length > 5 && (
          <Input
            placeholder="Search custom emotions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
        )}

        {Object.entries(grouped).map(([cat, emotions]) => (
          <div key={cat} className="space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[cat] || "hsl(var(--primary))" }} />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {CATEGORY_LABELS[cat] || cat}
              </p>
            </div>
            {emotions.map(e => (
              <EmotionRow
                key={e.id}
                emotion={e}
                onDelete={(id) => deleteMutation.mutate(id)}
                onUpdate={(id, data) => updateMutation.mutate({ id, data })}
              />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
