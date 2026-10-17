import React from "react";
import { useTerms } from "@/lib/useTerms";

// The opt-in shown under "Front history" in every file importer when the file
// has fronts still open at export time (see src/lib/openFrontsAtExport.js).
// Off by default: those fronts stay in history, ending at the import time.
export default function OpenFrontsCurrentOption({ count, checked, onChange, testId }) {
  const t = useTerms();
  if (!count) return null;
  return (
    <label className="ml-5 flex items-start gap-2 text-xs cursor-pointer select-none" data-testid={testId}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded mt-0.5" />
      <span>
        Also mark the {count} {count === 1 ? t.alter : t.alters} still {t.fronting} in this file as {t.fronting} now
        <span className="block text-muted-foreground/70">
          Off: those stay in history, ending at the time of import, and nobody is added to who's {t.fronting} now.
          {" "}Anyone already {t.fronting} here is left as they are.
        </span>
      </span>
    </label>
  );
}
