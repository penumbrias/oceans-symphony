// "What we've set up so far" (v0.369.0): the setup card. One Section
// (docs/widget-contract.md). It only reads: every row comes from the one
// step list in src/lib/setupSteps.js, which derives "done" from real
// records, and tapping a row opens the page where that thing is done.
// Removing the card from a board removes nothing else.

import React from "react";
import { useNavigate } from "react-router-dom";
import { Check, Circle } from "lucide-react";
import { Section, Row, Muted, TextAction, useWidgetMode } from "@/v2/primitives";
import { useSetupSteps } from "@/lib/setupSteps";

export const SETUP_PAGE_PATH = "/settings#setup";

function StepMark({ done }) {
  return done
    ? <Check aria-hidden="true" className="w-[1em] h-[1em] flex-shrink-0" style={{ color: "var(--v2-accent, hsl(var(--primary)))" }} />
    : <Circle aria-hidden="true" className="w-[1em] h-[1em] flex-shrink-0 opacity-50" />;
}

export function SetupCardWidget({ settings }) {
  const mode = useWidgetMode();
  const navigate = useNavigate();
  const { steps, isFetched, doneCount, total, allDone, next } = useSetupSteps();
  const showDone = settings?.showDone !== false;

  if (!isFetched) return <Section label="What we've set up so far"><Muted>…</Muted></Section>;

  const shown = mode === "minimal" ? (next ? [next] : []) : steps.filter((s) => showDone || !s.done);
  return (
    <Section label="What we've set up so far"
      action={<span className="text-[0.6875em] text-muted-foreground tabular-nums">{`${doneCount} of ${total}`}</span>}>
      {allDone && <Muted>Everything here is set up. You can remove this card any time; nothing is lost.</Muted>}
      {!allDone && next && mode !== "minimal" && (
        <p className="text-[0.75em] pb-1">
          <span className="text-muted-foreground">Next small thing: </span>
          <button type="button" className="font-medium hover:underline" style={{ color: "var(--v2-accent, hsl(var(--primary)))" }}
            onClick={() => navigate(next.path)}>{next.label}</button>
        </p>
      )}
      {shown.map((s) => (
        <Row key={s.id} onClick={() => navigate(s.path)}
          left={<StepMark done={s.done} />}
          primary={<span>{s.label}<span className="sr-only">{s.done ? " (done)" : " (not done yet)"}</span></span>}
          right={s.value} />
      ))}
      {mode !== "minimal" && (
        <div className="pt-1"><TextAction onClick={() => navigate(SETUP_PAGE_PATH)}>All of setup</TextAction></div>
      )}
    </Section>
  );
}
