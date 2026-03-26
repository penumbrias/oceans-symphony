import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";

const STEPS = (t) => [
  {
    title: "Welcome to Symphony 💜",
    body: `Symphony is your personal ${t.system} management app. Track who's ${t.fronting}, log journals, manage ${t.alters}, and more.`,
  },
  {
    title: `Meet Your ${t.Alters}`,
    body: `Add and manage ${t.alters} from the home screen. Each ${t.alter} can have their own profile, color, pronouns, and notes.`,
  },
  {
    title: `Track ${t.Fronting}`,
    body: `Use the ${t.Front} bar at the top to log who is ${t.fronting}. This feeds into your analytics and timeline history.`,
  },
  {
    title: "Journals & Diary Cards",
    body: `Write personal journal entries or fill out daily diary cards to track emotions, urges, and wellbeing over time.`,
  },
  {
    title: "Daily Tasks & Activities",
    body: `Earn XP by completing daily tasks and logging activities. Track sleep, habits, and goals all in one place.`,
  },
  {
    title: "You're All Set! 🎉",
    body: `Explore the sidebar to discover all features. You can reopen this guide anytime by clicking "Guide" on the dashboard.`,
  },
];

export default function TourModal({ open, onClose }) {
  const t = useTerms();
  const steps = STEPS(t);
  const [step, setStep] = React.useState(0);

  const current = steps[step];
  const isLast = step === steps.length - 1;

  const handleNext = () => {
    if (isLast) onClose();
    else setStep((s) => s + 1);
  };

  const handleBack = () => setStep((s) => s - 1);

  // Reset to first step when reopened
  React.useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{current.title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground leading-relaxed mt-1">{current.body}</p>

        <div className="flex items-center justify-center gap-1.5 mt-4">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${i === step ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between mt-4">
          <Button variant="ghost" size="sm" onClick={handleBack} disabled={step === 0}>
            Back
          </Button>
          <Button size="sm" onClick={handleNext}>
            {isLast ? "Get Started" : "Next"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}