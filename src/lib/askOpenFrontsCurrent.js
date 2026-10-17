import { confirm } from "@/components/shared/ConfirmDialog";
import { DEFAULT_TERMS, pluralize, gerund } from "@/lib/useTerms";

// The question form of the "Also mark the N … still fronting in this file as
// fronting now" opt-in (OpenFrontsCurrentOption), for imports that run
// straight from a file pick and have no options panel (Ampersand). Resolves
// true only on an explicit yes; dismissing keeps them as history, which is
// the safe default (see src/lib/openFrontsAtExport.js).
//
// `terms` is the useTerms() object when the caller has one; first-run setup
// has no settings yet and passes nothing (the defaults are used).
export async function askMakeOpenFrontsCurrent(count, terms) {
  if (!count) return false;
  const alter = terms?.alter || DEFAULT_TERMS.alter;
  const alters = terms?.alters || pluralize(alter);
  const fronting = terms?.fronting || (terms?.front ? gerund(terms.front) : DEFAULT_TERMS.fronting);
  const who = count === 1 ? `1 ${alter}` : `${count} ${alters}`;
  try {
    return !!(await confirm({
      title: `Mark ${who} as ${fronting} now?`,
      // The body also stands alone: without the app's dialog mounted (first
      // run) confirm() falls back to the browser's OK / Cancel prompt.
      body:
        `This file still has ${who} ${fronting}, but it may be out of date. Mark them as ${fronting} now? ` +
        `If not, ${count === 1 ? "it's" : "they're"} saved as history ending now, and nobody is added to who's ${fronting} now.`,
      confirmLabel: `Yes, ${fronting} now`,
      cancelLabel: "Keep as history",
    }));
  } catch {
    return false;
  }
}
