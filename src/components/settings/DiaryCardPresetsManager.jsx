import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { EMOTIONS } from "@/components/diary/EmotionPicker";
import { SYMPTOMS } from "@/components/diary/SymptomsChecklistPanel";

const URGE_TYPES = [
  { id: "suicidal", label: "Suicidal urges" },
  { id: "self_harm", label: "Self-harm urges" },
  { id: "alcohol_drugs", label: "Alcohol/Drugs" },
];

const BODY_MIND_TYPES = [
  { id: "emotional_misery", label: "Emotional misery" },
  { id: "physical_misery", label: "Physical misery" },
  { id: "joy", label: "Joy" },
];

export default function DiaryCardPresetsManager() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  
  const [presets, setPresets] = useState({
    emotions: [],
    urges: [],
    bodyMind: [],
    skills: [],
    symptoms: [],
  });
  
  const [newEmotion, setNewEmotion] = useState("");
  const [newSkill, setNewSkill] = useState("");

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });

  const settings = settingsList[0] || null;

  useEffect(() => {
    if (settings?.diary_presets) {
      setPresets(settings.diary_presets);
    }
  }, [settings]);

  const handleAddEmotion = () => {
    if (newEmotion.trim()) {
      setPresets(prev => ({
        ...prev,
        emotions: [...prev.emotions, newEmotion.trim()]
      }));
      setNewEmotion("");
    }
  };

  const handleRemoveEmotion = (idx) => {
    setPresets(prev => ({
      ...prev,
      emotions: prev.emotions.filter((_, i) => i !== idx)
    }));
  };

  const handleToggleUrge = (urgeId) => {
    setPresets(prev => ({
      ...prev,
      urges: prev.urges.includes(urgeId)
        ? prev.urges.filter(u => u !== urgeId)
        : [...prev.urges, urgeId]
    }));
  };

  const handleToggleBodyMind = (typeId) => {
    setPresets(prev => ({
      ...prev,
      bodyMind: prev.bodyMind.includes(typeId)
        ? prev.bodyMind.filter(t => t !== typeId)
        : [...prev.bodyMind, typeId]
    }));
  };

  const handleAddSkill = () => {
    if (newSkill.trim()) {
      setPresets(prev => ({
        ...prev,
        skills: [...prev.skills, newSkill.trim()]
      }));
      setNewSkill("");
    }
  };

  const handleRemoveSkill = (idx) => {
    setPresets(prev => ({
      ...prev,
      skills: prev.skills.filter((_, i) => i !== idx)
    }));
  };

  const handleToggleSymptom = (symptomId) => {
    setPresets(prev => ({
      ...prev,
      symptoms: prev.symptoms.includes(symptomId)
        ? prev.symptoms.filter(s => s !== symptomId)
        : [...prev.symptoms, symptomId]
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, {
          diary_presets: presets,
        });
      } else {
        await base44.entities.SystemSettings.create({
          diary_presets: presets,
        });
      }
      toast.success("Diary presets saved!");
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (error) {
      toast.error("Failed to save presets");
    }
    setSaving(false);
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Edit Diary Cards</CardTitle>
            <CardDescription>Customize emotions, urges, symptoms, and skills</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Emotions */}
        <div className="space-y-3">
          <h3 className="font-medium text-sm">Emotions</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Add emotion..."
              value={newEmotion}
              onChange={(e) => setNewEmotion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddEmotion()}
              className="bg-card/50"
            />
            <Button onClick={handleAddEmotion} size="sm" variant="outline">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.emotions.map((emotion, idx) => (
              <div key={idx} className="bg-accent/20 px-3 py-1 rounded-full flex items-center gap-2 text-sm">
                {emotion}
                <button onClick={() => handleRemoveEmotion(idx)} className="hover:opacity-70">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Urges */}
        <div className="space-y-3">
          <h3 className="font-medium text-sm">Urges to Track</h3>
          <div className="space-y-2">
            {URGE_TYPES.map(urge => (
              <label key={urge.id} className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={presets.urges.includes(urge.id)}
                  onCheckedChange={() => handleToggleUrge(urge.id)}
                />
                <span className="text-sm">{urge.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Body + Mind */}
        <div className="space-y-3">
          <h3 className="font-medium text-sm">Body + Mind</h3>
          <div className="space-y-2">
            {BODY_MIND_TYPES.map(type => (
              <label key={type.id} className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={presets.bodyMind.includes(type.id)}
                  onCheckedChange={() => handleToggleBodyMind(type.id)}
                />
                <span className="text-sm">{type.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Skills */}
        <div className="space-y-3">
          <h3 className="font-medium text-sm">Skills (Examples)</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Add skill..."
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddSkill()}
              className="bg-card/50"
            />
            <Button onClick={handleAddSkill} size="sm" variant="outline">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.skills.map((skill, idx) => (
              <div key={idx} className="bg-primary/10 px-3 py-1 rounded-full flex items-center gap-2 text-sm">
                {skill}
                <button onClick={() => handleRemoveSkill(idx)} className="hover:opacity-70">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Symptoms */}
        <div className="space-y-3">
          <h3 className="font-medium text-sm">Symptoms & Habits to Track</h3>
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
            {SYMPTOMS.map(symptom => (
              <label key={symptom.id} className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={presets.symptoms.includes(symptom.id)}
                  onCheckedChange={() => handleToggleSymptom(symptom.id)}
                />
                <span>{symptom.label}</span>
              </label>
            ))}
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-primary hover:bg-primary/90"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : null}
          Save Presets
        </Button>
      </CardContent>
    </Card>
  );
}