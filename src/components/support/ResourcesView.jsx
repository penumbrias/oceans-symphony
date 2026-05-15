import { ChevronLeft, ExternalLink, BookOpen, Globe, Heart } from "lucide-react";

// Resources page for the Learn module. Lists the source material the
// curriculum draws from, plus a handful of well-known reads and online
// communities. Deliberately conservative on outbound links: books get
// titles + authors + a short description rather than direct retailer
// links (the user can search their library / preferred bookseller);
// websites get linked because they have stable canonical URLs.
//
// Categorised so the heavier clinical workbooks sit separately from
// memoirs and online resources — different readers, different needs.

const RESOURCES = {
  primary: {
    label: "Primary sources of this app's curriculum",
    icon: BookOpen,
    items: [
      {
        title: "Finding Solid Ground",
        author: "Bethany L. Brand, Hugo J. Schielke, Frances S. Howell, and Ruth A. Lanius",
        blurb: "A trauma-focused workbook and the primary source for Oceans Symphony's Learn curriculum. Step-by-step skills for grounding, stabilisation, and trauma-related symptom management. Designed to be used alongside a trauma-informed therapist.",
      },
      {
        title: "Coping With Trauma-Related Dissociation",
        author: "Suzette Boon, Kathy Steele, Onno van der Hart",
        blurb: "A widely-used clinical workbook for systems navigating dissociation. Some of the secondary material in the Learn curriculum draws from this book.",
      },
    ],
  },
  books: {
    label: "Further reading",
    icon: BookOpen,
    items: [
      {
        title: "Dissociation Made Simple",
        author: "Jamie Marich",
        blurb: "An accessible, plain-language introduction to dissociation for survivors, allies, and clinicians. Less workbook, more orienting framework.",
      },
      {
        title: "When Rabbit Howls",
        author: "Truddi Chase (and the Troops)",
        blurb: "A widely-cited first-person account of life inside a system. Out of print in places but commonly available second-hand and in libraries. Heads-up: contains graphic descriptions of abuse.",
      },
    ],
  },
  online: {
    label: "Online resources",
    icon: Globe,
    items: [
      {
        title: "did-research.org",
        url: "https://did-research.org/",
        blurb: "Plain-language explanations of DID and OSDD aimed at both systems and the people who love them. Sourced primarily from clinical research.",
      },
      {
        title: "ISSTD (International Society for the Study of Trauma and Dissociation)",
        url: "https://www.isst-d.org/",
        blurb: "The main professional body for clinicians who work with dissociative conditions. Their public Fact Sheets page is a good starting reference.",
      },
      {
        title: "CTAD Clinic (UK) — YouTube",
        url: "https://www.youtube.com/@TheCTADClinic",
        blurb: "The UK-based Centre for Trauma and Dissociation runs an accessible, plain-language YouTube channel on dissociation, parts work, and trauma — useful even if you're not in the UK. For treatment, note that several clinics use variations of the 'Center for Trauma and Dissociation' name, so search 'CTAD clinic' plus your region to find a local one.",
      },
      {
        title: "An Infinite Mind",
        url: "https://www.aninfinitemind.com/",
        blurb: "Nonprofit that hosts conferences for survivors and runs an active community. Good signal-boost for newer systems looking for peers.",
      },
    ],
  },
};

export default function ResourcesView({ onBack }) {
  return (
    <div className="max-w-xl mx-auto p-4 space-y-6 pb-12">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Learn
      </button>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Resources</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The Learn curriculum draws from a small number of clinical workbooks; this page links you back to those sources, plus a few other reads and online communities that the wider plural and DID community has found useful. None of these are endorsements of any particular treatment, and Oceans Symphony itself is not a medical product.
        </p>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
          Some material below — especially memoirs — contains graphic descriptions of trauma. Skip anything that doesn't feel safe right now. Coming back to it later is always an option.
        </p>
      </div>

      {Object.entries(RESOURCES).map(([key, section]) => {
        const Icon = section.icon;
        return (
          <div key={key} className="space-y-3">
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">{section.label}</h3>
            </div>
            <div className="space-y-2">
              {section.items.map((item) => (
                <div key={item.title} className="rounded-xl border border-border/50 bg-card p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      {item.author && (
                        <p className="text-xs text-muted-foreground italic">{item.author}</p>
                      )}
                    </div>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap flex-shrink-0"
                      >
                        Open <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.blurb}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-2">
        <Heart className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <p className="text-xs text-primary/80 leading-relaxed">
          Have a resource you'd like to see here? The app is open source — open an issue on GitHub with the link and a sentence about why it's helpful.
        </p>
      </div>
    </div>
  );
}
