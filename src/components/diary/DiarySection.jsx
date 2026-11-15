/**
 * DiarySection — Inline diary fields for the QuickCheckInModal.
 * Renders all enabled diary fields grouped visually.
 * Uses existing RatingRow for rating fields.
 */
import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import MentionTextarea from "@/components/shared/MentionTextarea";
import RatingRow from "@/components/diary/RatingRow";

export const DEFAULT_GROUPS = [
  {
    id: "urges",
    label: "Urges to",
    fields: [
      { id: "suicidal", data_key: "suicidal", label: "Suicidal urges", type: "rating", max: 5, is_positive: false },
      { id: "self_harm", data_key: "self_harm", label: "Self-harm urges", type: "rating", max: 5, is_positive: false },
      { id: "alcohol_drugs", data_key: "alcohol_drugs", label: "Alcohol / drugs", type: "rating", max: 5, is_positive: false },
    ],
  },
  {
    id: "body_mind",
    label: "Body + Mind",
    fields: [
      { id: "emotional_misery", data_key: "emotional_misery", label: "Emotional misery", type: "rating", max: 5, is_positive: false },
      { id: "physical_misery", data_key: "physical_misery", label: "Physical misery", type: "rating", max: 5, is_positive: false },
      { id: "joy", data_key: "joy", label: "Joy", type: "rating", max: 5, is_positive: true },
    ],
  },
  {
    id: "skills",
    label: "Skills + Safety",
    fields: [
      { id: "skills_practiced", data_key: "skills_practiced", label: "Skills practiced", type: "rating", max: 7, is_positive: true },
      { id: "rx_meds_taken", data_key: "rx_meds_taken", label: "Rx meds taken", type: "boolean" },
      { id: "self_harm_occurred", data_key: "self_harm_occurred", label: "Self-harm occurred", type: "boolean", is_positive: false },
      { id: "substances_count", data_key: "substances_count", label: "Alcohol / drugs count", type: "number" },
    ],
  },
];

// Every diary group the person's template knows, disabled ones included —
// for SHOWING saved cards (diaryCardRows), where a group switched off later
// still labels the answers saved under it.
export function useDiaryGroups() {
  const { data: templateData } = useQuery({
    queryKey: ['diaryTemplate'],
    queryFn: () => base44.entities.DiaryTemplate.list(),
  });
  return useMemo(() => {
    const own = templateData?.[0]?.groups;
    if (!Array.isArray(own) || !own.length) return DEFAULT_GROUPS;
    // Built-in groups the template dropped still get their proper labels.
    const ids = new Set(own.map((g) => g.id));
    return [...own, ...DEFAULT_GROUPS.filter((g) => !ids.has(g.id)).map((g, i) => ({ ...g, order: 1000 + i }))];
  }, [templateData]);
}

export default function DiarySection({ data, onChange }) {
  const [collapsed, setCollapsed] = useState({});

  const { data: templateData } = useQuery({
    queryKey: ['diaryTemplate'],
    queryFn: () => base44.entities.DiaryTemplate.list(),
  });

  const groups = useMemo(() => {
    if (!templateData?.[0]?.groups) return DEFAULT_GROUPS;
    return templateData[0].groups
      .filter(g => g.enabled !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }, [templateData]);

  // For @ mentions in text fields (the shared alters list, no extra fetch).
  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const toggleGroup = (id) =>
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  const getValue = (groupKey, fieldKey) => {
    const group = data[groupKey] || {};
    return group[fieldKey];
  };

  const setValue = (groupKey, fieldKey, value) => {
    const group = data[groupKey] || {};
    onChange(groupKey, { ...group, [fieldKey]: value });
  };

  return (
    <div className="space-y-3">
      {groups.map(group => (
        <div key={group.id} className="border border-border/50 rounded-xl overflow-hidden">
          <button
            onClick={() => toggleGroup(group.id)}
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
          >
            <span className="text-sm font-medium">{group.label}</span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${collapsed[group.id] ? "" : "rotate-180"}`} />
          </button>

          {!collapsed[group.id] && (
            <div className="px-4 py-3 space-y-4">
              {/* The order set in Manage check-in (each field's `order`),
                  not the order the fields were added in. */}
              {[...(group.fields || [])]
                .filter(field => field.enabled !== false)
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map(field => {
                if (field.type === "rating") {
                  return (
                    <RatingRow
                      key={field.id}
                      label={field.label}
                      max={field.max}
                      value={getValue(group.id, field.data_key)}
                      onChange={v => setValue(group.id, field.data_key, v)}
                    />
                  );
                }
                if (field.type === "boolean") {
                  return (
                    <div key={field.id} className="flex items-center justify-between py-1">
                      <span className="text-sm">{field.label}</span>
                      <Switch
                        checked={!!getValue(group.id, field.data_key)}
                        onCheckedChange={v => setValue(group.id, field.data_key, v)}
                      />
                    </div>
                  );
                }
                if (field.type === "number") {
                  return (
                    <div key={field.id} className="space-y-1">
                      <span className="text-sm">{field.label}</span>
                      <Input
                        type="number" min="0"
                        value={getValue(group.id, field.data_key) ?? ""}
                        onChange={e => setValue(group.id, field.data_key, e.target.value === "" ? undefined : Number(e.target.value))}
                        placeholder="0"
                        className="h-8 text-sm w-24"
                      />
                    </div>
                  );
                }
                if (field.type === "text") {
                  // Text fields could be added in Manage check-in but were
                  // never drawn here, so there was nowhere to write.
                  return (
                    <div key={field.id} className="space-y-1">
                      <span className="text-sm">{field.label}</span>
                      <MentionTextarea
                        alters={alters}
                        value={getValue(group.id, field.data_key) ?? ""}
                        onChange={v => setValue(group.id, field.data_key, v === "" ? undefined : v)}
                        aria-label={field.label}
                        className="text-sm min-h-[2.75rem] resize-none"
                      />
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// The pure data helpers live in src/lib/diaryData.js; re-exported here for
// the components that already import them from this file.
export { hasDiaryData, extraDiaryGroups } from "@/lib/diaryData";
