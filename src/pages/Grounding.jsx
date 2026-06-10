import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Shield, Shuffle, AlertTriangle } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import StateCheckFlow from "@/components/grounding/StateCheckFlow";
import TechniqueCard from "@/components/grounding/TechniqueCard";
import GuidedTechniqueView from "@/components/grounding/GuidedTechniqueView";
import BreathingExercise from "@/components/grounding/BreathingExercise";
import BreathingTechniquePicker from "@/components/grounding/BreathingTechniquePicker";
import CrisisResourcesCard from "@/components/grounding/CrisisResourcesCard";
import CustomTechniqueForm from "@/components/grounding/CustomTechniqueForm";
import LearnSection from "@/components/support/LearnSection";
import MedicalDisclaimer from "@/components/shared/MedicalDisclaimer";
import {
  DEFAULT_TECHNIQUES, EMOTIONAL_STATES, CATEGORY_LABELS, CATEGORY_EMOJIS,
  BREATHING_PATTERNS, resolveCategory
} from "@/utils/groundingDefaults";

// Decorative breathing pacer rendered at the bottom of the Quick
// Support suggestions view. Slowly grows and shrinks an SVG ring on
// a 5s loop (~2.5s expand = inhale, ~2.5s contract = exhale) — a
// calming, no-pressure visual without being a full guided exercise.
// Skips animating entirely when the user has reduce-motion on (the
// accessibility hook sets the .a11y-reduce-motion root class).
function CalmingBreathPacer() {
  return (
    <div className="flex flex-col items-center gap-2 py-6 select-none" aria-hidden="true">
      <style>{`
        @keyframes calmingBreath {
          0%   { transform: scale(0.85); opacity: 0.55; }
          50%  { transform: scale(1.10); opacity: 1; }
          100% { transform: scale(0.85); opacity: 0.55; }
        }
        .calming-breath-ring {
          animation: calmingBreath 5s ease-in-out infinite;
        }
        .a11y-reduce-motion .calming-breath-ring {
          animation: none;
          opacity: 0.7;
          transform: scale(1);
        }
      `}</style>
      <div className="relative w-20 h-20 flex items-center justify-center">
        <div
          className="calming-breath-ring absolute inset-0 rounded-full border-2 border-primary/40"
          style={{ background: "radial-gradient(circle, hsl(var(--primary) / 0.18) 0%, transparent 70%)" }}
        />
      </div>
      <p className="text-[0.6875rem] text-muted-foreground italic">Breathe with the ring if it helps.</p>
    </div>
  );
}

// ---- Seed helper — adds new defaults that don't exist yet by name,
// and (post-restore cleanup) collapses any duplicate is_default rows
// that share a known-default name. Backups made before 0.17.23
// exported defaults, so a user who restored more than once accumulated
// 2-5x copies of every preset. This runs on every Grounding-page mount
// and is bounded to records matching DEFAULT_TECHNIQUES.name with
// is_default: true — user customs are never touched.
async function seedDefaultTechniques() {
  const existing = await base44.entities.GroundingTechnique.list();

  // Collapse duplicates: group is_default rows by name (where the name
  // is a known default), keep the first by created_date, delete the
  // rest. Wrapped in try/catch per delete so one failure doesn't abort
  // seeding.
  const defaultNames = new Set(DEFAULT_TECHNIQUES.map((t) => t.name));
  const groups = new Map();
  for (const t of existing) {
    if (!t || !defaultNames.has(t.name) || !t.is_default) continue;
    if (!groups.has(t.name)) groups.set(t.name, []);
    groups.get(t.name).push(t);
  }
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => {
      const ta = a.created_date ? new Date(a.created_date).getTime() : 0;
      const tb = b.created_date ? new Date(b.created_date).getTime() : 0;
      return ta - tb;
    });
    for (const dup of group.slice(1)) {
      try { await base44.entities.GroundingTechnique.delete(dup.id); } catch {}
    }
  }

  // Original seed-missing-defaults path. Re-read existing to reflect
  // the dedupe above.
  const fresh = await base44.entities.GroundingTechnique.list();
  const existingNames = new Set(fresh.map((t) => t.name));
  const toAdd = DEFAULT_TECHNIQUES.filter((t) => !existingNames.has(t.name));
  if (toAdd.length > 0) {
    await base44.entities.GroundingTechnique.bulkCreate(toAdd);
  }
}

