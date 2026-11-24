import { useState, useMemo, createContext, useContext } from "react";
import { getCommandSign } from "@/lib/commandTerms";
import { confirm } from "@/components/shared/ConfirmDialog";
import { addDays, format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import NoteworthySettings from "./NoteworthySettings";
import { DEFAULT_THRESHOLDS } from "@/lib/reportSections";
import { getPrivacyLevels, sortedLevels } from "@/lib/privacyLevels";
import { useTerms } from "@/lib/useTerms";
import { useTherapyKeyword } from "./TherapyNotesCard";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

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
                {isExcluded && <span className="text-[0.625rem] text-amber-600 dark:text-amber-400 font-medium">excluded</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// True inside the pixel look's builder: option groups draw as chips.
const PixelBuilderContext = createContext(false);

// A pixel tick row (the pixel builder's checkboxes).
function PxTick({ on, onToggle, children, label }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} className="pxg-tickrow" onClick={onToggle} aria-label={label}>
      <span className={`pxg-tick${on ? " y" : ""}`} aria-hidden="true">{on ? "x" : ""}</span>
      <span>{children}</span>
    </button>
  );
}

function RadioGroup({ value, onChange, options }) {
  const pixel = useContext(PixelBuilderContext);
  if (pixel) {
    return (
      <div className="pxg-seg" role="radiogroup">
        {options.map(opt => (
          <button key={opt.value} type="button" role="radio" aria-checked={value === opt.value}
            className={`pxg-chip${value === opt.value ? " sel" : ""}`} onClick={() => onChange(opt.value)}>
            {opt.label}
          </button>
        ))}
      </div>
    );
  }
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

const buildSectionDefs = (t, therapyKeyword = "therapy") => [
  {
    id: "therapyNotes",
    label: "To Bring Up",
    desc: `Anything you wrote with ${getCommandSign()}${therapyKeyword} that hasn't been in a report yet — shown first`,
  },
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
    id: "plans",
    label: "Plan Completion",
    desc: "How often planned activities were completed, cancelled, or skipped — with recurring-plan follow-through rates",
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
    label: "DBT tracking",
    desc: "DBT-style daily data (urges, emotions, body/mind) — captured automatically when you use Quick Check-In.",
    subOptions: (opts, set) => (
      <RadioGroup value={opts.diaryDetail} onChange={v => set("diaryDetail", v)} options={[
        { value: "noteworthy", label: "Noteworthy entries only (high urges / distress)" },
        { value: "all", label: "All entries" },
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
    desc: `Internal ${t.system} bulletin posts`,
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
    desc: "Clinician summary (switching, distress, sleep, symptoms — same math as Analytics) plus an auto-generated patterns narrative",
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
  "therapyNotes", "fronting", "emotions", "statusNotes", "symptoms", "activities", "plans",
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

export default function ReportBuilder({ templates = [], onDeleteTemplate, onSaveTemplate, onGenerate, loading, symptoms = [], activities = [], alters = [], pixel = false, renderPreview = null, extra = null }) {
  const t = useTerms();
  const therapyKeyword = useTherapyKeyword();
  const SECTIONS = useMemo(() => buildSectionDefs(t, therapyKeyword), [t, therapyKeyword]);

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

  // Privacy-level shortcuts for the alter-appendix exclusion list: "Only this
  // level" excludes everyone NOT tagged with the chosen level.
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const privacyLevels = useMemo(() => sortedLevels(getPrivacyLevels(pickPrimarySystemSettings(settingsList))), [settingsList]);

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

  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const setOpt = (key, value) => setSectionOptions(prev => ({ ...prev, [key]: value }));

  const handleLoadTemplate = (tpl) => {
    if (tpl.sections_config) {
      const next = new Set(Object.keys(tpl.sections_config).filter(k => tpl.sections_config[k]));
      // Templates saved before ~therapy notes existed don't mention the
      // section at all — keep it on so captured notes still reach the report.
      if (!("therapyNotes" in tpl.sections_config)) next.add("therapyNotes");
      setSelectedSections(next);
    }
    if (tpl.noteworthy_thresholds) setThresholds(tpl.noteworthy_thresholds);
    if (tpl.show_cover_page != null) setShowCoverPage(tpl.show_cover_page);
    if (tpl.cover_note) setCoverNote(tpl.cover_note);
    if (tpl.system_name) setSystemName(tpl.system_name);
    if (tpl.therapist_name) setTherapistName(tpl.therapist_name);
    if (tpl.confidentiality_notice != null) setConfidentialityNotice(tpl.confidentiality_notice);
    if (tpl.journal_detail) setOpt("journalDetail", tpl.journal_detail);
    if (tpl.section_options) setSectionOptions(prev => ({ ...prev, ...tpl.section_options }));
  };

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

  const buildConfig = (exportAsText = false, previewBeforeExport = false) => ({
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
    previewBeforeExport,
    saveAsTemplate: null,
  });

  // ── Pixel look: the "Therapy report" board ──────────────────────────
  // "Build the report" on the left (every control below, regrouped), the
  // page's preview on the right. Same state, same buttons, same output.
  const saveTemplate = async () => {
    if (!onSaveTemplate || !templateName.trim()) return;
    setSavingTemplate(true);
    try {
      await onSaveTemplate(buildConfig(), templateName.trim());
      setTemplateName("");
    } finally {
      setSavingTemplate(false);
    }
  };
  if (pixel) {
    const periodLabel = (() => {
      try {
        const f = (d) => format(new Date(`${d}T12:00:00`), "MMM d");
        return `${f(dateFrom)} to ${f(dateTo)}`;
      } catch { return ""; }
    })();
    const detailSecs = SECTIONS.filter(sec => selectedSections.has(sec.id)
      && (sec.subOptions || (sec.id === "symptoms" && symptomItems.length > 0)
        || (sec.id === "activities" && activityNameItems.length > 0)));
    const noSections = loading || selectedSections.size === 0;
    return (
      <PixelBuilderContext.Provider value={true}>
        <div className="pxg-report">
          <section className="pxg-pn pxg-build" aria-label="Build the report">
            <div className="pxg-ttl">
              <span>Build the report</span>
              <button type="button" className="pxg-ttl-link" aria-expanded={showTemplates} onClick={() => setShowTemplates(v => !v)}>
                Templates {templates.length}
              </button>
            </div>
            <div className="pxg-build-body">
              {showTemplates && (
                <div className="pxg-box">
                  <div className="pxg-h">Templates</div>
                  {templates.length === 0 ? (
                    <p className="pxg-muted pxg-small">No saved templates yet. Name your current settings below and save.</p>
                  ) : templates.map(tpl => (
                    <div key={tpl.id} className="pxg-tplrow">
                      <span className="pxg-tplname">{tpl.name}</span>
                      <button type="button" className="pxg-btn pxg-btn-s" onClick={() => handleLoadTemplate(tpl)}>Load</button>
                      {onDeleteTemplate && (
                        <button type="button" className="pxg-btn pxg-btn-s" aria-label={`Delete template ${tpl.name}`}
                          onClick={async () => { if ((await confirm(`Delete template "${tpl.name}"?`))) onDeleteTemplate(tpl.id); }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="pxg-tplrow">
                    <input className="pxg-ins pxg-grow" placeholder="Template name..." aria-label="Template name"
                      value={templateName} onChange={e => setTemplateName(e.target.value)} />
                    <button type="button" className="pxg-btn pxg-btn-s" disabled={!templateName.trim() || savingTemplate} onClick={saveTemplate}>
                      {savingTemplate ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>
              )}

              <div className="pxg-h">Time period</div>
              <div className="pxg-seg">
                {[
                  { id: "week", label: "Last 7 days" },
                  { id: "month", label: "Last 30 days" },
                  { id: "custom", label: "Custom range" },
                ].map(p => (
                  <button key={p.id} type="button" aria-pressed={periodType === p.id}
                    className={`pxg-btn pxg-btn-s${periodType === p.id ? " on" : ""}`} onClick={() => handleSetPeriod(p.id)}>{p.label}</button>
                ))}
              </div>
              {periodType === "custom" ? (
                <div className="pxg-dates">
                  <label><span className="pxg-muted">From</span><input type="date" className="pxg-ins" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></label>
                  <label><span className="pxg-muted">To</span><input type="date" className="pxg-ins" value={dateTo} onChange={e => setDateTo(e.target.value)} /></label>
                </div>
              ) : (
                <div className="pxg-small">{periodLabel}</div>
              )}

              <div className="pxg-h pxg-between">
                <span>What to include</span>
                <span className="pxg-hacts">
                  <span className="pxg-count">{selectedSections.size} of {SECTIONS.length}</span>
                  <button type="button" className="pxg-link" onClick={() => setSelectedSections(new Set(SECTIONS.map(x => x.id)))}>All</button>
                  <button type="button" className="pxg-link" onClick={() => setSelectedSections(new Set())}>None</button>
                </span>
              </div>
              <div className="pxg-ticks">
                {SECTIONS.map(sec => (
                  <PxTick key={sec.id} on={selectedSections.has(sec.id)} onToggle={() => handleToggle(sec.id)} label={`${sec.label}: ${sec.desc}`}>
                    <span title={sec.desc}>{sec.label}</span>
                  </PxTick>
                ))}
              </div>

              {detailSecs.map(sec => (
                <div key={sec.id} className="pxg-optrow">
                  <span className="pxg-optlbl">{sec.label}</span>
                  <div className="pxg-optbody">
                    {sec.subOptions && sec.subOptions(sectionOptions, setOpt)}
                    {sec.id === "symptoms" && (
                      <ExclusionPicker items={symptomItems} excluded={sectionOptions.excludedSymptomIds}
                        onChange={v => setOpt("excludedSymptomIds", v)} nounSingular="symptom/habit" />
                    )}
                    {sec.id === "activities" && (
                      <ExclusionPicker items={activityNameItems} excluded={sectionOptions.excludedActivityNames}
                        onChange={v => setOpt("excludedActivityNames", v)} nounSingular="activity" />
                    )}
                    {sec.id === "alterAppendix" && sectionOptions.alterNames && alterItems.length > 0 && (
                      <>
                        {privacyLevels.length > 0 && (
                          <div className="pxg-seg pxg-mt">
                            <span className="pxg-muted pxg-small">Limit by privacy level</span>
                            {privacyLevels.map((l) => (
                              <button key={l.id} type="button" className="pxg-chip"
                                onClick={() => setOpt("excludedAlterIds", alters.filter((a) => !a.is_archived && !(Array.isArray(a.privacy_levels) && a.privacy_levels.includes(l.id))).map((a) => a.id))}>
                                {l.number}. {l.name}
                              </button>
                            ))}
                            <button type="button" className="pxg-chip" onClick={() => setOpt("excludedAlterIds", [])}>Reset</button>
                          </div>
                        )}
                        <ExclusionPicker items={alterItems} excluded={sectionOptions.excludedAlterIds}
                          onChange={v => setOpt("excludedAlterIds", v)} nounSingular={t.alter} />
                      </>
                    )}
                  </div>
                </div>
              ))}

              <PxTick on={!sectionOptions.alterNames} onToggle={() => setOpt("alterNames", !sectionOptions.alterNames)}>
                Hide names (anonymize)
              </PxTick>

              <div className="pxg-optrow">
                <button type="button" className="pxg-optlbl pxg-link" aria-expanded={showThresholds} onClick={() => setShowThresholds(v => !v)}>
                  Noteworthy {showThresholds ? "▴" : "▾"}
                </button>
                <span className="pxg-optbody pxg-small pxg-muted">When to flag events as notable</span>
              </div>
              {showThresholds && <div className="pxg-box"><NoteworthySettings thresholds={thresholds} onChange={setThresholds} /></div>}

              <div className="pxg-ticks">
                <PxTick on={showCoverPage} onToggle={() => setShowCoverPage(v => !v)}>Include cover page</PxTick>
                <PxTick on={confidentialityNotice} onToggle={() => setConfidentialityNotice(v => !v)}>Confidentiality notice</PxTick>
              </div>
              {showCoverPage && (
                <div className="pxg-stack">
                  <input className="pxg-ins" placeholder={`${t.System} name (e.g. "Our ${t.System}")`} aria-label={`${t.System} name`} value={systemName} onChange={e => setSystemName(e.target.value)} />
                  <input className="pxg-ins" placeholder="Therapist name (optional)" aria-label="Therapist name" value={therapistName} onChange={e => setTherapistName(e.target.value)} />
                  <input className="pxg-ins" type="date" aria-label="Session date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
                  <textarea className="pxg-ins pxg-note" placeholder="Personal note to therapist (optional)" aria-label="Personal note to therapist"
                    value={coverNote} onChange={e => setCoverNote(e.target.value)} />
                </div>
              )}
              {extra}
            </div>
            <div className="pxg-build-foot">
              <button type="button" className="pxg-btn" onClick={() => setShowTemplates(true)}>Save as template</button>
              <span className="pxg-grow" />
              <button type="button" className="pxg-btn" disabled={noSections} onClick={() => onGenerate(buildConfig(true, false))}>
                {loading ? "..." : "Copy as text"}
              </button>
              <button type="button" className="pxg-btn" disabled={noSections} onClick={() => onGenerate(buildConfig(false, false))}
                title="Download the PDF without the preview step">PDF, skip preview</button>
              <button type="button" className="pxg-btn on" disabled={noSections} onClick={() => onGenerate(buildConfig(false, true))}
                title="Preview the full report and take out anything private before the PDF">
                {loading ? "Generating..." : "Generate PDF"}
              </button>
            </div>
          </section>
          <section className="pxg-pn pxg-preview" aria-label="Preview">
            <div className="pxg-ttl"><span>Preview</span><span className="pxg-ttl-sub">{periodLabel}</span></div>
            <div className="pxg-desk-floor">
              {renderPreview ? renderPreview(buildConfig()) : null}
            </div>
          </section>
        </div>
      </PixelBuilderContext.Provider>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">

      {/* Templates */}
      <section className="space-y-2">
        <h3 className="font-semibold text-foreground">Templates</h3>

        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved templates yet. Name your current settings below and tap Save.</p>
        ) : (
          <div className="space-y-1.5">
            {templates.map(tpl => (
              <div key={tpl.id} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/50 bg-card">
                <span className="flex-1 text-sm font-medium truncate">{tpl.name}</span>
                <button
                  type="button"
                  onClick={() => handleLoadTemplate(tpl)}
                  className="text-xs px-3 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium flex-shrink-0"
                >
                  Load
                </button>
                {onDeleteTemplate && (
                  <button
                    type="button"
                    onClick={async () => { if ((await confirm(`Delete template "${tpl.name}"?`))) onDeleteTemplate(tpl.id); }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
                    aria-label="Delete template"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Save current settings as a new template */}
        <div className="flex gap-2 pt-1">
          <Input
            placeholder="Template name…"
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            disabled={!templateName.trim() || savingTemplate}
            onClick={async () => {
              if (!onSaveTemplate) return;
              setSavingTemplate(true);
              try {
                await onSaveTemplate(buildConfig(), templateName.trim());
                setTemplateName("");
              } finally {
                setSavingTemplate(false);
              }
            }}
          >
            {savingTemplate ? "Saving…" : "Save"}
          </Button>
        </div>
      </section>

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
                  ? "bg-primary text-primary-foreground border-primary"
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
                      <>
                        {privacyLevels.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <span className="text-[0.625rem] text-muted-foreground uppercase tracking-wide">Limit by privacy level:</span>
                            {privacyLevels.map((l) => (
                              <button key={l.id} type="button"
                                onClick={() => setOpt("excludedAlterIds", alters.filter((a) => !a.is_archived && !(Array.isArray(a.privacy_levels) && a.privacy_levels.includes(l.id))).map((a) => a.id))}
                                className="text-[0.6875rem] px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground">
                                {l.number}. {l.name}
                              </button>
                            ))}
                            <button type="button" onClick={() => setOpt("excludedAlterIds", [])}
                              className="text-[0.6875rem] px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground hover:bg-muted/40 hover:text-foreground">
                              Reset
                            </button>
                          </div>
                        )}
                        <ExclusionPicker
                          items={alterItems}
                          excluded={sectionOptions.excludedAlterIds}
                          onChange={v => setOpt("excludedAlterIds", v)}
                          nounSingular={t.alter}
                        />
                      </>
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

      {/* Generate */}
      <div className="space-y-2">
        <Button
          onClick={() => onGenerate(buildConfig(false, true))}
          disabled={loading || selectedSections.size === 0}
          className="w-full py-6 text-base"
        >
          {loading ? "Generating…" : "Preview & Customize → PDF"}
        </Button>
        <p className="text-xs text-muted-foreground text-center px-2">
          Recommended — preview the full report and tap × on any entry
          you want to keep private before the final PDF.
        </p>
        <div className="flex gap-3 pt-1">
          <Button
            onClick={() => onGenerate(buildConfig(false, false))}
            disabled={loading || selectedSections.size === 0}
            variant="outline"
            className="flex-1 py-6 text-base"
          >
            {loading ? "Generating…" : "Download PDF (skip preview)"}
          </Button>
          <Button
            onClick={() => onGenerate(buildConfig(true, false))}
            disabled={loading || selectedSections.size === 0}
            variant="outline"
            className="flex-1 py-6 text-base"
          >
            {loading ? "…" : "Copy as Text"}
          </Button>
        </div>
      </div>
    </div>
  );
}
