/**
 * DiarySectionPanel — Schema-driven section renderer
 * Renders the appropriate editor for a given section based on section.type
 * All reads/writes use section.data_key for analytics-safety.
 */
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import EmotionPicker from "./EmotionPicker";
import RatingRow from "./RatingRow";
import SymptomsChecklistPanel from "./SymptomsChecklistPanel";

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

export default function DiarySectionPanel({ section, data, onChange, onClose }) {
  const { id, type, label, subtitle, data_key, scale_max = 5 } = section;

  if (id === "checklist") {
    return (
      <SymptomsChecklistPanel
        data={data[data_key] || {}}
        onChange={onChange}
        onClose={onClose}
      />
    );
  }

  if (type === "multi_select") {
    return (
      <PanelShell title={label} subtitle={subtitle} onClose={onClose}>
        <EmotionPicker
          selected={data[data_key] || []}
          onChange={(v) => onChange(data_key, v)}
        />
      </PanelShell>
    );
  }

  if (type === "scale_group") {
    const groupData = data[data_key] || {};
    const enabledFields = (section.fields || []).filter((f) => f.enabled !== false);
    return (
      <PanelShell title={label} subtitle={subtitle} onClose={onClose}>
        <div className="space-y-5">
          {enabledFields.map((field) => (
            <RatingRow
              key={field.id}
              emoji={field.emoji}
              label={field.label}
              max={scale_max}
              value={groupData[field.data_key]}
              onChange={(v) => onChange(data_key, { ...groupData, [field.data_key]: v })}
            />
          ))}
        </div>
      </PanelShell>
    );
  }

  if (type === "single_scale") {
    return (
      <PanelShell title={label} subtitle={subtitle} onClose={onClose}>
        <RatingRow
          emoji={section.field_emoji || "⭐"}
          label={section.field_label || label}
          max={scale_max}
          value={data[data_key]}
          onChange={(v) => onChange(data_key, v)}
        />
      </PanelShell>
    );
  }

  if (type === "toggle_group") {
    const groupData = data[data_key] || {};
    const enabledFields = (section.fields || []).filter((f) => f.enabled !== false);
    return (
      <PanelShell title={label} subtitle={subtitle} onClose={onClose}>
        <div className="space-y-4">
          {enabledFields.map((field, i) => {
            if (field.field_type === "boolean") {
              return (
                <div key={field.id} className={`flex items-center justify-between py-3 ${i < enabledFields.length - 1 ? "border-b border-border/50" : ""}`}>
                  <Label className="flex items-center gap-2 cursor-pointer">
                    {field.emoji && <span>{field.emoji}</span>} {field.label}
                  </Label>
                  <Switch
                    checked={!!groupData[field.data_key]}
                    onCheckedChange={(v) => onChange(data_key, { ...groupData, [field.data_key]: v })}
                  />
                </div>
              );
            }
            if (field.field_type === "number") {
              return (
                <div key={field.id} className="space-y-1.5">
                  <Label>{field.label}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={groupData[field.data_key] ?? ""}
                    onChange={(e) =>
                      onChange(data_key, {
                        ...groupData,
                        [field.data_key]: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="0"
                  />
                </div>
              );
            }
            return null;
          })}
        </div>
      </PanelShell>
    );
  }

  if (type === "text_group") {
    const groupData = data[data_key] || {};
    const enabledFields = (section.fields || []).filter((f) => f.enabled !== false);
    return (
      <PanelShell title={label} subtitle={subtitle} onClose={onClose}>
        <div className="space-y-4">
          {enabledFields.map((field) => (
            <div key={field.id} className="space-y-1.5">
              <Label>{field.label}</Label>
              {field.field_type === "long" ? (
                <Textarea
                  value={groupData[field.data_key] || ""}
                  onChange={(e) => onChange(data_key, { ...groupData, [field.data_key]: e.target.value })}
                  placeholder="Any other details..."
                  className="min-h-[80px]"
                />
              ) : (
                <Input
                  value={groupData[field.data_key] || ""}
                  onChange={(e) => onChange(data_key, { ...groupData, [field.data_key]: e.target.value })}
                  placeholder={field.label}
                />
              )}
            </div>
          ))}
        </div>
      </PanelShell>
    );
  }

  return null;
}