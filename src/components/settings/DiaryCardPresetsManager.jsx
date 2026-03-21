import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { SYMPTOMS } from "@/components/diary/SymptomsChecklistPanel";

const DEFAULT_EMOTIONS = ["Happy", "Sad", "Angry", "Anxious", "Calm"];
const DEFAULT_URGES = ["Suicidal urges", "Self-harm urges", "Alcohol/Drugs"];
const DEFAULT_BODY_MIND = ["Emotional misery", "Physical misery", "Joy"];

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
  const [newUrge, setNewUrge] = useState("");
  const [newBodyMind, setNewBodyMind] = useState("");
  const [newSkill, setNewSkill] = useState("");
  const [newSymptomLabel, setNewSymptomLabel] = useState("");
  const [newSymptomType, setNewSymptomType] = useState("rating");
  const [newSymptomPositive, setNewSymptomPositive] = useState(false);

  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });

  const settings = settingsList[0] || null;

  useEffect(() => {
    if (settings?.diary_presets) {
      setPresets(settings.diary_presets);
    } else {
      // Initialize with defaults if no presets exist
      setPresets({
        emotions: DEFAULT_EMOTIONS,
        urges: DEFAULT_URGES,
        bodyMind: DEFAULT_BODY_MIND,
        skills: [],
        symptoms: [],
      });
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

  const handleAddUrge = () => {
    if (newUrge.trim()) {
      setPresets(prev => ({
        ...prev,
        urges: [...prev.urges, newUrge.trim()]
      }));
      setNewUrge("");
    }
  };

  const handleRemoveUrge = (idx) => {
    setPresets(prev => ({
      ...prev,
      urges: prev.urges.filter((_, i) => i !== idx)
    }));
  };

  const handleAddBodyMind = () => {
    if (newBodyMind.trim()) {
      setPresets(prev => ({
        ...prev,
        bodyMind: [...prev.bodyMind, newBodyMind.trim()]
      }));
      setNewBodyMind("");
    }
  };

  const handleRemoveBodyMind = (idx) => {
    setPresets(prev => ({
      ...prev,
      bodyMind: prev.bodyMind.filter((_, i) => i !== idx)
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

  const handleAddSymptom = () => {
    if (newSymptomLabel.trim()) {
      const newId = `custom_${Date.now()}`;
      setPresets(prev => ({
        ...prev,
        symptoms: [...prev.symptoms, {
          id: newId,
          label: newSymptomLabel.trim(),
          type: newSymptomType,
          is_positive: newSymptomPositive,
          category: "symptom"
        }]
      }));
      setNewSymptomLabel("");
      setNewSymptomType("rating");
      setNewSymptomPositive(false);
    }
  };

  const handleRemoveSymptom = (idx) => {
    setPresets(prev => ({
      ...prev,
      symptoms: prev.symptoms.filter((_, i) => i !== idx)
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
          <div className="flex gap-2">
            <Input
              placeholder="Add urge..."
              value={newUrge}
              onChange={(e) => setNewUrge(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddUrge()}
              className="bg-card/50"
            />
            <Button onClick={handleAddUrge} size="sm" variant="outline">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.urges.map((urge, idx) => (
              <div key={idx} className="bg-destructive/10 px-3 py-1 rounded-full flex items-center gap-2 text-sm">
                {urge}
                <button onClick={() => handleRemoveUrge(idx)} className="hover:opacity-70">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Body + Mind */}
        <div className="space-y-3">
          <h3 className="font-medium text-sm">Body + Mind</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Add metric..."
              value={newBodyMind}
              onChange={(e) => setNewBodyMind(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddBodyMind()}
              className="bg-card/50"
            />
            <Button onClick={handleAddBodyMind} size="sm" variant="outline">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.bodyMind.map((metric, idx) => (
              <div key={idx} className="bg-chart-2/20 px-3 py-1 rounded-full flex items-center gap-2 text-sm">
                {metric}
                <button onClick={() => handleRemoveBodyMind(idx)} className="hover:opacity-70">
                  <X className="w-3 h-3" />
                </button>
              </div>
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

          {/* Add new symptom form */}
          <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
            <div className="flex gap-2">
              <Input
                placeholder="Label"
                value={newSymptomLabel}
                onChange={(e) => setNewSymptomLabel(e.target.value)}
                className="bg-card/50 text-sm"
              />
              <select
                value={newSymptomType}
                onChange={(e) => setNewSymptomType(e.target.value)}
                className="px-2 py-1 rounded-md border border-input bg-card/50 text-sm"
              >
                <option value="rating">Scale</option>
                <option value="boolean">Yes/No</option>
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <Checkbox
                checked={newSymptomPositive}
                onCheckedChange={(checked) => setNewSymptomPositive(checked)}
              />
              <span>Positive symptom (higher = better)</span>
            </label>
            <Button onClick={handleAddSymptom} size="sm" variant="outline" className="w-full">
              <Plus className="w-4 h-4 mr-2" /> Add Symptom
            </Button>
          </div>

          {/* Listed symptoms */}
          <div className="space-y-2">
            {Array.isArray(presets.symptoms) && presets.symptoms.map((symptom, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-muted/40 rounded-lg text-sm">
                <div className="flex-1">
                  <div className="font-medium">{typeof symptom === 'string' ? symptom : symptom.label}</div>
                  {typeof symptom === 'object' && (
                    <div className="text-xs text-muted-foreground">
                      {symptom.type === 'rating' ? 'Scale' : 'Yes/No'} • {symptom.is_positive ? 'Positive' : 'Negative'}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveSymptom(idx)}
                  className="p-1 hover:bg-muted rounded transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
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