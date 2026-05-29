import { Card } from "@/components/ui/card";
import { useTerms } from "@/lib/useTerms";

function buildSectionLabels(terms) {
  return {
    fronting: `${terms.Fronting} history`,
    emotions: "Emotion check-ins",
    symptoms: "Symptoms & habits",
    activities: "Activities",
    journals: "Journal entries",
    diary: "DBT tracking",
    patterns: "Patterns summary",
    alterAppendix: `${terms.Alter} profiles (appendix)`,
  };
}

export default function ReportPreview({ sections, mode }) {
  const terms = useTerms();
  const SECTION_LABELS = buildSectionLabels(terms);
  if (!sections || sections.size === 0) {
    return (
      <Card className="p-4 text-center text-muted-foreground text-sm">
        Select at least one section to include
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground">This report will include:</p>
      <div className="space-y-2">
        <p className="text-sm text-foreground">✓ Overview at a glance</p>
        {Array.from(sections).map(sec => (
          <p key={sec} className="text-sm text-foreground">
            ✓ {SECTION_LABELS[sec]}
          </p>
        ))}
        {mode !== "custom" && (
          <p className="text-xs text-muted-foreground italic mt-3">
            {mode === "smart" ? "Notable events will be flagged" : "All data in date range will be included"}
          </p>
        )}
      </div>
    </Card>
  );
}