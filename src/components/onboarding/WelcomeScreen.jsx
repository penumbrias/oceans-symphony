import React from "react";

// First-run welcome — shown BEFORE storage setup, so the very first thing a
// new user sees explains what the app is.
export default function WelcomeScreen({ onContinue }) {
  return (
    <div className="fixed inset-0 z-[10000] bg-background text-foreground flex flex-col items-center justify-center px-6"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 1rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
      }}>
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <img src="/logo.png" alt="Oceans Symphony" className="w-20 h-20 rounded-2xl" />
        </div>
        <h1 className="font-display text-2xl font-semibold">Welcome to Oceans Symphony</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          OS is a companion app designed for dissociative systems.
        </p>
        <p className="text-sm leading-relaxed text-foreground/90">
          Track alters, activities, symptoms, emotions, and more. Build
          communication and bridges across amnesia gaps and barriers. Use the
          Quick Support to access guided breathing or grounding techniques in an
          instant. Export your app's data to a "therapy report".
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
