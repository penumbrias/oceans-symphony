// The Support room (board 15-SupportPhone; plan step 3.1, "the fire exit").
// House mode only, on /grounding. It works with no data at all: the help
// panel, the crisis lines and breathing need no record, and the built-in
// techniques are seeded on the first visit (seedDefaultTechniques).
//
//   entry        Need help right now? · Ground (favourites first) · Learn ·
//                Not medical advice · the now-playing bar
//   ?view=need          What do I need? (the state check)
//   ?view=suggestions   what might help, for the states picked
//   ?view=all           every technique, by kind, with favourites
//   ?view=breathing     a breathing run (&pattern=)
//   ?view=guided        one technique, step by step (&technique=)
//   ?view=soundscape | nature | scratchpad   the Soundscape
//   ?tab=learn          Learn (&topic= opens a lesson)
//
// Every view is a URL so the phone's back gesture steps back into the room
// instead of leaving Support. Writes only through the existing paths:
// favourites, ratings and notes through groundingPreferences.js, new
// techniques through CustomTechniqueForm, Learn's answers through its own
// components. Leaving the room stops the sounds unless the person chose to
// keep them playing (the old page's rule).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Shuffle, Plus, ArrowLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { seedDefaultTechniques } from "@/lib/groundingEntry";
import { groundingPreferenceHandlers } from "@/lib/groundingPreferences";
import { stopNature } from "@/lib/natureSounds/naturePlayer";
import { readNaturePrefs } from "@/lib/natureSounds/naturePrefs";
import { NATURE_SOUNDS } from "@/lib/natureSounds/catalog";
import { stopSoundscape } from "@/lib/soundscape/engine";
import { stopDistractionFree, isFocusQuiet } from "@/lib/soundscape/focusMode";
import { readSoundscapePrefs, writeSoundscapePrefs } from "@/lib/soundscape/soundscapePrefs";
import { EMOTIONAL_STATES, CATEGORY_LABELS, BREATHING_PATTERNS, resolveCategory } from "@/utils/groundingDefaults";
import StateCheckFlow from "@/components/grounding/StateCheckFlow";
import GuidedTechniqueView from "@/components/grounding/GuidedTechniqueView";
import BreathingExercise from "@/components/grounding/BreathingExercise";
import CustomTechniqueForm from "@/components/grounding/CustomTechniqueForm";
import CrisisResourcesCard from "@/components/grounding/CrisisResourcesCard";
import SoundscapeView from "@/components/grounding/soundscape/SoundscapeView";
import LearnSection from "@/components/support/LearnSection";
import { CURRICULUM } from "@/components/support/TopicView";
import { Button, IconButton } from "@/house/kit/Button";
import { Panel } from "@/house/kit/Panel";
import { Row } from "@/house/kit/Content";
import { EmptyBlock } from "@/house/kit/States";
import {
  supportView, supportViewSearch, statesFrom, groundTiles, learnSummary, suggestFor, latestSafetyEntries,
} from "@/house/support/supportModel";
import { NotMedicalPanel, CallSomeoneSheet, NowPlayingBar, useStepBack } from "@/house/support/supportParts";

const STATE_IDS = EMOTIONAL_STATES.map((s) => s.id);
const BREATHING_NAMES = Object.keys(BREATHING_PATTERNS);
const TOPICS = CURRICULUM.flatMap((m) => (m.topics || []).map((t) => ({ ...t, moduleId: m.id })));

function useSupportData() {
  const qc = useQueryClient();
  const { data: techniques = [] } = useQuery({ queryKey: ["groundingTechniques"], queryFn: () => base44.entities.GroundingTechnique.list() });
  const { data: preferences = [] } = useQuery({ queryKey: ["groundingPreferences"], queryFn: () => base44.entities.GroundingPreference.list() });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: activeFront = [] } = useQuery({ queryKey: ["activeFront"], queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }) });
  const { data: supportEntries = [] } = useQuery({ queryKey: ["supportJournalEntries"], queryFn: () => base44.entities.SupportJournalEntry.list() });
  const { data: learningProgress = [] } = useQuery({ queryKey: ["learningProgress"], queryFn: () => base44.entities.LearningProgress.list() });
  // The built-in techniques, seeded once per visit (folds duplicate built-ins).
  useEffect(() => {
    let live = true;
    seedDefaultTechniques().then(() => { if (live) qc.invalidateQueries({ queryKey: ["groundingTechniques"] }); }).catch(() => {});
    return () => { live = false; };
  }, [qc]);
  const visible = useMemo(() => techniques.filter((t) => !t.is_archived), [techniques]);
  const prefMap = useMemo(() => Object.fromEntries(preferences.map((p) => [p.technique_id, p])), [preferences]);
  const favourites = useMemo(() => visible.filter((t) => prefMap[t.id]?.is_favorited), [visible, prefMap]);
  const currentFronter = useMemo(() => {
    const s = activeFront.find((x) => x.is_primary && x.alter_id) || activeFront.find((x) => x.alter_id);
    return s ? alters.find((a) => a.id === s.alter_id) || null : null;
  }, [activeFront, alters]);
  const handlers = useMemo(() => groundingPreferenceHandlers(() => qc.invalidateQueries({ queryKey: ["groundingPreferences"] })), [qc]);
  const safety = latestSafetyEntries(supportEntries);
  const hasPlan = !!(safety.plan || safety.cards || safety.window);
  return { visible, prefMap, favourites, alters, currentFronter, handlers, hasPlan, learningProgress, qc };
}

