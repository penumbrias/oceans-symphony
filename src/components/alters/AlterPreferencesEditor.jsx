// Editor for an alter's preferences & boundaries — the "advanced pronouns"
// mode. A list of rows, each: label + category + 1–5 comfort level (💔 hate
// → ❤️ love), pronouns.cc-style. Controlled component: parent owns the
// array (usually `form.preferences` in AlterEditModal) and persists it on
// save with the rest of the alter.

import React, { useState } from "react";
import { Plus, Trash2, Minus } from "lucide-react";
import { DEFAULT_PREF_ICONS, PREF_ICON_SUGGESTIONS, customPrefIcon, usePrefLevelIcons } from "@/lib/prefLevelIcons";
import { Input } from "@/components/ui/input";
import { PREF_LEVELS, PREF_CATEGORIES, categoryMeta } from "@/lib/alterPreferences";

// The level icons (src/lib/prefLevelIcons.js): flat line icons by default
// (hate is an angry face), or the emoji / text the person set for each
// level. Exported so Friends.jsx and the profile widgets render preference
// chips with the same visual language.
export function PrefLevelIcon({ level, className = "w-3.5 h-3.5", filled = false }) {
  const { icons } = usePrefLevelIcons();
  const meta = PREF_LEVELS[level] || PREF_LEVELS[3];
  const custom = customPrefIcon(icons, level);
  if (custom) return <span className={`${className} inline-flex items-center justify-center leading-none`} style={{ fontSize: "0.95em" }} aria-hidden="true">{custom}</span>;
  const Icon = DEFAULT_PREF_ICONS[level] || Minus;
  return <Icon className={className} style={{ color: meta.color }} fill={filled && level === 5 ? meta.color : "none"} />;
}

function LevelGlyph({ level, active, className }) {
  const { icons } = usePrefLevelIcons();
  const meta = PREF_LEVELS[level] || PREF_LEVELS[3];
  const custom = customPrefIcon(icons, level);
  if (custom) return <span className={`${className} inline-flex items-center justify-center leading-none`} aria-hidden="true">{custom}</span>;
  const Icon = DEFAULT_PREF_ICONS[level] || Minus;
  return <Icon className={className} style={{ color: active ? meta.color : "currentColor" }} fill={active && level === 5 ? meta.color : "none"} />;
}

// Settings → the icon for each level: an emoji or a character or two,
// shared by every alter. Empty = the flat default.
export function PrefLevelIconsRow() {
  const { icons, setIcon, setIcons } = usePrefLevelIcons();
  const [editing, setEditing] = useState(null);
  const anyCustom = [1, 2, 3, 4, 5].some((n) => customPrefIcon(icons, n));
  return (
    <div className="py-2 space-y-1.5" data-pref-level-icons="">
      <p className="text-xs text-muted-foreground">Level icons — type an emoji under a level to change it (shared by every profile).</p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(PREF_LEVELS).map(([lvl, meta]) => {
          const n = Number(lvl);
          return (
            <label key={lvl} className="flex flex-col items-center gap-1 w-14">
              <span className="w-7 h-7 inline-flex items-center justify-center"><LevelGlyph level={n} active className="w-5 h-5" /></span>
              <input value={editing?.level === n ? editing.text : (customPrefIcon(icons, n) || "")}
                onFocus={() => setEditing({ level: n, text: customPrefIcon(icons, n) || "" })}
                onChange={(e) => setEditing({ level: n, text: e.target.value })}
                onBlur={() => { if (editing?.level === n) { setIcon(n, editing.text); setEditing(null); } }}
                aria-label={`Icon for ${meta.label}`} maxLength={4}
                className="w-11 h-8 text-center rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              <span className="text-[0.6875rem] text-muted-foreground">{meta.label}</span>
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setIcons(Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, PREF_ICON_SUGGESTIONS[n][0]])))}
          className="h-8 px-2.5 rounded-lg border border-border/60 text-xs hover:bg-muted/50">Use emoji {PREF_ICON_SUGGESTIONS[1][0]} {PREF_ICON_SUGGESTIONS[2][0]} {PREF_ICON_SUGGESTIONS[3][0]} {PREF_ICON_SUGGESTIONS[4][0]} {PREF_ICON_SUGGESTIONS[5][0]}</button>
        {anyCustom && (
          <button type="button" onClick={() => setIcons({ 1: "", 2: "", 3: "", 4: "", 5: "" })}
            className="h-8 px-2.5 rounded-lg border border-border/60 text-xs text-muted-foreground hover:bg-muted/50">Back to flat icons</button>
        )}
      </div>
    </div>
  );
}

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
            className={`${compact ? "w-6 h-6" : "w-7 h-7"} rounded-md flex items-center justify-center transition-all ${
              active ? "ring-1 scale-110" : "opacity-40 hover:opacity-100"
            }`}
            style={active ? { backgroundColor: `${meta.color}1f`, boxShadow: `inset 0 0 0 1px ${meta.color}` } : undefined}
          >
            <LevelGlyph level={n} active={active} className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
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
                  <PrefLevelIcon level={p.level} className="w-3 h-3" filled />
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
