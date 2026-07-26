// Editor for an alter's preferences & boundaries — the "advanced pronouns"
// mode. A list of rows, each: label + category + 1–5 comfort level (💔 hate
// → ❤️ love), pronouns.cc-style. Controlled component: parent owns the
// array (usually `form.preferences` in AlterEditModal) and persists it on
// save with the rest of the alter.

import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PREF_LEVELS, PREF_CATEGORIES, categoryMeta } from "@/lib/alterPreferences";

function LevelPicker({ value, onChange, compact = false }) {
  return (
    <div className="flex gap-0.5" role="radiogroup" aria-label="Comfort level">
      {Object.entries(PREF_LEVELS).map(([lvl, meta]) => {
        const n = Number(lvl);
        const active = value === n;
        return (
          <button
            key={lvl}
            type="button"
            role="radio"
            aria-checked={active}
            title={meta.label}
            onClick={() => onChange(n)}
            className={`${compact ? "w-6 h-6 text-xs" : "w-7 h-7 text-sm"} rounded-md flex items-center justify-center transition-all ${
              active ? "bg-primary/15 ring-1 ring-primary scale-110" : "opacity-45 hover:opacity-100"
            }`}
          >
            {meta.emoji}
          </button>
        );
      })}
    </div>
  );
}

export default function AlterPreferencesEditor({ value = [], onChange }) {
  const prefs = Array.isArray(value) ? value : [];
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState("pronouns");
  const [newLevel, setNewLevel] = useState(4);

  const patch = (id, changes) =>
    onChange(prefs.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  const remove = (id) => onChange(prefs.filter((p) => p.id !== id));
  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    onChange([
      ...prefs,
      { id: `pref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label, category: newCategory, level: newLevel },
    ]);
    setNewLabel("");
  };

  // Group rows by category for display, preserving PREF_CATEGORIES order.
  const grouped = PREF_CATEGORIES
    .map((c) => ({ meta: c, rows: prefs.filter((p) => p.category === c.id) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-3">
      {grouped.map(({ meta, rows }) => (
        <div key={meta.id} className="space-y-1">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">{meta.label}</p>
          <div className="space-y-1">
            {rows.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-lg border border-border/50 px-2 py-1.5">
                <Input
                  value={p.label}
                  onChange={(e) => patch(p.id, { label: e.target.value })}
                  className="h-7 text-sm flex-1 min-w-0 border-none shadow-none focus-visible:ring-0 px-1"
                  aria-label={`${meta.label} entry`}
                />
                <LevelPicker compact value={p.level} onChange={(lvl) => patch(p.id, { level: lvl })} />
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  aria-label={`Remove ${p.label}`}
                  className="p-1 rounded text-muted-foreground hover:text-destructive flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Add row */}
      <div className="rounded-lg border border-dashed border-border/60 p-2 space-y-2">
        <div className="flex items-center gap-2">
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="h-8 px-2 rounded-lg border border-input bg-background text-xs flex-shrink-0"
            aria-label="Category"
          >
            {PREF_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder={categoryMeta(newCategory).hint}
            className="h-8 text-sm flex-1 min-w-0"
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <LevelPicker value={newLevel} onChange={setNewLevel} />
          <button
            type="button"
            onClick={add}
            disabled={!newLabel.trim()}
            className="h-7 px-2.5 flex items-center gap-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
      </div>
    </div>
  );
}

// Read-only chip display for profile pages. Groups by category; each chip
// shows the level emoji + label, tinted by the level colour.
export function PreferencesDisplay({ preferences = [] }) {
  const grouped = PREF_CATEGORIES
    .map((c) => ({ meta: c, rows: preferences.filter((p) => p.category === c.id) }))
    .filter((g) => g.rows.length > 0);
  if (grouped.length === 0) return null;
  return (
    <div className="space-y-2">
      {grouped.map(({ meta, rows }) => (
        <div key={meta.id}>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{meta.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {[...rows].sort((a, b) => b.level - a.level).map((p) => {
              const lvl = PREF_LEVELS[p.level] || PREF_LEVELS[3];
              return (
                <span
                  key={p.id || p.label}
                  title={lvl.label}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border"
                  style={{ borderColor: `${lvl.color}66`, backgroundColor: `${lvl.color}14` }}
                >
                  <span aria-hidden="true">{lvl.emoji}</span>
                  <span>{p.label}</span>
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