function ViewPanel({ title, onBack, backLabel = "Back to Support", tools, children, className = "" }) {
  return (
    <Panel title={title} className={`hs-panel hs-view ${className}`}
      tools={<span className="hs-tools">{tools}<Button rank="quiet" icon={ArrowLeft} onClick={onBack}>{backLabel}</Button></span>}>
      {children}
    </Panel>
  );
}

// ── The entry (board 15) ───────────────────────────────────────────────
function SupportEntry({ data, go }) {
  const navigate = useNavigate();
  const [callOpen, setCallOpen] = useState(false);
  const tiles = groundTiles({
    favourites: data.favourites, techniques: data.visible, natureCount: NATURE_SOUNDS.length,
    categoryLabel: (t) => (CATEGORY_LABELS[resolveCategory(t.category)] || "favourite").toLowerCase(),
  });
  const learn = learnSummary(TOPICS, data.learningProgress);
  const open = (tile) => {
    if (tile.kind === "breathe") go("breathing", { pattern: tile.pattern });
    else if (tile.kind === "technique") (tile.id ? go("guided", { technique: tile.id }) : go("all"));
    else if (tile.kind === "nature") go("nature");
    else if (tile.kind === "checkin") navigate("/?action=quick-checkin");
    else if (tile.kind === "go") navigate(tile.path);
  };
  return (
    <>
      <section className="hs-help" aria-labelledby="hs-help-t" data-tour="support-need-help">
        <h2 id="hs-help-t" className="hs-help-title house-label">Need help right now?</h2>
        <p className="hs-mut">Your safety plan and the people you listed are one tap away.</p>
        <div className="hs-two">
          <Button rank="primary" onClick={() => navigate("/safety-plan")}>{data.hasPlan ? "Safety plan" : "Build a safety plan"}</Button>
          <Button rank="secondary" aria-haspopup="dialog" onClick={() => setCallOpen(true)}>Call someone</Button>
        </div>
      </section>

      <Panel title="Ground" className="hs-panel hs-ground" tools={<span>{data.favourites.length ? "favourites first" : "pick one"}</span>}>
        <div className="hs-tiles" data-tour="grounding-content">
          {tiles.map((t) => (
            <Button key={t.key} rank="secondary" className="hs-tile" onClick={() => open(t)}
              data-tour={t.key === "breathe" ? "grounding-breathing" : t.key === "nature" ? "grounding-soundscape" : undefined}>
              <span className="hs-tile-in">
                <span className="hs-tile-name">{t.name}</span>
                <span className="hs-tile-sub">{t.sub}</span>
              </span>
            </Button>
          ))}
        </div>
        <div className="hs-row hs-ground-more">
          <Button rank="quiet" onClick={() => go("need")} data-tour="grounding-state-check">What do I need?</Button>
          <Button rank="quiet" onClick={() => go("all")} data-tour="grounding-browse">{`All ${data.visible.length || ""} techniques`.replace("  ", " ")}</Button>
          <Button rank="quiet" onClick={() => go("soundscape")}>Soundscape</Button>
        </div>
      </Panel>

      <Panel title="Learn" className="hs-panel hs-learn"
        tools={<Button rank="quiet" onClick={() => go("learn")} data-tour="support-learn">{`${learn.done} of ${learn.total} topics`}</Button>}>
        <ul className="hs-list" aria-label="Lessons">
          {learn.rows.map((t) => (
            <li key={t.id} className="hs-learn-row">
              <Row title={t.title} onClick={() => go("learn", { topic: t.id })}
                meta={<span className="hs-state" data-state={t.state.replace(" ", "-")}>{t.state}</span>} />
            </li>
          ))}
        </ul>
      </Panel>

      <NotMedicalPanel />
      <CallSomeoneSheet open={callOpen} onClose={() => setCallOpen(false)} />
    </>
  );
}

