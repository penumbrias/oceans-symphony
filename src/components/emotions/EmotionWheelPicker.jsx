import React, { useState, useMemo } from "react";
import { X, ChevronLeft, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const WHEEL = {
  good: {
    label: "Good",
    color: "#22c55e",
    bgClass: "bg-green-500/15 hover:bg-green-500/25 border-green-500/40",
    activeClass: "bg-green-500 text-white border-green-500",
    cores: {
      Happy:   { color: "#f59e0b", subs: ["Joyful","Excited","Grateful","Content","Playful","Cheerful","Amused","Delighted"] },
      Strong:  { color: "#16a34a", subs: ["Confident","Proud","Powerful","Courageous","Resilient","Motivated","Capable","Energised"] },
      Peaceful:{ color: "#0ea5e9", subs: ["Calm","Relaxed","Serene","Thankful","Hopeful","Loving","Trusting","Safe"] },
    },
  },
  bad: {
    label: "Bad",
    color: "#ef4444",
    bgClass: "bg-red-500/15 hover:bg-red-500/25 border-red-500/40",
    activeClass: "bg-red-500 text-white border-red-500",
    cores: {
      Sad:    { color: "#a855f7", subs: ["Lonely","Hurt","Depressed","Grieving","Helpless","Hopeless","Disappointed","Vulnerable"] },
      Angry:  { color: "#dc2626", subs: ["Frustrated","Furious","Annoyed","Resentful","Jealous","Betrayed","Humiliated","Dismissive"] },
      Fearful:{ color: "#7c3aed", subs: ["Anxious","Worried","Overwhelmed","Panicked","Insecure","Worthless","Excluded","Rejected"] },
    },
  },
  neutral: {
    label: "Neutral",
    color: "#6b7280",
    bgClass: "bg-gray-500/15 hover:bg-gray-500/25 border-gray-500/40",
    activeClass: "bg-gray-500 text-white border-gray-500",
    cores: null,
    flat: ["Bored","Indifferent","Detached","Ambivalent","Confused","Uncertain","Restless","Apathetic","Melancholic","Nostalgic"],
  },
  body: {
    label: "Body & Nervous System",
    color: "#f97316",
    bgClass: "bg-orange-500/15 hover:bg-orange-500/25 border-orange-500/40",
    activeClass: "bg-orange-500 text-white border-orange-500",
    cores: {
      Calm:    { color: "#84cc16", subs: ["Content","Present","Grounded","Connected","Curious","Open","Steady breath","Relaxed muscles"] },
      Flight:  { color: "#fbbf24", subs: ["Restless","Hypervigilant","Butterflies","Shallow breath","Jittery","On edge","Worried","Racing heart"] },
      Fight:   { color: "#f97316", subs: ["Rage","Furious","Tight throat","Flushed","Chest pressure","Hyper-alert","Tense","Agitated"] },
      Freeze:  { color: "#60a5fa", subs: ["Stuck","Dread","Confusion","Overwhelmed","Numb","Paralysed","Dissociated","Eyes glazed"] },
      Collapse:{ color: "#94a3b8", subs: ["Exhausted","Heavy limbs","Blank stare","Dissociation","Hopeless","Despair","Powerless","Shut down"] },
    },
  },
};

const LEGACY_PRESETS = ["Happy","Sad","Angry","Anxious","Calm","Excited","Confused","Grateful","Frustrated","Hopeful","Neutral","Overwhelmed"];

const ALL_BUILTIN = (() => {
  const out = [];
  Object.values(WHEEL).forEach(v => {
    if (v.flat) out.push(...v.flat);
    if (v.cores) Object.entries(v.cores).forEach(([core, { subs }]) => {
      out.push(core);
      out.push(...subs);
    });
  });
  return [...new Set(out)];
})();

const LS_PICKER_MODE = "symphony_emotion_picker_mode";
function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function EmotionPill({ label, selected, color, onToggle, small = false }) {
  return (
    <button
      onClick={() => onToggle(label)}
      className={`rounded-full font-medium transition-all border ${
        small ? "px-2 py-0.5 text-xs" : "px-3 py-1.5 text-xs"
      } ${selected
        ? "text-white border-transparent"
        : "bg-muted/60 text-foreground border-border/50 hover:border-border"
      }`}
      style={selected ? { backgroundColor: color, borderColor: color } : {}}
    >
      {label}
    </button>
  );
}

function InlineAddButton({ category, color, onAdd }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-dashed border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors flex items-center gap-0.5"
      >
        <Plus className="w-2.5 h-2.5" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="New..."
        className="h-6 px-2 rounded-full text-xs border border-border bg-background w-24 focus:outline-none focus:ring-1 focus:ring-primary"
        onKeyDown={e => {
          if (e.key === "Enter" && val.trim()) {
            onAdd(val.trim(), category);
            setVal("");
            setOpen(false);
          }
          if (e.key === "Escape") { setVal(""); setOpen(false); }
        }}
      />
      <button onClick={() => { setVal(""); setOpen(false); }}
        className="text-muted-foreground hover:text-foreground">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function EmotionWheelPicker({
  selectedEmotions = [],
  onToggle,
  customEmotions = [],
  onAddCustom,
}) {
  const [pickerMode,    setPickerMode]    = useState(() => lsGet(LS_PICKER_MODE, "wheel"));
  const [activeValence, setActiveValence] = useState(null);
  const [activeCore,    setActiveCore]    = useState(null);
  const [search,        setSearch]        = useState("");
  const [customInput,   setCustomInput]   = useState("");

  const handleModeToggle = (mode) => {
    setPickerMode(mode);
    lsSet(LS_PICKER_MODE, mode);
    setActiveValence(null);
    setActiveCore(null);
    setSearch("");
  };

  const handleValence = (key) => {
    if (activeValence === key) { setActiveValence(null); setActiveCore(null); }
    else { setActiveValence(key); setActiveCore(null); }
  };

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    const builtin = ALL_BUILTIN.filter(e => e.toLowerCase().includes(q));
    const custom  = customEmotions.map(c => c.label).filter(e => e.toLowerCase().includes(q));
    return [...new Set([...builtin, ...custom])];
  }, [search, customEmotions]);

  const customByCategory = useMemo(() => {
    const map = {};
    customEmotions.forEach(c => {
      const cat = c.category || "custom";
      if (!map[cat]) map[cat] = [];
      map[cat].push(c);
    });
    return map;
  }, [customEmotions]);

  const colorFor = (label) => {
    for (const v of Object.values(WHEEL)) {
      if (v.flat?.includes(label)) return v.color;
      if (v.cores) {
        for (const [core, { color, subs }] of Object.entries(v.cores)) {
          if (core === label || subs.includes(label)) return color;
        }
      }
    }
    const ce = customEmotions.find(c => c.label === label);
    if (ce?.category) {
      for (const v of Object.values(WHEEL)) {
        if (v.cores?.[ce.category]) return v.cores[ce.category].color;
        if (ce.category === "neutral") return WHEEL.neutral.color;
      }
    }
    return "hsl(var(--primary))";
  };

  const valenceData = WHEEL[activeValence];
  const coreData    = activeValence && valenceData?.cores?.[activeCore];
  const customForActiveCore = activeCore ? (customByCategory[activeCore] || []) : [];

  const handleCustomSubmit = () => {
    if (!customInput.trim()) return;
    onAddCustom?.(customInput.trim(), "custom");
    setCustomInput("");
  };

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-medium">Mode:</span>
        {["wheel", "classic"].map(m => (
          <button key={m} onClick={() => handleModeToggle(m)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
              pickerMode === m
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground border-border/50 hover:border-border"
            }`}>
            {m === "wheel" ? "🎡 Guided" : "📋 Classic"}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          placeholder="Search emotions..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-7 h-8 text-sm"
        />
        {search && (
          <button onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Search results */}
      {search.trim() && (
        <div className="space-y-1.5">
          {searchResults.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {searchResults.map(e => (
                <EmotionPill key={e} label={e} selected={selectedEmotions.includes(e)}
                  color={colorFor(e)} onToggle={onToggle} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs text-muted-foreground">No match —</p>
              <button
                onClick={() => { onAddCustom?.(search.trim(), "custom"); setSearch(""); }}
                className="text-xs text-primary underline hover:no-underline">
                add "{search.trim()}" as custom
              </button>
            </div>
          )}
        </div>
      )}

      {/* Selected chips */}
      {selectedEmotions.length > 0 && !search && (
        <div className="flex flex-wrap gap-1.5">
          {selectedEmotions.map(e => (
            <button key={e} onClick={() => onToggle(e)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: colorFor(e) }}>
              {e} <X className="w-2.5 h-2.5" />
            </button>
          ))}
        </div>
      )}

      {/* ── GUIDED MODE ── */}
      {pickerMode === "wheel" && !search && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(WHEEL).map(([key, v]) => (
              <button key={key}
                onClick={() => handleValence(key)}
                className={`py-2 px-3 rounded-xl border text-sm font-semibold transition-all text-left ${
                  activeValence === key ? v.activeClass : v.bgClass
                }`}
                style={activeValence === key ? {} : { color: v.color }}>
                {v.label}
              </button>
            ))}
          </div>

          {activeValence && valenceData && (
            <div className="rounded-xl border border-border/50 bg-muted/20 p-2.5 space-y-2">
              {activeCore && (
                <button onClick={() => setActiveCore(null)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1">
                  <ChevronLeft className="w-3 h-3" /> Back
                </button>
              )}

              {/* Flat (neutral) */}
              {valenceData.flat && !activeCore && (
                <div className="flex flex-wrap gap-1.5">
                  {valenceData.flat.map(e => (
                    <EmotionPill key={e} label={e} selected={selectedEmotions.includes(e)}
                      color={valenceData.color} onToggle={onToggle} />
                  ))}
                  {(customByCategory["neutral"] || []).map(c => (
                    <EmotionPill key={c.id} label={c.label} selected={selectedEmotions.includes(c.label)}
                      color={valenceData.color} onToggle={onToggle} />
                  ))}
                  <InlineAddButton category="neutral" color={valenceData.color}
                    onAdd={(label, cat) => onAddCustom?.(label, cat)} />
                </div>
              )}

              {/* Core buttons — flat, no collapsible */}
              {valenceData.cores && !activeCore && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(valenceData.cores).map(([core, { color }]) => (
                      <button key={core}
                        onClick={() => setActiveCore(core)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                          selectedEmotions.includes(core)
                            ? "text-white border-transparent"
                            : "bg-muted/60 text-foreground border-border/50 hover:border-border"
                        }`}
                        style={
                          selectedEmotions.includes(core)
                            ? { backgroundColor: color }
                            : { borderLeftColor: color, borderLeftWidth: 3 }
                        }>
                        {core}
                      </button>
                    ))}
                  </div>
                  {(customByCategory[activeValence] || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/30">
                      <span className="text-xs text-muted-foreground w-full">Custom:</span>
                      {(customByCategory[activeValence] || []).map(c => (
                        <EmotionPill key={c.id} label={c.label} selected={selectedEmotions.includes(c.label)}
                          color={WHEEL[activeValence]?.color || "hsl(var(--primary))"} onToggle={onToggle} small />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Sub-emotions — flat pills, no collapsible */}
              {activeCore && coreData && (
                <div className="space-y-2">
                  <EmotionPill label={activeCore} selected={selectedEmotions.includes(activeCore)}
                    color={coreData.color} onToggle={onToggle} />
                  <p className="text-xs text-muted-foreground font-medium">More specific:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {coreData.subs.map(sub => (
                      <EmotionPill key={sub} label={sub} selected={selectedEmotions.includes(sub)}
                        color={coreData.color} onToggle={onToggle} small />
                    ))}
                    {customForActiveCore.map(c => (
                      <EmotionPill key={c.id} label={c.label} selected={selectedEmotions.includes(c.label)}
                        color={coreData.color} onToggle={onToggle} small />
                    ))}
                    <InlineAddButton category={activeCore} color={coreData.color}
                      onAdd={(label, cat) => onAddCustom?.(label, cat)} />
                  </div>
                </div>
              )}
            </div>
          )}

          {(customByCategory["custom"] || []).length > 0 && (
            <div className="rounded-xl border border-border/50 bg-muted/20 p-2.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">My custom emotions</p>
              <div className="flex flex-wrap gap-1.5">
                {(customByCategory["custom"] || []).map(c => (
                  <EmotionPill key={c.id} label={c.label} selected={selectedEmotions.includes(c.label)}
                    color="hsl(var(--primary))" onToggle={onToggle} small />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CLASSIC MODE ── */}
      {pickerMode === "classic" && !search && (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Quick picks</p>
            <div className="flex flex-wrap gap-1.5">
              {LEGACY_PRESETS.map(e => (
                <EmotionPill key={e} label={e} selected={selectedEmotions.includes(e)}
                  color="hsl(var(--primary))" onToggle={onToggle} small />
              ))}
            </div>
          </div>

          {Object.entries(WHEEL).map(([key, v]) => (
            <div key={key}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: v.color }}>
                {v.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {v.flat
                  ? v.flat.map(e => (
                      <EmotionPill key={e} label={e} selected={selectedEmotions.includes(e)}
                        color={v.color} onToggle={onToggle} small />
                    ))
                  : Object.entries(v.cores).flatMap(([core, { color, subs }]) =>
                      [core, ...subs].map(e => (
                        <EmotionPill key={e} label={e} selected={selectedEmotions.includes(e)}
                          color={color} onToggle={onToggle} small />
                      ))
                    )
                }
                {(customByCategory[key] || []).map(c => (
                  <EmotionPill key={c.id} label={c.label} selected={selectedEmotions.includes(c.label)}
                    color={v.color} onToggle={onToggle} small />
                ))}
                {v.cores && Object.keys(v.cores).flatMap(core =>
                  (customByCategory[core] || []).map(c => (
                    <EmotionPill key={c.id} label={c.label} selected={selectedEmotions.includes(c.label)}
                      color={v.cores[core].color} onToggle={onToggle} small />
                  ))
                )}
              </div>
            </div>
          ))}

          {(customByCategory["custom"] || []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">My custom emotions</p>
              <div className="flex flex-wrap gap-1.5">
                {(customByCategory["custom"] || []).map(c => (
                  <EmotionPill key={c.id} label={c.label} selected={selectedEmotions.includes(c.label)}
                    color="hsl(var(--primary))" onToggle={onToggle} small />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add custom */}
      {!search && (
        <div className="flex gap-2 pt-1 border-t border-border/50">
          <Input
            placeholder="Add custom emotion..."
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleCustomSubmit(); }}
            className="h-7 text-xs flex-1"
          />
          <button onClick={handleCustomSubmit} disabled={!customInput.trim()}
            className="px-2 py-1 rounded-md bg-muted text-xs text-muted-foreground hover:bg-accent disabled:opacity-40 transition-colors">
            <Plus className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}