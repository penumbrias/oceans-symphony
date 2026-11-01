import { ExternalLink } from "lucide-react";
import { NATURE_SOUNDS, LICENCES, freesoundUrl } from "@/lib/natureSounds/catalog";
import { openExternalUrl } from "@/lib/openExternalUrl";

// Every recording's maker, original title and licence, linked to its
// Freesound page. CC BY recordings need this credit to be used at all, so
// it lists every sound, not only those that require it.

export default function NatureCreditsPage({ onBack }) {
  const sorted = [...NATURE_SOUNDS].sort((a, b) => a.by.localeCompare(b.by) || a.original.localeCompare(b.original));
  return (
    <div className="max-w-lg mx-auto p-4 space-y-3" data-tour="grounding-nature-view">
      <div>
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 transition-colors">
          ← Back to Nature sounds
        </button>
        <h2 className="text-lg font-semibold text-foreground">Credits</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Field recordings shared on{" "}
          <button type="button" onClick={() => openExternalUrl("https://freesound.org")} className="text-primary underline-offset-2 hover:underline">Freesound</button>.
          Each was converted to MP3 for streaming. Thank you to everyone who recorded them.
        </p>
      </div>
      <ul className="px-1">
        {sorted.map((s) => {
          const lic = LICENCES[s.licence] || LICENCES.CC0;
          return (
            <li key={s.id} className="border-b border-border/30 last:border-b-0">
              <button type="button" onClick={() => openExternalUrl(freesoundUrl(s.id))}
                className="w-full flex items-center gap-2 text-left min-h-[52px] py-1.5 hover:bg-muted/30 rounded-md -mx-1 px-1">
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-foreground block break-words">{s.original}</span>
                  <span className="text-[0.6875rem] text-muted-foreground block">
                    by {s.by} · <span className={s.licence !== "CC0" ? "text-primary font-medium" : ""}>{lic.label}</span>
                  </span>
                </span>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" aria-label="Open on Freesound" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-muted-foreground px-1">
        {Object.values(LICENCES).map((l) => (
          <button key={l.label} type="button" onClick={() => openExternalUrl(l.url)} className="hover:text-foreground underline-offset-2 hover:underline">
            About {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