const BREATHING_NAMES = Object.keys(BREATHING_PATTERNS);

export default function Grounding({ initialPath = null }) {
  // path: 'entry' | 'state-check' | 'suggestions' | 'all' | 'breathing' | 'guided' | 'custom-form'
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [path, setPath] = useState(initialPath || "entry");
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") === "learn" ? "learn" : "support"); // "support" | "learn"
  // Deep-link to a Learn lesson (e.g. the safety-plan button → /grounding?tab=learn&topic=m4_t3).
  const deepLinkTopicId = searchParams.get("topic");
  const [selectedStates, setSelectedStates] = useState([]);
  const [selectedTechnique, setSelectedTechnique] = useState(null);
  const [selectedBreathing, setSelectedBreathing] = useState(null);
  // Remembers which path opened the breathing exercise so we can return
  // the user to it after they finish. Without this, finishing a breathing
  // exercise launched from the "Help me figure out what I need" flow
  // (path === "suggestions") would drop the user back at the main entry
  // screen and the state-check answers + suggested techniques would
  // appear to vanish — that's the tester report we're fixing.
  const [breathingReturnPath, setBreathingReturnPath] = useState(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [returnPath, setReturnPath] = useState(null); // for "try now" from Learn
  const [seenTechniqueIds, setSeenTechniqueIds] = useState([]);
  const [shuffledIds, setShuffledIds] = useState(null); // null = use default suggestion logic
  const [suggestionFadeKey, setSuggestionFadeKey] = useState(0);

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
    setShuffledIds(null);
    setSeenTechniqueIds([]);
    setSuggestionFadeKey(0);
    setPath("suggestions");
  };

  const handleOpenTechnique = (technique, fromLearn = false) => {
    setSelectedTechnique(technique);
    if (fromLearn) setReturnPath("learn");
    // Remember whether the user opened the technique from the Quick
    // Support suggestions screen so Back can return there instead of
    // dumping them at the all-techniques view (which used to lose the
    // context of the state-check answers they just gave).
    else if (path === "suggestions") setReturnPath("suggestions");
    else setReturnPath(null);
    setPath("guided");
  };

  const handleTryTechniqueByName = (name) => {
    const t = visibleTechniques.find(x => x.name === name);
    if (t) handleOpenTechnique(t, true);
  };

  const handleStartBreathing = (name) => {
    // Remember the screen the user came from so we can return them
    // there after the exercise. Only "suggestions" gets bookmarked —
    // entry/picker are stateless landing pages and settling back to
    // entry is the saner behaviour for them.
    setBreathingReturnPath(path === "suggestions" ? "suggestions" : null);
    setSelectedBreathing(name);
    setPath("breathing");
  };

  const hasCrisis = selectedStates.includes("crisis");

  const suggestedTechniques = useMemo(() => {
    if (selectedStates.length === 0) return [];
    if (shuffledIds) {
      return visibleTechniques.filter(t => shuffledIds.includes(t.id));
    }
    return visibleTechniques.filter(t =>
      t.category !== "breathing" &&
      t.suggested_for?.some(s => selectedStates.includes(s))
    ).slice(0, 3);
  }, [visibleTechniques, selectedStates, shuffledIds]);

  const handleReshuffle = useCallback(() => {
    const currentIds = new Set(suggestedTechniques.map(t => t.id));
    const pool = visibleTechniques.filter(t =>
      t.category !== "breathing" &&
      t.suggested_for?.some(s => selectedStates.includes(s))
    );

    let excluded = new Set([...seenTechniqueIds, ...currentIds]);
    let available = pool.filter(t => !excluded.has(t.id));

    // If pool exhausted, reset and use full pool minus current
    if (available.length < 3) {
      setSeenTechniqueIds([]);
      excluded = new Set(currentIds);
      available = pool.filter(t => !excluded.has(t.id));
    }

    // Shuffle available
    const shuffled = [...available].sort(() => Math.random() - 0.5).slice(0, 3);

    setSeenTechniqueIds(prev => [...new Set([...prev, ...currentIds])]);
    setShuffledIds(shuffled.map(t => t.id));
    setSuggestionFadeKey(k => k + 1);
  }, [suggestedTechniques, visibleTechniques, selectedStates, seenTechniqueIds]);

  const suggestedBreathing = useMemo(() => {
    if (selectedStates.length === 0) return null;
    const state = EMOTIONAL_STATES.find(s => selectedStates.includes(s.id));
    return state?.suggested_breathing || "Box breathing";
  }, [selectedStates]);

  const byCategory = useMemo(() => {
    const map = {};
    // Resolve legacy "visualization" records into the merged "imagery"
    // bucket so old user records still display under the right heading.
    visibleTechniques.filter(t => t.category !== "breathing").forEach(t => {
      const cat = resolveCategory(t.category);
      if (!map[cat]) map[cat] = [];
      map[cat].push(t);
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
            } else if (returnPath === "suggestions") {
              setReturnPath(null);
              setPath("suggestions");
            } else {
              setPath("all");
            }
          }}
          backLabel={returnPath === "learn" ? "Back to lesson" : returnPath === "suggestions" ? "Back to suggestions" : undefined}
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
    const exitBreathing = () => {
      const next = breathingReturnPath || "entry";
      setBreathingReturnPath(null);
      setPath(next);
    };
    return (
      <div className="max-w-lg mx-auto p-4">
        <BreathingExercise
          patternName={selectedBreathing || "Box breathing"}
          onStop={exitBreathing}
          onComplete={exitBreathing}
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
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Suggested for you</p>
              <button
                onClick={handleReshuffle}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
              >
                <Shuffle className="w-3.5 h-3.5" />
                More suggestions
              </button>
            </div>
            <div
              key={suggestionFadeKey}
              className="space-y-2"
              style={{ animation: "suggestionFadeIn 0.3s ease-out" }}
            >
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

        {/* Primary navigation footer — give users two clear exits:
            browsing all techniques, or fully leaving Quick Support
            back to the Support entry screen. Previously the only
            paths out were the small "Change what I'm feeling" link
            and the "Browse all techniques →" text link, both of
            which read as continuations rather than escapes. */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setPath("all")}
            className="px-3 py-2.5 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 text-sm text-primary font-medium transition-colors"
          >
            Browse all techniques →
          </button>
          <button
            onClick={() => setPath("entry")}
            className="px-3 py-2.5 rounded-xl border border-border/60 bg-card hover:bg-muted/30 text-sm text-muted-foreground font-medium transition-colors"
          >
            ← Back to Quick Support
          </button>
        </div>

        {/* Calming breathing pacer to fill the trailing space — the
            ring slowly grows and shrinks on a 4s loop (inhale ~2s,
            exhale ~2s). Purely decorative; no interaction. Respects
            prefers-reduced-motion via the .a11y-reduce-motion root
            class set by the accessibility hook. */}
        <CalmingBreathPacer />
      </div>
    );
  }

  // "all" and "entry" share the all-techniques view
  if (path === "all") {
    return (
      <div className="max-w-lg mx-auto p-4 space-y-6">
        {/* "Back to Quick Support" exit at the top of the catalogue
            so the user can return to the Quick Support entry / state-
            check flow without using the device back button. Matches
            the small back-link convention used elsewhere in the
            Grounding flow (state-check, suggestions). */}
        <button
          onClick={() => setPath("entry")}
          className="text-xs text-muted-foreground hover:text-foreground -mb-2 flex items-center gap-1 transition-colors"
        >
          ← Back to Quick Support
        </button>
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
    <div data-tour="grounding-tabs" className="flex border-b border-border/60 mb-6 sticky top-0 bg-background z-10">
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
        <LearnSection onTryTechnique={handleTryTechniqueByName} initialTopicId={deepLinkTopicId} />
      </div>
    );
  }

  // Entry screen (Support tab)
  return (
    <div data-tour="grounding-content" className="max-w-lg mx-auto px-4">
      <TabBar />
      <div className="space-y-8">
        <div className="text-center space-y-2 pt-4">
          <p className="text-3xl">🫧</p>
          <h1 className="text-2xl font-semibold text-foreground">Quick support</h1>
          <p className="text-sm text-muted-foreground">Let's find something that might help right now.</p>
        </div>

        <details className="rounded-xl border border-amber-500/30 bg-amber-500/5">
          <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer text-sm font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4" />
            Disclaimer — Oceans Symphony is not a medical product
          </summary>
          <div className="px-3 pb-3 pt-1">
            <MedicalDisclaimer compact />
          </div>
        </details>

        <div className="space-y-3">
          <button
            data-tour="grounding-browse"
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
            data-tour="grounding-state-check"
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
            data-tour="grounding-breathing"
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