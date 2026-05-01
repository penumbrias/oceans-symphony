import { useState, useMemo } from "react";
import { addDays, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import NoteworthySettings from "./NoteworthySettings";
import ReportPreview from "./ReportPreview";
import { DEFAULT_THRESHOLDS } from "@/lib/reportSections";

const SECTIONS = [
  "fronting",
  "emotions",
  "symptoms",
  "activities",
  "journals",
  "diary",
  "bulletins",
  "systemCheckIns",
  "tasks",
  "patterns",
  "alterAppendix",
];

export default function ReportBuilder({
  templates,
  onGenerate,
  loading,
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const weekAgo = format(addDays(new Date(), -7), "yyyy-MM-dd");

  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [periodType, setPeriodType] = useState("week");
  const [mode, setMode] = useState("smart");
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [selectedSections, setSelectedSections] = useState(new Set(SECTIONS));
  const [includeAlterInfo, setIncludeAlterInfo] = useState(true);
  const [includeAlterAppendix, setIncludeAlterAppendix] = useState(false);
  const [showCoverPage, setShowCoverPage] = useState(true);
  const [systemName, setSystemName] = useState("");
  const [therapistName, setTherapistName] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [confidentialityNotice, setConfidentialityNotice] = useState(true);
  const [journalDetail, setJournalDetail] = useState("summaries");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const handleToggleSection = (sec) => {
    const updated = new Set(selectedSections);
    if (updated.has(sec)) updated.delete(sec);
    else updated.add(sec);
    setSelectedSections(updated);
  };

  const handleSetPeriod = (type) => {
    setPeriodType(type);
    if (type === "week") {
      setDateFrom(format(addDays(new Date(), -7), "yyyy-MM-dd"));
      setDateTo(format(new Date(), "yyyy-MM-dd"));
    } else if (type === "month") {
      setDateFrom(format(addDays(new Date(), -30), "yyyy-MM-dd"));
      setDateTo(format(new Date(), "yyyy-MM-dd"));
    }
  };

  const handleGenerate = async () => {
    await onGenerate({
      dateFrom,
      dateTo,
      mode,
      thresholds,
      selectedSections,
      config: {
        systemName,
        dateFrom,
        dateTo,
        therapistName,
        sessionDate,
        coverNote,
        showCoverPage,
        confidentialityNotice,
        journalDetail,
      },
      saveAsTemplate: saveAsTemplate ? { name: templateName } : null,
    });
  };

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Step 1: Time period */}
      <div className="space-y-3">
        <h3 className="font-semibold text-foreground">Time period</h3>
        <div className="flex gap-2">
          {["week", "month", "custom"].map(type => (
            <button
              key={type}
              onClick={() => handleSetPeriod(type)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                periodType === type
                  ? "bg-primary text-white border-primary"
                  : "border-border text-foreground hover:bg-muted/40"
              }`}
            >
              {type === "week" ? "Last 7 days" : type === "month" ? "Last 30 days" : "Custom range"}
            </button>
          ))}
        </div>

        {periodType === "custom" && (
          <div className="flex gap-4">
            <div>
              <label className="text-sm text-muted-foreground">From</label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">To</label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Report mode */}
      <div className="space-y-3">
        <h3 className="font-semibold text-foreground">Report mode</h3>
        <div className="space-y-2">
          {[
            { id: "everything", label: "Everything", desc: "All data in the date range" },
            { id: "smart", label: "Smart highlights", desc: "Auto-surface notable events" },
            { id: "custom", label: "I'll choose", desc: "Manually select sections" },
          ].map(m => (
            <label key={m.id} className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/20 transition-colors">
              <input
                type="radio"
                value={m.id}
                checked={mode === m.id}
                onChange={(e) => setMode(e.target.value)}
                className="mt-1"
              />
              <div>
                <p className="font-medium text-sm text-foreground">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Step 3: Thresholds (smart mode) */}
      {mode !== "custom" && (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">Noteworthy thresholds</h3>
          <NoteworthySettings thresholds={thresholds} onChange={setThresholds} />
        </div>
      )}

      {/* Step 4: Sections (custom mode) */}
      {mode === "custom" && (
        <div className="space-y-3">
          <h3 className="font-semibold text-foreground">Sections to include</h3>
          <div className="space-y-2">
            {SECTIONS.map(sec => (
              <label key={sec} className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/20 rounded">
                <Checkbox
                  checked={selectedSections.has(sec)}
                  onCheckedChange={() => handleToggleSection(sec)}
                />
                <span className="text-sm text-foreground capitalize">{sec.replace(/([A-Z])/g, " $1")}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Step 5: Alter info */}
      <div className="space-y-3">
        <h3 className="font-semibold text-foreground">Alter information</h3>
        <label className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/20">
          <input
            type="checkbox"
            checked={includeAlterInfo}
            onChange={(e) => setIncludeAlterInfo(e.target.checked)}
            className="mt-1"
          />
          <div>
            <p className="font-medium text-sm text-foreground">Include alter names in report</p>
            <p className="text-xs text-muted-foreground">If off, all alter references are anonymized</p>
          </div>
        </label>

        {includeAlterInfo && (
          <label className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/20">
            <input
              type="checkbox"
              checked={includeAlterAppendix}
              onChange={(e) => setIncludeAlterAppendix(e.target.checked)}
              className="mt-1"
            />
            <div>
              <p className="font-medium text-sm text-foreground">Include alter profiles appendix</p>
              <p className="text-xs text-muted-foreground">Role, pronouns, bio for context</p>
            </div>
          </label>
        )}
      </div>

      {/* Step 6: Cover page */}
      <div className="space-y-3">
        <h3 className="font-semibold text-foreground">Cover page</h3>
        <label className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/20">
          <input
            type="checkbox"
            checked={showCoverPage}
            onChange={(e) => setShowCoverPage(e.target.checked)}
            className="mt-1"
          />
          <div>
            <p className="font-medium text-sm text-foreground">Include cover page</p>
          </div>
        </label>

        {showCoverPage && (
          <div className="space-y-3 pl-8">
            <Input
              placeholder="System name (e.g. 'Our System')"
              value={systemName}
              onChange={(e) => setSystemName(e.target.value)}
            />
            <Input
              placeholder="Therapist name (optional)"
              value={therapistName}
              onChange={(e) => setTherapistName(e.target.value)}
            />
            <Input
              type="date"
              placeholder="Session date (optional)"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
            <textarea
              placeholder="Personal note to therapist (optional)"
              value={coverNote}
              onChange={(e) => setCoverNote(e.target.value)}
              className="w-full h-20 p-2 border border-border rounded-lg bg-background text-foreground text-sm resize-none"
            />

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confidentialityNotice}
                onChange={(e) => setConfidentialityNotice(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-muted-foreground">Include confidentiality notice on every page</span>
            </label>
          </div>
        )}
      </div>

      {/* Step 7: Journal detail */}
      <div className="space-y-3">
        <h3 className="font-semibold text-foreground">Journal entries</h3>
        <select
          value={journalDetail}
          onChange={(e) => setJournalDetail(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
        >
          <option value="summaries">Titles only</option>
          <option value="excerpts">First 400 chars per entry</option>
          <option value="full">Full entries</option>
        </select>
      </div>

      {/* Step 8: Save as template */}
      <div className="space-y-3">
        <label className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/20">
          <input
            type="checkbox"
            checked={saveAsTemplate}
            onChange={(e) => setSaveAsTemplate(e.target.checked)}
            className="mt-1"
          />
          <div className="flex-1">
            <p className="font-medium text-sm text-foreground">Save these settings as a template</p>
            {saveAsTemplate && (
              <Input
                placeholder="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="mt-2"
              />
            )}
          </div>
        </label>
      </div>

      {/* Preview */}
      <ReportPreview sections={selectedSections} mode={mode} />

      {/* Generate buttons */}
      <div className="flex gap-3">
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="flex-1 py-6 text-base"
        >
          {loading ? "Generating..." : "Download PDF"}
        </Button>
        <Button
          onClick={() => {
            onGenerate({
              dateFrom,
              dateTo,
              mode,
              thresholds,
              selectedSections,
              config: {
                systemName,
                dateFrom,
                dateTo,
                therapistName,
                sessionDate,
                coverNote,
                showCoverPage,
                confidentialityNotice,
                journalDetail,
              },
              exportAsText: true,
              saveAsTemplate: saveAsTemplate ? { name: templateName } : null,
            });
          }}
          disabled={loading}
          variant="outline"
          className="flex-1 py-6 text-base"
        >
          {loading ? "..." : "Copy as Text"}
        </Button>
      </div>
    </div>
  );
}