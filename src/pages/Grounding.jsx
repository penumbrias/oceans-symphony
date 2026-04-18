import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Shield } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import StateCheckFlow from "@/components/grounding/StateCheckFlow";
import TechniqueCard from "@/components/grounding/TechniqueCard";
import GuidedTechniqueView from "@/components/grounding/GuidedTechniqueView";
import BreathingExercise from "@/components/grounding/BreathingExercise";
import BreathingTechniquePicker from "@/components/grounding/BreathingTechniquePicker";
import CrisisResourcesCard from "@/components/grounding/CrisisResourcesCard";
import CustomTechniqueForm from "@/components/grounding/CustomTechniqueForm";
import LearnSection from "@/components/support/LearnSection";
import {
  DEFAULT_TECHNIQUES, EMOTIONAL_STATES, CATEGORY_LABELS, CATEGORY_EMOJIS,
  BREATHING_PATTERNS
} from "@/utils/groundingDefaults";

// ---- Seed helper — adds new defaults that don't exist yet by name ----
async function seedDefaultTechniques() {
  const existing = await base44.entities.GroundingTechnique.list();
  const existingNames = new Set(existing.map(t => t.name));
  const toAdd = DEFAULT_TECHNIQUES.filter(t => !existingNames.has(t.name));
  if (toAdd.length > 0) {
    await base44.entities.GroundingTechnique.bulkCreate(toAdd);
  }
}

const BREATHING_NAMES = Object.keys(BREATHING_PATTERNS);

