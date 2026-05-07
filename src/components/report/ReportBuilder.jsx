import { useState, useMemo } from "react";
import { addDays, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp } from "lucide-react";
import NoteworthySettings from "./NoteworthySettings";
import { DEFAULT_THRESHOLDS } from "@/lib/reportSections";
import { useTerms } from "@/lib/useTerms";

function ExclusionPicker({ items, excluded, onChange, nounSingular = "item" }) {
  const [open, setOpen] = useState(false);
  const excludedCount = items.filter(i => excluded.includes(i.id)).length;
  const toggle = (id) => {
    if (excluded.includes(id)) onChange(excluded.filter(x => x !== id));
    else onChange([...excluded, id]);
  };
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {excludedCount > 0
          ? <span className="text-amber-600 dark:text-amber-400 font-medium">{excludedCount} excluded from report</span>
          : <span>All {nounSingular}s included · manage exclusions</span>
        }
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-border/60 divide-y divide-border/40 max-h-48 overflow-y-auto">
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground px-3 py-2">No {nounSingular}s found in your data.</p>
          )}
          {items.map(item => {
            const isExcluded = excluded.includes(item.id);
            return (
              <label key={item.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/20 select-none">
                <Checkbox checked={!isExcluded} onCheckedChange={() => toggle(item.id)} />
                <span className={`text-xs flex-1 ${isExcluded ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {item.label}
                </span>
                {isExcluded && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">excluded</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RadioGroup({ value, onChange, options }) {
  return (
    <div className="space-y-1 pt-1">
      {options.map(opt => (
        <label key={opt.value} className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="radio"
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="accent-primary"
          />
          <span className="text-xs text-muted-foreground">{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

const buildSectionDefs = (t) => [
  {
    id: "fronting",
    label: `${t.Fronting} History`,
    desc: `Who ${t.fronted || t.fronting}, session durations, and notable ${t.switches}`,
    subOptions: (opts, set) => (
      <RadioGroup value={opts.frontingDetail} onChange={v => set("frontingDetail", v)} options={[
        { value: "summary", label: `Summary table only` },
        { value: "full", label: `Summary + full session-by-session log` },
      ]} />
    ),
  },
  {
    id: "emotions",
    label: "Emotion Check-Ins",
    desc: "Most frequent emotions and crisis-level check-ins",
    subOptions: (opts, set) => (
      <RadioGroup value={opts.emotionDetail} onChange={v => set("emotionDetail", v)} options={[
        { value: "highlights", label: "Top emotions + notable events" },
        { value: "full", label: "Include all check-ins" },
      ]} />
    ),
  },
  {
    id: "statusNotes",
    label: "Custom Status Notes",
    desc: "Status messages set from the dashboard",
  },
  {
    id: "symptoms",
    label: "Symptoms & Habits",
    desc: "Symptom frequency, severity averages, and notable events",
  },
  {
    id: "activities",
    label: "Activities",
    desc: "Logged activities and total durations",
  },
  {
    id: "journals",
    label: "Journal Entries",
    desc: "Personal journal entries",
    subOptions: (opts, set) => (
      <RadioGroup value={opts.journalDetail} onChange={v => set("journalDetail", v)} options={[
        { value: "summaries", label: "Titles only" },
        { value: "excerpts", label: "First 400 characters per entry" },
        { value: "full", label: "Full entries" },
      ]} />
    ),
  },
  {
    id: "diary",
    label: "Diary Cards",
    desc: "DBT-style diary card data including urges, emotions, body/mind",
    subOptions: (opts, set) => (
      <RadioGroup value={opts.diaryDetail} onChange={v => set("diaryDetail", v)} options={[
        { value: "noteworthy", label: "Noteworthy entries only (high urges / distress)" },
        { value: "all", label: "All diary cards" },
      ]} />
    ),
  },
  {
    id: "locations",
    label: "Locations",
    desc: "Places visited, logged manually or by GPS",
  },
  {
    id: "sleep",
    label: "Sleep Log",
    desc: "Sleep duration, quality, nightmares, and interruptions",
  },
  {
    id: "bulletins",
    label: "Bulletin Board",
    desc: "Internal system bulletin posts",
    subOptions: (opts, set) => (
      <RadioGroup value={opts.bulletinDetail} onChange={v => set("bulletinDetail", v)} options={[
        { value: "titles", label: "Titles only" },
        { value: "content", label: "Include post content" },
      ]} />
    ),
  },
  {
    id: "systemCheckIns",
    label: `${t.System} Meetings`,
    desc: `${t.System} check-in and meeting records`,
  },
  {
    id: "supportJournals",
    label: "Skills & Exercises",
    desc: "Completed grounding and skills exercises from the Learn section",
    subOptions: (opts, set) => (
      <RadioGroup value={opts.supportDetail} onChange={v => set("supportDetail", v)} options={[
        { value: "titles", label: "Exercise names only" },
        { value: "responses", label: "Include written responses" },
      ]} />
    ),
  },
  {
    id: "tasks",
    label: "Tasks & Habits",
    desc: "Daily, weekly, and monthly task completion summary",
  },
  {
    id: "patterns",
    label: "Patterns & Narrative",
    desc: "Auto-generated summary of patterns across all your data",
  },
  {
    id: "alterAppendix",
    label: `${t.Alter} Profiles`,
    desc: `Profile cards for ${t.alters} who appeared during this period`,
    subOptions: (opts, set) => (
      <div className="space-y-2 pt-1">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox checked={opts.alterNames} onCheckedChange={v => set("alterNames", !!v)} />
          <span className="text-xs text-muted-foreground">
            Include {opts.alterNames ? `${t.alter} names` : `names`} (uncheck to anonymize all references)
          </span>
        </label>
        {opts.alterNames && (
          <RadioGroup value={opts.alterDetail} onChange={v => set("alterDetail", v)} options={[
            { value: "brief", label: "Name, pronouns, and role only" },
            { value: "full", label: "Full profiles including bios" },
          ]} />
        )}
      </div>
    ),
  },
];

const DEFAULT_SELECTED = new Set([
  "fronting", "emotions", "statusNotes", "symptoms", "activities",
  "journals", "diary", "locations", "sleep", "bulletins",
  "systemCheckIns", "supportJournals", "tasks", "patterns", "alterAppendix",
]);

const DEFAULT_OPTIONS = {
  frontingDetail: "summary",
  emotionDetail: "highlights",
  diaryDetail: "noteworthy",
  journalDetail: "summaries",
  bulletinDetail: "content",
  supportDetail: "titles",
  alterNames: true,
  alterDetail: "full",
  excludedSymptomIds: [],
  excludedActivityNames: [],
  excludedAlterIds: [],
};

export default function ReportBuilder({ templates, onGenerate, loading, symptoms = [], activities = [], alters = [] }) {
  const t = useTerms();
  const SECTIONS = useMemo(() => buildSectionDefs(t), [t]);

  const symptomItems = useMemo(() =>
    symptoms.filter(s => !s.is_archived).map(s => ({ id: s.id, label: s.label || "Unnamed" })),
    [symptoms]);

  const activityNameItems = useMemo(() => {
    const seen = new Set();
    return activities
      .map(a => a.activity_name || a.name)
      .filter(n => n && !seen.has(n) && seen.add(n))
      .sort()
      .map(n => ({ id: n, label: n }));
  }, [activities]);

  const alterItems = useMemo(() =>
    alters.filter(a => !a.is_archived).map(a => ({ id: a.id, label: a.name || "Unnamed" })),
    [alters]);

  const today = format(new Date(), "yyyy-MM-dd");
  const weekAgo = format(addDays(new Date(), -7), "yyyy-MM-dd");

  const [dateFrom, setDateFrom] = useState(weekAgo);
  const [dateTo, setDateTo] = useState(today);
  const [periodType, setPeriodType] = useState("week");
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [selectedSections, setSelectedSections] = useState(new Set(DEFAULT_SELECTED));
  const [sectionOptions, setSectionOptions] = useState(DEFAULT_OPTIONS);
  const [showThresholds, setShowThresholds] = useState(false);

  const [showCoverPage, setShowCoverPage] = useState(true);
  const [systemName, setSystemName] = useState("");
  const [therapistName, setTherapistName] = useState("");
  const [sessionDate, setSessionDate] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [confidentialityNotice, setConfidentialityNotice] = useState(true);

  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  const setOpt = (key, value) => setSectionOptions(prev => ({ ...prev, [key]: value }));

  const handleToggle = (id) => {
    const next = new Set(selectedSections);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedSections(next);
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

  const buildConfig = (exportAsText = false) => ({
    dateFrom,
    dateTo,
    mode: "smart",
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
      journalDetail: sectionOptions.journalDetail,
      includeAlterInfo: sectionOptions.alterNames,
      sectionOptions,
    },
    exportAsText,
    saveAsTemplate: saveAsTemplate && templateName ? { name: templateName } : null,
  });

  return (
    <div className="space-y-8 max-w-2xl">

      {/* Time period */}
      <section className="space-y-3">
        <h3 className="font-semibold text-foreground">Time period</h3>
        <div className="flex gap-2 flex-wrap">
          {[
            { id: "week", label: "Last 7 days" },
            { id: "month", label: "Last 30 days" },
            { id: "custom", label: "Custom range" },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => handleSetPeriod(p.id)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                periodType === p.id
                  ? "bg-primary text-white border-primary"
                  : "border-border text-foreground hover:bg-muted/40"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {periodType === "custom" && (
          <div className="flex gap-4">
            <div>
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1" />
            </div>
          </div>
        )}
      </section>

      {/* What to include */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">What to include</h3>
          <div className="flex gap-3">
            <button
              onClick={() => setSelectedSections(new Set(SECTIONS.map(s => s.id)))}
              className="text-xs text-primary hover:underline"
            >
              Select all
            </button>
            <button
              onClick={() => setSelectedSections(new Set())}
              className="text-xs text-muted-foreground hover:underline"
            >
              Clear all
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {SECTIONS.map(sec => {
            const isOn = selectedSections.has(sec.id);
            return (
              <div
                key={sec.id}
                className={`rounded-xl border transition-colors ${
                  isOn ? "border-primary/25 bg-primary/5" : "border-border/60 bg-background"
                }`}
              >
                <label className="flex items-start gap-3 p-3 cursor-pointer select-none">
                  <Checkbox
                    checked={isOn}
                    onCheckedChange={() => handleToggle(sec.id)}
                    className="mt-0.5 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${isOn ? "text-foreground" : "text-muted-foreground"}`}>
                      {sec.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{sec.desc}</p>
                  </div>
                </label>

                {isOn && (sec.subOptions || sec.id === "symptoms" || sec.id === "activities" || sec.id === "alterAppendix") && (
                  <div className="px-10 pb-3">
                    {sec.subOptions && sec.subOptions(sectionOptions, setOpt)}
                    {sec.id === "symptoms" && symptomItems.length > 0 && (
                      <ExclusionPicker
                        items={symptomItems}
                        excluded={sectionOptions.excludedSymptomIds}
                        onChange={v => setOpt("excludedSymptomIds", v)}
                        nounSingular="symptom/habit"
                      />
                    )}
                    {sec.id === "activities" && activityNameItems.length > 0 && (
                      <ExclusionPicker
                        items={activityNameItems}
                        excluded={sectionOptions.excludedActivityNames}
                        onChange={v => setOpt("excludedActivityNames", v)}
                        nounSingular="activity"
                      />
                    )}
                    {sec.id === "alterAppendix" && sectionOptions.alterNames && alterItems.length > 0 && (
                      <ExclusionPicker
                        items={alterItems}
                        excluded={sectionOptions.excludedAlterIds}
                        onChange={v => setOpt("excludedAlterIds", v)}
                        nounSingular={t.alter}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Noteworthy thresholds */}
      <section>
        <button
          onClick={() => setShowThresholds(v => !v)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {showThresholds ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          <span className="font-medium">Noteworthy thresholds</span>
          <span className="text-xs">(when to flag events as notable)</span>
        </button>
        {showThresholds && (
          <div className="mt-3">
            <NoteworthySettings thresholds={thresholds} onChange={setThresholds} />
          </div>
        )}
      </section>

      {/* Cover page */}
      <section className="space-y-3">
        <h3 className="font-semibold text-foreground">Cover page</h3>
        <label className="flex items-center gap-3 p-3 border border-border rounded-xl cursor-pointer hover:bg-muted/20 select-none">
          <input
            type="checkbox"
            checked={showCoverPage}
            onChange={e => setShowCoverPage(e.target.checked)}
          />
          <span className="text-sm font-medium text-foreground">Include cover page</span>
        </label>
        {showCoverPage && (
          <div className="space-y-3 pl-6">
            <Input
              placeholder={`System name (e.g. "Our System")`}
              value={systemName}
              onChange={e => setSystemName(e.target.value)}
            />
            <Input
              placeholder="Therapist name (optional)"
              value={therapistName}
              onChange={e => setTherapistName(e.target.value)}
            />
            <Input
              type="date"
              value={sessionDate}
              onChange={e => setSessionDate(e.target.value)}
            />
            <textarea
              placeholder="Personal note to therapist (optional)"
              value={coverNote}
              onChange={e => setCoverNote(e.target.value)}
              className="w-full h-20 p-2 border border-border rounded-lg bg-background text-foreground text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confidentialityNotice}
                onChange={e => setConfidentialityNotice(e.target.checked)}
              />
              <span className="text-muted-foreground">Include confidentiality notice on every page</span>
            </label>
          </div>
        )}
      </section>

      {/* Save as template */}
      <section>
        <label className="flex items-start gap-3 p-3 border border-border rounded-xl cursor-pointer hover:bg-muted/20 select-none">
          <input
            type="checkbox"
            checked={saveAsTemplate}
            onChange={e => setSaveAsTemplate(e.target.checked)}
            className="mt-1"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Save these settings as a template</p>
            {saveAsTemplate && (
              <Input
                placeholder="Template name"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                className="mt-2"
              />
            )}
          </div>
        </label>
      </section>

      {/* Generate */}
      <div className="flex gap-3">
        <Button
          onClick={() => onGenerate(buildConfig(false))}
          disabled={loading || selectedSections.size === 0}
          className="flex-1 py-6 text-base"
        >
          {loading ? "Generating…" : "Download PDF"}
        </Button>
        <Button
          onClick={() => onGenerate(buildConfig(true))}
          disabled={loading || selectedSections.size === 0}
          variant="outline"
          className="flex-1 py-6 text-base"
        >
          {loading ? "…" : "Copy as Text"}
        </Button>
      </div>
    </div>
  );
}
