import React from "react";
import { Heart } from "lucide-react";

// First-run welcome — shown BEFORE storage setup, so the very first thing a
// new user sees explains what the app is. No app data exists yet at this
// point, so the copy uses plain "systems"/"alters" wording (terms are
// customised later in setup).
export default function WelcomeScreen({ onContinue }) {
  return (
    <div className="fixed inset-0 z-[10000] bg-background text-foreground flex flex-col items-center justify-center px-6"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 1rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
      }}>
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 flex items-center justify-center">
            <Heart className="w-8 h-8 text-primary" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold">Welcome to Oceans Symphony 💜</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            More than just a tracker — Oceans Symphony is a companion app
            designed for dissociative systems.
          </p>
        </div>
        <p className="text-sm leading-relaxed text-foreground/90">
          Track alters, activities, symptoms, emotions, and more — to build
          communication and bridges across amnesia gaps.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Everything is yours and stays on your device. Next, we'll get you set
          up and show a short note on what this app is and isn't.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
        >
          Get started
        </button>
      </div>
    </div>
  );
}
