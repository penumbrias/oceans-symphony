// Static, READ-ONLY app roadmap — a curated extension of the changelog,
// maintained here in code (NOT a user-editable entity). It is shipped as
// an OPTIONAL install (see optionalContent.js): kept out of the base
// bundle and lazily imported only when the user opts in, so it doesn't
// bloat the install.
//
// To change the roadmap, edit the ROADMAP array below — there is no UI
// for adding/editing items, and no entity backing it. The page chrome
// (headings, intro copy) is terms-aware; the item text here stays
// literal, the same way the changelog text is literal.

// Ordered status buckets. Order here = the order groups render on the
// Roadmap page.
export const ROADMAP_STATUSES = [
  { id: "in-progress", label: "In progress" },
  { id: "planned",     label: "Planned" },
  { id: "backburner",  label: "Backburner" },
  { id: "considering", label: "Considering" },
  { id: "done",        label: "Done" },
];

// The curated roadmap. Each item: { status, category, title, description }.
// `status` must be one of the ROADMAP_STATUSES ids above.
export const ROADMAP = [
  {
    status: "in-progress",
    category: "Polish",
    title: "Ongoing polish",
    description: "Continued UI standardization, usability, accessibility, performance, and bug-squashing across the app.",
  },
  {
    status: "planned",
    category: "Alters",
    title: "New presences",
    description: "Detect emergent alters: log just a fragment — a name, a colour, a description detail — optionally link potential connections to existing alters, and track them over time as they coalesce into full alters or dissipate.",
  },
  {
    status: "planned",
    category: "Lists",
    title: "Grocery & wish lists",
    description: "Expand grocery lists into multiple list types with full wish-list functionality.",
  },
  {
    status: "planned",
    category: "Profiles",
    title: "External relationships",
    description: "Expand pronouns into an advanced-preferences field: pronouns, touch/personal boundaries, and more as open text with a like / neutral / dislike (optionally 5-way) toggle.",
  },
  {
    status: "planned",
    category: "Import",
    title: "More plural-app imports",
    description: "Import from more plural-focused apps beyond PluralKit and Simply Plural.",
  },
  {
    status: "backburner",
    category: "Performance",
    title: "Lifetime-scale performance",
    description: "Virtualize and date-bound very large histories (Activity Tracker and beyond) so the app stays instant after years of data.",
  },
];
