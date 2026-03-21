import React, { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import SymptomItem from "./SymptomItem";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const SYMPTOMS = [
  { id: "overall_mood", label: "Overall Mood", type: "rating" },
  { id: "energy_levels", label: "Energy Levels", type: "rating" },
  { id: "anxiety", label: "Anxiety", type: "rating" },
  { id: "amnesia", label: "Amnesia / Memory Problems", type: "boolean" },
  { id: "random_switch", label: "Random Switch", type: "boolean" },
  { id: "triggered_switch", label: "Triggered Switch", type: "boolean" },
  { id: "depression", label: "Depression", type: "rating" },
  { id: "lots_of_switching", label: "Lots of Switching", type: "boolean" },
  { id: "emotional_hangover", label: "Emotional Hangover", type: "boolean" },
  { id: "rapid_cycling_moods", label: "Rapid Cycling Mood Swings", type: "boolean" },
  { id: "feeling_overwhelmed", label: "Feeling Overwhelmed", type: "rating" },
  { id: "feeling_manic", label: "Feeling Manic / Elated / Wired", type: "rating" },
  { id: "took_care_of_chores", label: "Took Care of Chores", type: "boolean" },
  { id: "lack_of_motivation", label: "Lack of Motivation", type: "rating" },
  { id: "attended_therapy", label: "Attended Therapy", type: "boolean" },
  { id: "trouble_sleeping", label: "Trouble Sleeping", type: "rating" },
  { id: "self_care_activities", label: "Self-Care Activities", type: "boolean" },
  { id: "logged_diary", label: "Logged Diary", type: "boolean" },
  { id: "feeling_irritable", label: "Feeling Irritable", type: "rating" },
  { id: "relationship_problems", label: "Experienced Relationship Problems", type: "boolean" },
  { id: "emotional_numbness", label: "Emotional Numbness", type: "rating" },
  { id: "social_activities", label: "Engaged in Social Activities", type: "boolean" },
  { id: "self_esteem", label: "Self Esteem", type: "rating" },
  { id: "used_coping_skills", label: "Used Coping Skills", type: "boolean" },
];

const HABITS = [
  { id: "exercise", label: "🏃 Exercise", type: "boolean" },
  { id: "feeling_calm", label: "😌 Feeling Calm", type: "boolean" },
  { id: "feeling_happy", label: "🙂 Feeling Happy", type: "boolean" },
  { id: "feeling_productive", label: "✅ Feeling Productive", type: "boolean" },
  { id: "work_school_stress", label: "💼 Work/School Stress", type: "boolean" },
  { id: "general_stress", label: "😤 General Stress", type: "boolean" },
  { id: "spoke_to_someone", label: "💬 Spoke to Someone About Feelings", type: "boolean" },
];

export default function SymptomsChecklistPanel({ data, onChange, onClose }) {
  // data shape: { MON: { symptoms: {}, habits: {}, medications: {} }, TUE: {...}, ... }
  const [activeDay, setActiveDay] = useState("MON");
  const [activeTab, setActiveTab] = useState("symptoms"); // "symptoms" | "habits"

  const dayData = data[activeDay] || {};
  const symptoms = dayData.symptoms || {};
  const habits = dayData.habits || {};

  const setDayField = (tab, field, value) => {
    const updated = {
      ...data,
      [activeDay]: {
        ...dayData,
        [tab]: {
          ...(dayData[tab] || {}),
          [field]: value,
        },
      },
    };
    onChange("weekly_checklist", updated);
  };

  const countFilled = (obj) => Object.values(obj).filter((v) => v !== undefined && v !== null).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">DID Mental Health & Symptom Check List</h3>
          <p className="text-sm text-muted-foreground">Daily snapshot — pick a day, then log symptoms and habits.</p>
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Day picker */}
      <div className="flex flex-wrap gap-2">
        {DAYS.map((day) => {
          const d = data[day] || {};
          const hasSome = countFilled(d.symptoms || {}) + countFilled(d.habits || {}) > 0;
          return (
            <button
              key={day}
              onClick={() => setActiveDay(day)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                activeDay === day
                  ? "border-primary bg-primary/10 text-primary"
                  : hasSome
                  ? "border-primary/40 text-primary/70"
                  : "border-border text-muted-foreground hover:border-border/80"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/40 p-1 rounded-xl w-fit">
        {[["symptoms", "🔲 Symptoms"], ["habits", "🌿 Habits"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
        {activeTab === "symptoms"
          ? SYMPTOMS.map((s) => (
              <SymptomItem
                key={s.id}
                label={s.label}
                type={s.type}
                value={symptoms[s.id]}
                onChange={(v) => setDayField("symptoms", s.id, v)}
              />
            ))
          : HABITS.map((h) => (
              <SymptomItem
                key={h.id}
                label={h.label}
                type={h.type}
                value={habits[h.id]}
                onChange={(v) => setDayField("habits", h.id, v)}
              />
            ))}
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={onClose} className="bg-primary hover:bg-primary/90">Done</Button>
      </div>
    </div>
  );
}