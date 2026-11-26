// Pieces the Support rooms share (new house step 3.1): the not-medical
// panel, the crisis-lines sheet ("Call someone"), the now-playing bar and
// the back step out of a view. House kit only; the old components they
// embed (CrisisResourcesCard, MedicalDisclaimer) are the same ones the old
// pages use, so the words and numbers never drift apart.

import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Pause, Play, Square } from "lucide-react";
import { base44 } from "@/api/base44Client";
import MedicalDisclaimer from "@/components/shared/MedicalDisclaimer";
import CrisisResourcesCard from "@/components/grounding/CrisisResourcesCard";
import { emergencySupportContacts, contactDisplayName } from "@/lib/contacts";
import { cardContacts } from "@/lib/emergencyInfo";
import { stopSoundscape } from "@/lib/soundscape/engine";
import { natureSoundById } from "@/lib/natureSounds/catalog";
import { toggleNature, stopNature } from "@/lib/natureSounds/naturePlayer";
import { useNatureState } from "@/components/grounding/nature/natureHooks";
import { useSoundscapeState, useRemaining, fmtClock } from "@/components/grounding/soundscape/soundscapeHooks";
import { Button, IconButton, LinkButton } from "@/house/kit/Button";
import { Panel } from "@/house/kit/Panel";
import { Sheet } from "@/house/kit/Sheet";
import { nowPlayingWords, telHref } from "@/house/support/supportModel";

/** Step back out of a view: the previous page when there is one, else the room. */
export function useStepBack(fallback) {
  const navigate = useNavigate();
  return () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}

/** Board 15's folded "Not medical advice", with the full notice inside. */
export function NotMedicalPanel({ open = false }) {
  return (
    <Panel title="Not medical advice" collapsible defaultOpen={open} className="hs-panel hs-notmed">
      <p className="hs-mut">This app doesn't diagnose or treat anything. Please reach out to a professional or emergency line when you need one.</p>
      <div className="hs-oldtext"><MedicalDisclaimer compact /></div>
    </Panel>
  );
}

/** The people marked "emergency support" in Contacts, with a number each. */
export function useCallablePeople() {
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list() });
  return useMemo(() => cardContacts(emergencySupportContacts(contacts), { displayName: contactDisplayName }), [contacts]);
}

/** "Call someone": the people you listed, then the crisis lines. */
export function CallSomeoneSheet({ open, onClose }) {
  const navigate = useNavigate();
  const people = useCallablePeople();
  const callable = people.filter((p) => p.phone);
  return (
    <Sheet open={open} onClose={onClose} title="Call someone" size="half">
      <div className="hs-sheet">
        {callable.length ? (
          <div className="hs-calls" role="group" aria-label="Your emergency contacts">
            {callable.map((p, i) => (
              <LinkButton key={`${p.name}-${i}`} rank={i === 0 ? "primary" : "secondary"} href={telHref(p.phone)}>
                {`Call ${p.name}`}
              </LinkButton>
            ))}
          </div>
        ) : (
          <p className="hs-mut">
            No one is listed yet. In Contacts, mark the people you'd call as emergency support and they show up here.
          </p>
        )}
        <div className="hs-oldtext"><CrisisResourcesCard defaultOpen /></div>
        <div className="hs-row">
          <Button rank="secondary" onClick={() => { onClose?.(); navigate("/emergency?show=1"); }}>Show my emergency info</Button>
          <Button rank="quiet" onClick={() => { onClose?.(); navigate("/contacts"); }}>Contacts</Button>
        </div>
      </div>
    </Sheet>
  );
}

/** Board 15's bottom bar: what's playing, pause, stop; tap the words to open it. */
export function NowPlayingBar({ onOpen }) {
  const soundscape = useSoundscapeState();
  const remaining = useRemaining(soundscape.endsAt);
  const nature = useNatureState();
  const recording = natureSoundById(nature.id);
  const words = nowPlayingWords({ recording, nature, soundscape, remaining, clock: fmtClock });
  if (!words) return null;
  return (
    <div className="hs-player" role="region" aria-label="Now playing">
      <span className="hs-player-art" aria-hidden="true" />
      <Button rank="quiet" className="hs-player-open" onClick={onOpen} aria-label={`Open ${words.title}`}>
        <span className="hs-player-title">{words.title}</span>
        {words.detail ? <span className="hs-player-sub">{words.detail}</span> : null}
      </Button>
      {recording ? (
        <IconButton rank="secondary" icon={nature.playing ? Pause : Play}
          label={nature.playing ? `Pause ${recording.title}` : `Play ${recording.title}`} onClick={() => toggleNature()} />
      ) : null}
      <IconButton rank="secondary" icon={Square} label="Stop every sound" onClick={() => { stopSoundscape(); stopNature(); }} />
    </div>
  );
}
