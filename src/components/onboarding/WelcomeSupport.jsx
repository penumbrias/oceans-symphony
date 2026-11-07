// "Need support right now?" on the very first screen (v0.370.1). It works
// before any setup: no database, no notice to accept first. Everything here
// is static (the breathing guide, the crisis lines, the not-medical notice),
// so opening it writes nothing and needs nothing to be set up.

import React, { useState } from "react";
import { ArrowLeft, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import BreathingExercise from "@/components/grounding/BreathingExercise";
import CrisisResourcesCard from "@/components/grounding/CrisisResourcesCard";
import MedicalDisclaimer from "@/components/shared/MedicalDisclaimer";

export default function WelcomeSupport({ onBack }) {
  const [breathing, setBreathing] = useState(false);
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold text-foreground">Support right now</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Nothing needs setting up first. Take your time; the app will wait.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 p-3 space-y-2">
        {breathing ? (
          <BreathingExercise patternName="Box breathing" onStop={() => setBreathing(false)} onComplete={() => setBreathing(false)} />
        ) : (
          <>
            <p className="text-sm font-medium">Breathe slowly</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              In for four, hold for four, out for four, hold for four. A guide can count it with you.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setBreathing(true)}>
              <Wind className="w-4 h-4 mr-2" /> Breathe with a guide
            </Button>
          </>
        )}
      </div>

      <div className="rounded-xl border border-border/60 p-3 space-y-1.5">
        <p className="text-sm font-medium">Notice where you are</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Name five things you can see, four you can touch, three you can hear, two you can smell and one you can taste.
        </p>
      </div>

      <CrisisResourcesCard />

      <details className="rounded-lg border border-border/60">
        <summary className="px-3 py-2.5 cursor-pointer text-sm font-medium text-primary">This app is not a medical product</summary>
        <div className="px-3 pb-3"><MedicalDisclaimer compact /></div>
      </details>

      <Button variant="ghost" className="w-full" onClick={onBack}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to the welcome
      </Button>
    </div>
  );
}
