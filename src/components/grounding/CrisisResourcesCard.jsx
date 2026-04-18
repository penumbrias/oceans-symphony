import { useState } from "react";
import { Heart, ChevronDown, ChevronUp } from "lucide-react";

export default function CrisisResourcesCard() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-muted bg-muted/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Heart className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <p className="text-sm text-foreground">Would you like to see some support resources?</p>
        <button
          onClick={() => setExpanded(v => !v)}
          className="ml-auto text-xs px-3 py-1 rounded-lg border border-border text-muted-foreground hover:bg-muted/50 transition-colors flex items-center gap-1"
        >
          {expanded ? "Hide" : "Show"}
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 pt-1">
          <div className="rounded-lg bg-card border border-border/60 p-3 space-y-1">
            <p className="text-sm font-medium text-foreground">988 Suicide & Crisis Lifeline</p>
            <p className="text-xs text-muted-foreground">Call or text <span className="font-semibold text-foreground">988</span> — available 24/7 (US)</p>
          </div>

          <div className="rounded-lg bg-card border border-border/60 p-3 space-y-1">
            <p className="text-sm font-medium text-foreground">Crisis Text Line</p>
            <p className="text-xs text-muted-foreground">Text <span className="font-semibold text-foreground">HOME</span> to <span className="font-semibold text-foreground">741741</span> (US)</p>
          </div>

          <div className="rounded-lg bg-card border border-border/60 p-3 space-y-1">
            <p className="text-sm font-medium text-foreground">International Crisis Centres</p>
            <a
              href="https://www.iasp.info/resources/Crisis_Centres/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              iasp.info/resources/Crisis_Centres
            </a>
          </div>

          <p className="text-xs text-muted-foreground italic px-1">
            You can also reach out to a trusted person in your life. You don't have to get through this alone.
          </p>
        </div>
      )}
    </div>
  );
}