// ── What do I need → what might help ───────────────────────────────────
function SuggestionsView({ data, states, go, back }) {
  const [shuffled, setShuffled] = useState(null);
  const [seen, setSeen] = useState([]);
  const pool = suggestFor(data.visible, states);
  const shown = shuffled ? data.visible.filter((t) => shuffled.includes(t.id)) : pool.slice(0, 3);
  const reshuffle = () => {
    const current = shown.map((t) => t.id);
    let avail = suggestFor(data.visible, states, { exclude: [...seen, ...current] });
    let nextSeen = [...new Set([...seen, ...current])];
    if (avail.length < 3) { avail = suggestFor(data.visible, states, { exclude: current }); nextSeen = []; }
    setSeen(nextSeen);
    setShuffled([...avail].sort(() => Math.random() - 0.5).slice(0, 3).map((t) => t.id));
  };
  const first = EMOTIONAL_STATES.find((s) => states.includes(s.id));
  const breath = first?.suggested_breathing || "Box breathing";
  return (
    <ViewPanel title="What might help" onBack={back}>
      <p className="hs-mut">Based on what you're feeling. Skip anything that doesn't fit.</p>
      {states.includes("crisis") ? <div className="hs-oldtext"><CrisisResourcesCard defaultOpen /></div> : null}
      <p className="hs-label house-label">Start with breathing</p>
      <Button rank="primary" block onClick={() => go("breathing", { pattern: breath })}>
        {`${breath}${BREATHING_PATTERNS[breath]?.pattern ? `: ${BREATHING_PATTERNS[breath].pattern}` : ""}`}
      </Button>
      {shown.length ? (
        <>
          <div className="hs-labelrow">
            <p className="hs-label house-label">Suggested for you</p>
            <Button rank="quiet" icon={Shuffle} onClick={reshuffle}>More suggestions</Button>
          </div>
          <TechniqueList items={shown} data={data} onOpen={(t) => go("guided", { technique: t.id })} />
        </>
      ) : null}
      <div className="hs-row">
        <Button rank="secondary" onClick={() => go("need", { states: states.join(",") })}>Change what I'm feeling</Button>
        <Button rank="secondary" onClick={() => go("all")}>All techniques</Button>
      </div>
    </ViewPanel>
  );
}

function TechniqueList({ items, data, onOpen }) {
  return (
    <ul className="hs-list">
      {items.map((t) => {
        const fav = !!data.prefMap[t.id]?.is_favorited;
        const rating = data.prefMap[t.id]?.rating;
        return (
          <li key={t.id} className="hs-tech">
            <Row title={t.name} subtitle={t.duration_minutes ? `${t.duration_minutes} min` : (t.description || "").slice(0, 80) || null}
              meta={rating ? `${"★".repeat(Math.max(0, Math.min(5, rating)))}` : null} onClick={() => onOpen(t)} />
            <IconButton icon={Heart} label={fav ? `Take ${t.name} out of favourites` : `Favourite ${t.name}`}
              aria-pressed={fav} className="hs-fav" data-on={fav || undefined}
              onClick={() => data.handlers.onToggleFavorite(t)} />
          </li>
        );
      })}
    </ul>
  );
}

function AllTechniquesView({ data, go, back }) {
  const [adding, setAdding] = useState(false);
  const byCat = useMemo(() => {
    const m = {};
    for (const t of data.visible.filter((x) => x.category !== "breathing")) {
      const c = resolveCategory(t.category);
      (m[c] = m[c] || []).push(t);
    }
    return m;
  }, [data.visible]);
  return (
    <ViewPanel title="All techniques" onBack={back}
      tools={<Button rank="quiet" icon={Plus} onClick={() => setAdding(true)}>Add your own</Button>}>
      {!data.visible.length ? <EmptyBlock compact title="Getting the techniques ready" body="The built-in techniques are being added. Breathing below works right away." /> : null}
      {data.favourites.length ? (
        <section aria-label="My favourites">
          <p className="hs-label house-label">My favourites</p>
          <TechniqueList items={data.favourites} data={data} onOpen={(t) => go("guided", { technique: t.id })} />
        </section>
      ) : null}
      <section aria-label="Breathing">
        <p className="hs-label house-label">Breathing</p>
        <ul className="hs-list">
          {BREATHING_NAMES.map((name) => (
            <li key={name}><Row title={name} subtitle={BREATHING_PATTERNS[name]?.pattern} onClick={() => go("breathing", { pattern: name })} /></li>
          ))}
        </ul>
      </section>
      {Object.entries(byCat).map(([cat, list]) => (
        <section key={cat} aria-label={CATEGORY_LABELS[cat] || cat}>
          <p className="hs-label house-label">{CATEGORY_LABELS[cat] || cat}</p>
          <TechniqueList items={list} data={data} onOpen={(t) => go("guided", { technique: t.id })} />
        </section>
      ))}
      {adding ? (
        <CustomTechniqueForm onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); data.qc.invalidateQueries({ queryKey: ["groundingTechniques"] }); }} />
      ) : null}
    </ViewPanel>
  );
}

