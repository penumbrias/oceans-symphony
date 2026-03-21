import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import EmotionPicker from "./EmotionPicker";
import RatingRow from "./RatingRow";
import SymptomsChecklistPanel from "./SymptomsChecklistPanel";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";

export default function DailySectionPanel({ section, data, onChange, onClose }) {
  if (section === "checklist") {
    return (
      <SymptomsChecklistPanel
        data={data.checklist || {}}
        onChange={onChange}
        onClose={onClose}
      />
    );
  }

  if (section === "emotions") {
    return (
      <PanelShell title="Emotions" subtitle="Tap to add emotions you felt today." onClose={onClose}>
        <EmotionPicker selected={data.emotions || []} onChange={(v) => onChange("emotions", v)} />
      </PanelShell>
    );
  }

  if (section === "urges") {
    const urges = data.urges || {};
    const set = (k, v) => onChange("urges", { ...urges, [k]: v });
    return (
      <PanelShell title="Urges to" subtitle="Rate the intensity for each urge." onClose={onClose}>
        <div className="space-y-5">
          <RatingRow emoji="🆘" label="Suicidal urges" value={urges.suicidal} onChange={(v) => set("suicidal", v)} />
          <RatingRow emoji="✏️" label="Self-harm" value={urges.self_harm} onChange={(v) => set("self_harm", v)} />
          <RatingRow emoji="🍺" label="Alcohol/drugs" value={urges.alcohol_drugs} onChange={(v) => set("alcohol_drugs", v)} />
        </div>
      </PanelShell>
    );
  }

  if (section === "body_mind") {
    const bm = data.body_mind || {};
    const set = (k, v) => onChange("body_mind", { ...bm, [k]: v });
    return (
      <PanelShell title="Body + mind" subtitle="Track how your body and mind felt." onClose={onClose}>
        <div className="space-y-5">
          <RatingRow emoji="😩" label="Emotional misery" value={bm.emotional_misery} onChange={(v) => set("emotional_misery", v)} />
          <RatingRow emoji="🖐️" label="Physical misery" value={bm.physical_misery} onChange={(v) => set("physical_misery", v)} />
          <RatingRow emoji="✨" label="Joy" value={bm.joy} onChange={(v) => set("joy", v)} />
        </div>
      </PanelShell>
    );
  }

  if (section === "skills") {
    return (
      <PanelShell title="Skills used" subtitle="Log how many skills you practiced." onClose={onClose}>
        <RatingRow emoji="🧠" label="Skills practiced" max={7} value={data.skills_practiced} onChange={(v) => onChange("skills_practiced", v)} />
      </PanelShell>
    );
  }

  if (section === "medication") {
    const med = data.medication_safety || {};
    const set = (k, v) => onChange("medication_safety", { ...med, [k]: v });
    return (
      <PanelShell title="Medication + safety" subtitle="Track meds, safety, and substances." onClose={onClose}>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <Label className="flex items-center gap-2 cursor-pointer">
              <span>💊</span> Rx meds taken
            </Label>
            <Switch checked={!!med.rx_meds_taken} onCheckedChange={(v) => set("rx_meds_taken", v)} />
          </div>
          <div className="flex items-center justify-between py-3 border-b border-border/50">
            <Label className="flex items-center gap-2 cursor-pointer">
              <span>✏️</span> Self-harm occurred
            </Label>
            <Switch checked={!!med.self_harm_occurred} onCheckedChange={(v) => set("self_harm_occurred", v)} />
          </div>
          <div className="space-y-1.5">
            <Label>Alcohol/drugs (not Rx) #</Label>
            <Input
              type="number"
              min="0"
              value={med.substances_count ?? ""}
              onChange={(e) => set("substances_count", e.target.value === "" ? undefined : Number(e.target.value))}
              placeholder="0"
            />
          </div>
        </div>
      </PanelShell>
    );
  }

  if (section === "notes") {
    const notes = data.notes || {};
    const set = (k, v) => onChange("notes", { ...notes, [k]: v });
    return (
      <PanelShell title="Notes" subtitle="Capture details and reflections." onClose={onClose}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>What happened?</Label>
            <Input value={notes.what || ""} onChange={(e) => set("what", e.target.value)} placeholder="Brief description..." />
          </div>
          <div className="space-y-1.5">
            <Label>Judgments #</Label>
            <Input value={notes.judgments || ""} onChange={(e) => set("judgments", e.target.value)} placeholder="How many judgments did you notice?" />
          </div>
          <div className="space-y-1.5">
            <Label>Optional context</Label>
            <Textarea value={notes.optional || ""} onChange={(e) => set("optional", e.target.value)} placeholder="Any other details..." className="min-h-[80px]" />
          </div>
        </div>
      </PanelShell>
    );
  }

  return null;
}

function PanelShell({ title, subtitle, onClose, children }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
      <div className="flex justify-end pt-2">
        <Button onClick={onClose} className="bg-primary hover:bg-primary/90">Done</Button>
      </div>
    </div>
  );
}