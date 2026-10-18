import React from "react";
import { useNavigate } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExperimentalOn, setExperimentalOn } from "@/lib/experimentalFeatures";

// Wraps the route of an experimental page (Needs, Goals, Mods). A link,
// notification or search result that lands here while the switch is off
// gets a short explanation and a way to turn it on, not a blank page.
export default function ExperimentalGate({ name, children }) {
  const on = useExperimentalOn();
  const navigate = useNavigate();
  if (on) return children;
  return (
    <div className="max-w-md mx-auto px-5 py-16 text-center space-y-4">
      <FlaskConical className="w-10 h-10 mx-auto text-muted-foreground" aria-hidden="true" />
      <h1 className="text-lg font-semibold">{name} is an experimental feature</h1>
      <p className="text-sm text-muted-foreground leading-relaxed">
        It's still being worked on, so it's hidden for now. You can switch on experimental features to try it.
        Anything you made in it before is kept.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <Button onClick={() => setExperimentalOn(true)}>Turn on experimental features</Button>
        <Button variant="outline" onClick={() => navigate("/")}>Go home</Button>
      </div>
    </div>
  );
}