export default function Grounding({ initialPath = null }) {
  // path: 'entry' | 'state-check' | 'suggestions' | 'all' | 'breathing' | 'guided' | 'custom-form'
  const navigate = useNavigate();
  const [path, setPath] = useState(initialPath || "entry");
  const [activeTab, setActiveTab] = useState("support"); // "support" | "learn"
  const [selectedStates, setSelectedStates] = useState([]);
  const [selectedTechnique, setSelectedTechnique] = useState(null);
  const [selectedBreathing, setSelectedBreathing] = useState(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [returnPath, setReturnPath] = useState(null); // for "try now" from Learn

  const queryClient = useQueryClient();

  const { data: supportEntries = [] } = useQuery({
    queryKey: ["supportJournalEntries"],
    queryFn: () => base44.entities.SupportJournalEntry.list(),
  });

  const hasSavedSafetyPlan = useMemo(() => {
    return supportEntries.some(e => 
      e.exercise_id === "m4_t3_safety_plan" || 
      e.exercise_id === "m6_t2_window_plan" || 
      e.exercise_id === "m6_t1_coping_cards"
    );
  }, [supportEntries]);

  const { data: techniques = [] } = useQuery({
    queryKey: ["groundingTechniques"],
    queryFn: () => base44.entities.GroundingTechnique.list(),
  });

  const { data: preferences = [] } = useQuery({
    queryKey: ["groundingPreferences"],
    queryFn: () => base44.entities.GroundingPreference.list(),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: frontingSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });

  useEffect(() => {
    if (!seeded) {
      seedDefaultTechniques().then(() => {
        queryClient.invalidateQueries({ queryKey: ["groundingTechniques"] });
        setSeeded(true);
      });
    }
  }, [seeded]);

  const currentFronter = useMemo(() => {
    const active = frontingSessions.find(s => s.is_primary && s.alter_id);
    if (active) return alters.find(a => a.id === active.alter_id) || null;
    const any = frontingSessions.find(s => s.alter_id);
    if (any) return alters.find(a => a.id === any.alter_id) || null;
    return null;
  }, [frontingSessions, alters]);

  const prefMap = useMemo(() => {
    const m = {};
    preferences.forEach(p => { m[p.technique_id] = p; });
    return m;
  }, [preferences]);

  const visibleTechniques = techniques.filter(t => !t.is_archived);

  const handleToggleFavorite = async (technique) => {
    const pref = prefMap[technique.id];
    if (pref) {
      await base44.entities.GroundingPreference.update(pref.id, { is_favorited: !pref.is_favorited });
    } else {
      await base44.entities.GroundingPreference.create({ technique_id: technique.id, is_favorited: true });
    }
    queryClient.invalidateQueries({ queryKey: ["groundingPreferences"] });
  };

  const handleRate = async (technique, rating, alterId) => {
    const pref = prefMap[technique.id];
    if (pref) {
      await base44.entities.GroundingPreference.update(pref.id, { rating, alter_id: alterId || null });
    } else {
      await base44.entities.GroundingPreference.create({ technique_id: technique.id, rating, alter_id: alterId || null });
    }
    queryClient.invalidateQueries({ queryKey: ["groundingPreferences"] });
  };

  const handleSaveNote = async (technique, notes, alterId) => {
    const pref = prefMap[technique.id];
    if (pref) {
      await base44.entities.GroundingPreference.update(pref.id, { notes, alter_id: alterId || null });
    } else {
      await base44.entities.GroundingPreference.create({ technique_id: technique.id, notes, alter_id: alterId || null });
    }
    queryClient.invalidateQueries({ queryKey: ["groundingPreferences"] });
  };

  const handleStateCheckComplete = (states) => {
    setSelectedStates(states);
    setPath("suggestions");
  };

  const handleOpenTechnique = (technique, fromLearn = false) => {
    setSelectedTechnique(technique);
    if (fromLearn) setReturnPath("learn");
    setPath("guided");
  };

  const handleTryTechniqueByName = (name) => {
    const t = visibleTechniques.find(x => x.name === name);
    if (t) handleOpenTechnique(t, true);
  };

  const handleStartBreathing = (name) => {
    setSelectedBreathing(name);
    setPath("breathing");
  };

  const hasCrisis = selectedStates.includes("crisis");

  const suggestedTechniques = useMemo(() => {
    if (selectedStates.length === 0) return [];
    return visibleTechniques.filter(t =>
      t.category !== "breathing" &&
      t.suggested_for?.some(s => selectedStates.includes(s))
    ).slice(0, 3);
  }, [visibleTechniques, selectedStates]);

  const suggestedBreathing = useMemo(() => {
    if (selectedStates.length === 0) return null;
    const state = EMOTIONAL_STATES.find(s => selectedStates.includes(s.id));
    return state?.suggested_breathing || "Box breathing";
  }, [selectedStates]);

  const byCategory = useMemo(() => {
    const map = {};
    visibleTechniques.filter(t => t.category !== "breathing").forEach(t => {
      if (!map[t.category]) map[t.category] = [];
      map[t.category].push(t);
    });
    return map;
  }, [visibleTechniques]);

  const breathingTechniques = useMemo(() =>
    visibleTechniques.filter(t => t.category === "breathing"),
    [visibleTechniques]
  );

  const favorites = useMemo(() =>
    visibleTechniques.filter(t => prefMap[t.id]?.is_favorited),
    [visibleTechniques, prefMap]
  );

  // ---- Render paths ----

  if (path === "guided" && selectedTechnique) {
    return (
      <div className="max-w-lg mx-auto p-4 h-full flex flex-col">
        <GuidedTechniqueView
          technique={selectedTechnique}
          preference={prefMap[selectedTechnique.id]}
          currentAlter={currentFronter}
          alters={alters.filter(a => !a.is_archived)}
          onBack={() => {
            if (returnPath === "learn") {
              setReturnPath(null);
              setActiveTab("learn");
              setPath("entry");
            } else {
              setPath("all");
            }
          }}
          backLabel={returnPath === "learn" ? "Back to lesson" : undefined}
          onRate={handleRate}
          onSaveNote={handleSaveNote}
          onToggleFavorite={handleToggleFavorite}
        />
      </div>
    );
  }

  if (path === "breathing-picker") {
    return (
      <BreathingTechniquePicker
        onSelect={(name) => {
          setSelectedBreathing(name);
          setPath("breathing");
        }}
        onBack={() => setPath("entry")}
      />
    );
  }

  if (path === "breathing") {
    return (
      <div className="max-w-lg mx-auto p-4">
        <BreathingExercise
          patternName={selectedBreathing || "Box breathing"}
          onStop={() => setPath("entry")}
          onComplete={() => setPath("entry")}
        />
      </div>
    );
  }

  if (path === "state-check") {
    return (
      <div className="max-w-lg mx-auto p-4">
        <StateCheckFlow
          onComplete={handleStateCheckComplete}
          onBack={() => setPath("entry")}
        />
      </div>
    );
  }

  if (path === "suggestions") {
    return (
      <div className="max-w-lg mx-auto p-4 space-y-6">
        <div>
          <button onClick={() => setPath("state-check")} className="text-xs text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 transition-colors">
            ← Change what I'm feeling
          </button>
          <h2 className="text-lg font-semibold text-foreground">What might help</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Based on what you're experiencing</p>
        </div>

        {/* Suggested breathing */}
        {suggestedBreathing && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Start with breathing</p>
            <button
              onClick={() => handleStartBreathing(suggestedBreathing)}
              className="w-full text-left bg-primary/10 border border-primary/30 rounded-xl p-4 hover:bg-primary/15 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🌬️</span>
                <div>
                  <p className="font-medium text-sm text-primary">{suggestedBreathing}</p>
                  <p className="text-xs text-muted-foreground">
                    {BREATHING_PATTERNS[suggestedBreathing]?.pattern || ""}
                  </p>
                </div>
                <span className="ml-auto text-primary text-sm">→</span>
              </div>
            </button>
          </div>
        )}

        {/* Top suggested techniques */}
        {suggestedTechniques.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Suggested for you</p>
            <div className="space-y-2">
              {suggestedTechniques.map(t => (
                <TechniqueCard
                  key={t.id}
                  technique={t}
                  preference={prefMap[t.id]}
                  onTap={handleOpenTechnique}
                  onToggleFavorite={handleToggleFavorite}
                  onRate={handleRate}
                />
              ))}
            </div>
          </div>
        )}

        {/* Crisis resources */}
        {hasCrisis && <CrisisResourcesCard />}

        <button onClick={() => setPath("all")} className="text-sm text-primary hover:underline">
          Browse all techniques →
        </button>
      </div>
    );
  }

  // "all" and "entry" share the all-techniques view
  if (path === "all") {
    return (
      <div className="max-w-lg mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">All techniques</h2>
            <p className="text-sm text-muted-foreground">Browse and save what works for you</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowCustomForm(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add your own
          </Button>
        </div>

        {/* Favorites */}
        {favorites.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">My favorites ♥</p>
            <div className="space-y-2">
              {favorites.map(t => (
                <TechniqueCard key={t.id} technique={t} preference={prefMap[t.id]}
                  onTap={handleOpenTechnique} onToggleFavorite={handleToggleFavorite} onRate={handleRate} />
              ))}
            </div>
          </div>
        )}

        {/* Breathing */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">🌬️ Breathing</p>
          <div className="space-y-2">
            {BREATHING_NAMES.map(name => (
              <button key={name} onClick={() => handleStartBreathing(name)}
                className="w-full text-left bg-card border border-border/60 rounded-xl p-3 hover:border-primary/30 hover:bg-primary/5 transition-all">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium text-sm text-foreground">{name}</p>
                    <p className="text-xs text-muted-foreground">{BREATHING_PATTERNS[name]?.pattern}</p>
                  </div>
                  <span className="ml-auto text-muted-foreground text-sm">→</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* All other categories */}
        {Object.entries(byCategory).map(([cat, techs]) => (
          <div key={cat}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {CATEGORY_EMOJIS[cat]} {CATEGORY_LABELS[cat]}
            </p>
            <div className="space-y-2">
              {techs.map(t => (
                <TechniqueCard key={t.id} technique={t} preference={prefMap[t.id]}
                  onTap={handleOpenTechnique} onToggleFavorite={handleToggleFavorite} onRate={handleRate} />
              ))}
            </div>
          </div>
        ))}

        {showCustomForm && (
          <CustomTechniqueForm
            onClose={() => setShowCustomForm(false)}
            onSaved={() => {
              setShowCustomForm(false);
              queryClient.invalidateQueries({ queryKey: ["groundingTechniques"] });
            }}
          />
        )}
      </div>
    );
  }

  // Tab bar shown on entry
  const TabBar = () => (
    <div className="flex border-b border-border/60 mb-6 sticky top-0 bg-background z-10">
      {[
        { id: "support", label: "Support" },
        { id: "learn", label: "Learn" },
      ].map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === tab.id
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  if (activeTab === "learn") {
    return (
      <div className="max-w-xl mx-auto">
        <TabBar />
        <LearnSection onTryTechnique={handleTryTechniqueByName} />
      </div>
    );
  }

  // Entry screen (Support tab)
  return (
    <div className="max-w-lg mx-auto px-4">
      <TabBar />
      <div className="space-y-8">
        <div className="text-center space-y-2 pt-4">
          <p className="text-3xl">🫧</p>
          <h1 className="text-2xl font-semibold text-foreground">Quick support</h1>
          <p className="text-sm text-muted-foreground">Let's find something that might help right now.</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => setPath("all")}
            className="w-full text-left bg-card border border-border/60 rounded-lg p-4 hover:border-primary/30 hover:bg-primary/5 transition-all flex items-center justify-between group"
          >
            <div>
              <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">Browse all</p>
              <p className="text-xs text-muted-foreground mt-0.5">All techniques by category</p>
            </div>
            <span className="text-muted-foreground group-hover:text-primary text-lg transition-colors ml-3 flex-shrink-0">→</span>
          </button>

          <button
            onClick={() => setPath("state-check")}
            className="w-full text-left bg-card border border-border/60 rounded-lg p-4 hover:border-primary/30 hover:bg-primary/5 transition-all flex items-center justify-between group"
          >
            <div>
              <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">Help me figure out what I need</p>
              <p className="text-xs text-muted-foreground mt-0.5">Quick check-in → tailored suggestions</p>
            </div>
            <span className="text-muted-foreground group-hover:text-primary text-lg transition-colors ml-3 flex-shrink-0">→</span>
          </button>

          <button
            onClick={() => setPath("breathing-picker")}
            className="w-full text-left bg-card border border-border/60 rounded-lg p-4 hover:border-primary/30 hover:bg-primary/5 transition-all flex items-center justify-between group"
          >
            <div>
              <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">Guided breathing</p>
              <p className="text-xs text-muted-foreground mt-0.5">Choose a breathing technique</p>
            </div>
            <span className="text-muted-foreground group-hover:text-primary text-lg transition-colors ml-3 flex-shrink-0">→</span>
          </button>

          {/* My Safety Plan footer */}
          <button
            onClick={() => navigate("/safety-plan")}
            className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 border-t border-border/30 mt-2"
          >
            <Shield className="w-4 h-4" />
            {hasSavedSafetyPlan ? "View my safety plan" : "Build my safety plan"}
          </button>
        </div>
      </div>
    </div>
  );
}