// ── The room ───────────────────────────────────────────────────────────
export default function SupportRoom({ size = "full" }) {
  const location = useLocation();
  const navigate = useNavigate();
  const data = useSupportData();
  const view = supportView(location.search);
  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const back = useStepBack("/grounding");
  const go = useCallback((v, extra) => navigate(`/grounding${supportViewSearch(v, extra)}`), [navigate]);

  // ?view=scratchpad opens the Soundscape at the Particles visual (old link).
  useEffect(() => {
    if (view === "scratchpad") writeSoundscapePrefs({ ...readSoundscapePrefs(), visual: "particles" });
  }, [view]);
  // Leaving Support: undo a distraction-free focus, and end the sounds
  // unless the person chose to keep them playing around the app.
  useEffect(() => () => {
    if (!readSoundscapePrefs().keepPlaying) stopSoundscape();
    if (!readNaturePrefs().keepPlaying) stopNature();
    if (isFocusQuiet()) stopDistractionFree();
  }, []);

  let body;
  if (view === "soundscape" || view === "nature" || view === "scratchpad") {
    body = (
      <ViewPanel title={view === "nature" ? "Nature sounds" : "Soundscape"} onBack={back} className="hs-wide">
        <div className="hs-oldtext hs-embed">
          <SoundscapeView key={view} initialPage={view === "nature" ? "nature" : "main"}
            initialFocus={view === "soundscape" && q.get("focus") === "1"} onBack={back} />
        </div>
      </ViewPanel>
    );
  } else if (view === "guided") {
    const tech = data.visible.find((t) => t.id === q.get("technique"));
    body = tech ? (
      <ViewPanel title={tech.name} onBack={back} backLabel="Back">
        <div className="hs-oldtext hs-embed">
          <GuidedTechniqueView technique={tech} preference={data.prefMap[tech.id]} currentAlter={data.currentFronter}
            alters={data.alters.filter((a) => !a.is_archived)} onBack={back} backLabel="Back" {...data.handlers} />
        </div>
      </ViewPanel>
    ) : (
      <ViewPanel title="Technique" onBack={back}>
        <EmptyBlock compact title="This technique isn't here any more" body="It may have been archived. Every other technique is in the full list."
          action={<Button rank="secondary" onClick={() => go("all")}>All techniques</Button>} />
      </ViewPanel>
    );
  } else if (view === "breathing") {
    const pattern = BREATHING_PATTERNS[q.get("pattern")] ? q.get("pattern") : "Box breathing";
    body = (
      <ViewPanel title={pattern} onBack={back} backLabel="Back">
        <div className="hs-oldtext hs-embed"><BreathingExercise patternName={pattern} onStop={back} onComplete={back} /></div>
      </ViewPanel>
    );
  } else if (view === "need") {
    body = (
      <ViewPanel title="What do I need?" onBack={back}>
        <div className="hs-oldtext hs-embed">
          <StateCheckFlow initialSelected={statesFrom(location.search, STATE_IDS)}
            onComplete={(states) => go("suggestions", { states: states.join(",") })} onBack={back} />
        </div>
      </ViewPanel>
    );
  } else if (view === "suggestions") {
    body = <SuggestionsView data={data} states={statesFrom(location.search, STATE_IDS)} go={go} back={back} />;
  } else if (view === "all") {
    body = <AllTechniquesView data={data} go={go} back={back} />;
  } else if (view === "learn") {
    body = (
      <ViewPanel title="Learn" onBack={back} className="hs-wide">
        <div className="hs-oldtext hs-embed">
          <LearnSection key={q.get("topic") || "overview"} initialTopicId={q.get("topic")}
            onTryTechnique={(name) => { const t = data.visible.find((x) => x.name === name); if (t) go("guided", { technique: t.id }); }} />
        </div>
      </ViewPanel>
    );
  } else {
    body = <SupportEntry data={data} go={go} />;
  }

  return (
    <div className="hs-room" data-room="support" data-view={view} data-size={size}>
      <div className={view === "entry" ? "hs-grid hs-grid--support" : "hs-single"}>{body}</div>
      {view === "soundscape" || view === "nature" || view === "scratchpad" ? null : <NowPlayingBar onOpen={() => go("soundscape")} />}
    </div>
  );
}
