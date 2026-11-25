// The safety plan (board 39-SafetyPlanPhone; plan step 3.1). House mode
// only, on /safety-plan. It reads the same Learn exercise answers as the
// old page (the newest saved copy of each) and writes nothing: each Edit
// opens the lesson that owns those answers, where they're written.
//
//   Quick access         call the first emergency contact, the crisis lines,
//                        grounding, emergency info
//   Window of tolerance  all five zones; tap where you are to see what you
//                        notice there and what helps (kept on screen only)
//   Warning signs        the three levels and what I will do
//   My coping cards · Contacts

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useEmergencyCard } from "@/lib/useEmergencyCard";
import { Button, LinkButton } from "@/house/kit/Button";
import { Panel } from "@/house/kit/Panel";
import { Sheet } from "@/house/kit/Sheet";
import { EmptyBlock } from "@/house/kit/States";
import {
  latestSafetyEntries, toleranceRows, warningRows, copingCards, firstCallable, telHref, lessonPath, SAFETY_LESSONS,
} from "@/house/support/supportModel";
import { NotMedicalPanel, CallSomeoneSheet, useCallablePeople } from "@/house/support/supportParts";

export default function HouseSafetyPlan({ size = "full" }) {
  const navigate = useNavigate();
  const { data: entries = [], isFetched } = useQuery({
    queryKey: ["supportJournalEntries"], queryFn: () => base44.entities.SupportJournalEntry.list(),
  });
  const latest = useMemo(() => latestSafetyEntries(entries), [entries]);
  const zones = toleranceRows(latest.window);
  const signs = warningRows(latest.plan);
  const cards = copingCards(latest.cards);
  const people = useCallablePeople();
  const first = firstCallable(people);
  const { sections, isFetched: cardReady } = useEmergencyCard();
  const [here, setHere] = useState(null);
  const [linesOpen, setLinesOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const hasPlan = !!(latest.plan || latest.cards || latest.window);
  const lesson = (k) => navigate(lessonPath(SAFETY_LESSONS[k]));
  const picked = zones.find((z) => z.n === here);

  return (
    <div className="hs-room" data-room="safety" data-size={size} data-tour="safety-plan-page">
      <div className="hs-grid hs-grid--safety">
        <Panel title="Quick access" className="hs-panel hs-quick">
          <div className="hs-opts">
            {first ? <LinkButton rank="primary" href={telHref(first.phone)}>{`Call ${first.name}`}</LinkButton> : null}
            <Button rank={first ? "secondary" : "primary"} aria-haspopup="dialog" onClick={() => setLinesOpen(true)}>Crisis line</Button>
            <Button rank="secondary" onClick={() => navigate("/grounding")}>Grounding</Button>
            {cardReady ? (
              <Button rank="secondary" onClick={() => navigate(sections.length ? "/emergency?show=1" : "/emergency?edit=1")}>
                {sections.length ? "Emergency info" : "Set up emergency info"}
              </Button>
            ) : null}
          </div>
        </Panel>

        {isFetched && !hasPlan ? (
          <Panel title="Not built yet" className="hs-panel">
            <EmptyBlock compact title="Your safety plan is still empty"
              body="Build it in Learn, a little at a time, in a calmer moment: warning signs, what you will do, coping cards and your window of tolerance."
              action={{ rank: "primary", label: "Go to the safety plan lesson", onClick: () => lesson("plan") }} />
          </Panel>
        ) : null}

        <Panel title="Window of tolerance" className="hs-panel hs-window"
          tools={latest.window ? <span>tap where you are</span> : <Button rank="quiet" onClick={() => lesson("window")}>Fill it in</Button>}>
          <ul className="hs-list" data-tour="safety-window" aria-label="Window of tolerance">
            {zones.map((z) => (
              <li key={z.n}>
                <Button rank="quiet" className="hs-zone" aria-pressed={here === z.n} data-on={here === z.n || undefined}
                  onClick={() => setHere(here === z.n ? null : z.n)}>
                  <span className="hs-sq" style={{ background: z.color }} aria-hidden="true" />
                  <span className="hs-zone-name house-label">{z.label}</span>
                  <span className={`hs-zone-help${z.filled ? "" : " hs-empty"}`}>{z.helps || z.notice || "Not filled in yet"}</span>
                </Button>
              </li>
            ))}
          </ul>
          {picked ? (
            <div className="hs-zone-detail" aria-live="polite">
              {picked.notice ? <p><span className="hs-k">I notice: </span>{picked.notice}</p> : null}
              {picked.helps ? <p><span className="hs-k">What helps: </span>{picked.helps}</p> : null}
              {!picked.filled ? <p className="hs-mut">Nothing written for this zone yet.</p> : null}
            </div>
          ) : null}
        </Panel>

        <Panel title="Warning signs" className="hs-panel hs-signs"
          tools={<Button rank="quiet" onClick={() => lesson("plan")}>Edit</Button>}>
          <ul className="hs-list">
            {signs.map((s) => (
              <li key={s.id} className="hs-sign">
                <span className="hs-sign-k house-label" style={{ color: s.color }}>{s.label}</span>
                <span className={s.text ? "" : "hs-empty"}>{s.text || "Not filled in yet"}</span>
                <span className="hs-mut">{`${s.doLabel}: ${s.action || "not written yet"}`}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="hs-two hs-foot2">
        {cards.length ? (
          <Button rank="secondary" aria-haspopup="dialog" onClick={() => setCardsOpen(true)}>{`My coping cards  ${cards.length}`}</Button>
        ) : (
          <Button rank="secondary" onClick={() => lesson("cards")}>Make coping cards</Button>
        )}
        <Button rank="secondary" onClick={() => navigate("/contacts")}>Contacts</Button>
      </div>
      <NotMedicalPanel open={isFetched && !hasPlan} />

      <CallSomeoneSheet open={linesOpen} onClose={() => setLinesOpen(false)} />
      <Sheet open={cardsOpen} onClose={() => setCardsOpen(false)} title="My coping cards" size="half"
        tools={<Button rank="quiet" onClick={() => { setCardsOpen(false); lesson("cards"); }}>Edit</Button>}>
        <ul className="hs-cards">
          {cards.map((c) => (
            <li key={c.key} className="hs-card">
              <span className="hs-k house-label">{c.title}</span>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
