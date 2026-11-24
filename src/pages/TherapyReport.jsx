import { MedicalDisclaimerFooter } from "@/components/shared/MedicalDisclaimer";
import { useState, useMemo } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { useFrontLevels, filterCountedSessions } from "@/lib/frontLevels";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { localEntities } from "@/api/base44Client";
import ReportBuilder from "@/components/report/ReportBuilder";
import ExportModal from "@/components/report/ExportModal";
import ReportCustomizePreview from "@/components/report/ReportCustomizePreview";
import { toast } from "sonner";
import * as reportSections from "@/lib/reportSections";
import { generateTherapyReport, formatTherapyReportAsText } from "@/lib/reportGenerator";
import TherapyNotesCard from "@/components/report/TherapyNotesCard";
import { useDiaryGroups } from "@/components/diary/DiarySection";
import { sharedList } from "@/lib/sharedLists";
import { useUiLook } from "@/lib/uiLook";
import { useTerms } from "@/lib/useTerms";
import "@/styles/pixel/logs.css";

// Pixel look: the builder's right-hand panel — a paper page showing what the
// report will open with, built by the same section helpers the PDF uses (so
// "Hide names" and whisper redaction apply here too).
function PixelReportPreview({ config, alters, frontingSessions, emotionCheckIns, therapyNotes, levelCfg }) {
  const t = useTerms();
  const { dateFrom, dateTo, selectedSections, thresholds } = config;
  const cfg = config.config;
  const includeAlterInfo = cfg.sectionOptions?.alterNames !== false;
  const data = useMemo(() => {
    try {
      const emotions = reportSections.buildEmotionSection({ dateFrom, dateTo, emotionCheckIns, alters, includeAlterInfo, thresholds, mode: "smart" });
      const fronting = reportSections.buildFrontingSection({
        dateFrom, dateTo, frontingSessions: filterCountedSessions(frontingSessions, levelCfg), alters, includeAlterInfo, thresholds, mode: "smart",
      });
      const notes = reportSections.buildTherapyNotesSection({ dateFrom, dateTo, therapyNotes, alters, includeAlterInfo });
      const days = new Set(emotionCheckIns
        .filter((c) => { const d = String(c.timestamp || c.created_date || "").slice(0, 10); return d >= dateFrom && d <= dateTo; })
        .map((c) => format(new Date(c.timestamp || c.created_date), "yyyy-MM-dd")));
      return { emotions, fronting, notes, days: days.size };
    } catch { return null; }
  }, [dateFrom, dateTo, emotionCheckIns, alters, includeAlterInfo, thresholds, frontingSessions, levelCfg, therapyNotes]);

  const span = (() => {
    try { return Math.max(1, differenceInCalendarDays(new Date(`${dateTo}T12:00:00`), new Date(`${dateFrom}T12:00:00`)) + 1); } catch { return 0; }
  })();
  const fmtDay = (d) => { try { return format(new Date(`${d}T12:00:00`), "MMM d"); } catch { return d; } };
  const head = [cfg.confidentialityNotice ? "CONFIDENTIAL" : null, cfg.therapistName ? `For ${cfg.therapistName}` : null, `${fmtDay(dateFrom)} to ${fmtDay(dateTo)}`].filter(Boolean).join(" · ");
  const rows = (data?.fronting?.summaryTable || []).slice(0, 8);
  const maxSessions = Math.max(1, ...rows.map((r) => r.sessions || 0));
  const colorFor = (name) => (includeAlterInfo ? alters.find((a) => a.name === name || a.alias === name)?.color : null) || "var(--pxg-on)";
  const top = (data?.emotions?.topEmotions || []).slice(0, 3).map((e) => e.emotion);
  const crisis = data?.emotions?.noteworthy || [];
  const show = (id) => selectedSections.has(id);

  return (
    <div className="pxg-paper" aria-label="Report preview">
      <p className="pxg-paper-head">{head}</p>
      {cfg.showCoverPage && (cfg.systemName || cfg.coverNote) && (
        <>
          <h2>{cfg.systemName || "Therapy report"}</h2>
          {cfg.coverNote && <p className="pxg-paper-note">{cfg.coverNote}</p>}
        </>
      )}
      <h2>Overview</h2>
      {data ? (
        <p>
          Check-ins on {data.days} of {span} days.
          {top.length > 0 && <> Most frequent feelings: {top.join(", ")}.</>}
          {crisis.length > 0 && <> {crisis.length} crisis-level check-in{crisis.length !== 1 ? "s" : ""} ({crisis.slice(0, 3).map((c) => c.date.split(",")[0]).join(", ")}).</>}
        </p>
      ) : <p>The preview couldn't be drawn. The PDF still builds from your choices.</p>}
      {show("fronting") && (
        <>
          <h3>{t.Fronting}</h3>
          {rows.length === 0 ? <p>No {t.fronting} recorded in this period.</p> : (
            <div className="pxg-paper-bars">
              {rows.map((r, i) => (
                <div key={`${r.name}-${i}`} className="pxg-paper-bar">
                  <span className="pxg-paper-name">{r.name}</span>
                  <span className="pxg-paper-track"><span style={{ width: `${Math.round((r.sessions / maxSessions) * 100)}%`, background: colorFor(r.name) }} /></span>
                  <span className="pxg-paper-val">{r.total}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {show("therapyNotes") && (data?.notes || []).length > 0 && (
        <>
          <h3>To bring up</h3>
          {data.notes.slice(0, 6).map((n) => <p key={n.id}>{n.note}</p>)}
        </>
      )}
      <p className="pxg-paper-foot">
        {selectedSections.size} section{selectedSections.size !== 1 ? "s" : ""} chosen. Generate PDF shows the whole report first, so you can take out anything before saving.
      </p>
    </div>
  );
}

const localMode = isLocalMode();
const db = localMode ? localEntities : base44.entities;

export default function TherapyReportPage() {
  const queryClient = useQueryClient();
  const pixel = useUiLook() === "pixel";
  const [loading, setLoading] = useState(false);
  const [exportModal, setExportModal] = useState(null);
  // Preview & Customize flow: when the user picks "Preview & Customize"
  // in the builder, we run the same section-building pipeline but
  // park the result here instead of going straight to PDF. The preview
  // modal then lets them prune individual entries before the final
  // export. Shape: { sections, enabledSections, config }.
  const [pendingPreview, setPendingPreview] = useState(null);

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => db.Alter.list(),
  });

  const levelCfg = useFrontLevels();
  const { data: frontingSessions = [] } = useQuery({
    ...sharedList("frontingSessions"),
  });

  const { data: emotionCheckIns = [] } = useQuery({
    ...sharedList("emotionCheckIns"),
  });

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => db.Symptom.list(),
  });

  const { data: symptomCheckIns = [] } = useQuery({
    ...sharedList("symptomCheckIns"),
  });

  const { data: symptomSessions = [] } = useQuery({
    queryKey: ["symptomSessions", "all"],
    queryFn: () => db.SymptomSession.list(),
  });

  const { data: activities = [] } = useQuery({
    ...sharedList("activities"),
  });

  const { data: journalEntries = [] } = useQuery({
    ...sharedList("journalEntries"),
  });

  const diaryGroups = useDiaryGroups();
  const { data: diaryCards = [] } = useQuery({
    ...sharedList("diaryCards"),
  });

  const { data: bulletins = [] } = useQuery({
    ...sharedList("bulletins"),
  });

  const { data: systemCheckIns = [] } = useQuery({
    ...sharedList("systemCheckIns"),
  });

  const { data: tasks = [] } = useQuery({
    ...sharedList("tasks"),
  });

  const { data: activityCategories = [] } = useQuery({
    queryKey: ["activityCategories"],
    queryFn: () => db.ActivityCategory.list(),
  });

  const { data: dailyProgress = [] } = useQuery({
    ...sharedList("dailyProgress"),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["reportTemplates"],
    queryFn: () => db.ReportTemplate.list(),
  });

  const { data: statusNotes = [] } = useQuery({
    ...sharedList("statusNotes"),
  });

  const { data: locations = [] } = useQuery({
    ...sharedList("locations"),
  });

  const { data: sleepLogs = [] } = useQuery({
    queryKey: ["sleepLogs"],
    queryFn: () => db.Sleep.list(),
  });

  const { data: supportEntries = [] } = useQuery({
    queryKey: ["supportJournalEntries"],
    queryFn: () => db.SupportJournalEntry.list(),
  });

  const { data: therapyNotes = [] } = useQuery({
    queryKey: ["therapyNotes"],
    queryFn: () => db.TherapyNote.list(),
    staleTime: 0,
  });

  // A report that carried ~therapy notes has "brought them up": stamp them so
  // the next report starts fresh. Only notes still in the final report (not
  // pruned in Preview & Customize) are stamped; failures never block export.
  const markTherapyNotesReported = async (sections, enabledSections) => {
    if (!enabledSections.has("therapyNotes")) return;
    const ids = (sections.therapyNotes || []).filter(n => !n.alreadyReported).map(n => n.id);
    if (!ids.length) return;
    const now = new Date().toISOString();
    for (const id of ids) {
      try { await db.TherapyNote.update(id, { reported_at: now }); } catch { /* keep it pending */ }
    }
    queryClient.invalidateQueries({ queryKey: ["therapyNotes"] });
  };

  const handleGenerate = async (config) => {
    try {
      setLoading(true);

      const sectionOptions = config.config.sectionOptions || {};

      // Build section data
      const overview = reportSections.buildOverview({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        frontingSessions,
        emotionCheckIns,
        journalEntries,
        symptoms,
        diaryCards,
        alters,
        thresholds: config.thresholds,
        mode: config.mode,
      });

      const includeAlterInfo = sectionOptions.alterNames !== false;

      const fronting = reportSections.buildFrontingSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        // Fronting levels (opt-in): the report's fronting-time numbers skip
        // sessions at a level marked "doesn't count" (e.g. Observing).
        frontingSessions: filterCountedSessions(frontingSessions, levelCfg),
        alters,
        includeAlterInfo,
        thresholds: config.thresholds,
        mode: config.mode,
      });

      const emotions = reportSections.buildEmotionSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        emotionCheckIns,
        alters,
        includeAlterInfo,
        thresholds: config.thresholds,
        mode: config.mode,
      });

      const symptomsData = reportSections.buildSymptomsSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        symptoms,
        symptomCheckIns,
        symptomSessions,
        thresholds: config.thresholds,
        mode: config.mode,
        excludedSymptomIds: new Set(sectionOptions.excludedSymptomIds || []),
      });

      const activitiesData = reportSections.buildActivitiesSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        activities,
        excludedActivityNames: new Set(sectionOptions.excludedActivityNames || []),
      });

      const plansData = reportSections.buildPlansSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        activities,
        categories: activityCategories,
      });

      const journals = reportSections.buildJournalsSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        journalEntries,
        journalDetail: config.config.journalDetail,
      });

      const diary = reportSections.buildDiarySection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        diaryCards,
        alters,
        includeAlterInfo: sectionOptions.alterNames !== false,
        thresholds: config.thresholds,
        diaryDetail: sectionOptions.diaryDetail || "noteworthy",
        diaryGroups,
      });

      const therapyNotesSection = reportSections.buildTherapyNotesSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        therapyNotes,
        alters,
        includeAlterInfo,
      });

      const statusNotesSection = reportSections.buildStatusNotesSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        statusNotes,
      });

      const bulletinsData = reportSections.buildBulletinsSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        bulletins,
        alters,
        includeAlterInfo: sectionOptions.alterNames !== false,
        bulletinDetail: sectionOptions.bulletinDetail || "content",
      });

      const locationsData = reportSections.buildLocationsSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        locations,
      });

      const sleepData = reportSections.buildSleepSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        sleepLogs,
      });

      const supportJournalsData = reportSections.buildSupportJournalsSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        supportEntries,
        supportDetail: sectionOptions.supportDetail || "titles",
      });

      const systemCheckInsData = reportSections.buildSystemCheckInsSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        systemCheckIns,
        alters,
        includeAlterInfo,
      });

      const tasksData = reportSections.buildTasksSummarySection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        tasks,
        dailyProgress,
      });

      const patterns = reportSections.buildPatternsSummary({
        systemName: config.config.systemName,
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        overview,
        frontingData: fronting,
        emotionData: emotions,
        symptomsData,
        diaryData: diary,
        sessions: frontingSessions,
        alters,
        symptomCheckIns,
        symptoms,
        emotionCheckIns,
        sleepLogs,
        includeAlterInfo,
      });

      // Collect alter IDs from report
      const alterIdsInReport = new Set();
      frontingSessions
        .filter(s => reportSections.inRange(s.start_time, config.dateFrom, config.dateTo))
        .forEach(s => {
          const id = s.alter_id || s.primary_alter_id;
          if (id) alterIdsInReport.add(id);
          (s.co_fronter_ids || []).forEach(cid => alterIdsInReport.add(cid));
        });
      emotions.checkInList.forEach(e => {
        if (e.who && e.who !== "a system member") {
          const a = alters.find(x => x.name === e.who);
          if (a) alterIdsInReport.add(a.id);
        }
      });

      const alterAppendix = sectionOptions.alterNames !== false && config.selectedSections.has("alterAppendix")
        ? reportSections.buildAlterAppendix({
            alters,
            alterIdsInReport,
            alterDetail: sectionOptions.alterDetail || "full",
            excludedAlterIds: new Set(sectionOptions.excludedAlterIds || []),
          })
        : [];

      // Determine enabled sections
      const enabledSections = new Set();
      enabledSections.add("overview");
      config.selectedSections.forEach(s => enabledSections.add(s));

      const sections = {
        overview,
        therapyNotes: therapyNotesSection,
        fronting,
        emotions,
        statusNotes: statusNotesSection,
        symptoms: symptomsData,
        activities: activitiesData,
        plans: plansData,
        journals,
        diary,
        locations: locationsData,
        sleep: sleepData,
        bulletins: bulletinsData,
        systemCheckIns: systemCheckInsData,
        supportJournals: supportJournalsData,
        tasks: tasksData,
        patterns,
        alterAppendix,
      };

      // Preview & Customize: park the built sections in state and
      // open the granular preview modal instead of going straight to
      // PDF. The modal's "Generate PDF" button calls runFinalExport
      // below with whatever the user has pruned out.
      if (config.previewBeforeExport) {
        setPendingPreview({ sections, enabledSections, config });
        // No export log yet — only written after the user actually
        // generates the final PDF from the preview modal.
        return;
      }

      // Handle text export
      if (config.exportAsText) {
        const textContent = formatTherapyReportAsText({
          config: config.config,
          sections,
          enabledSections,
        });
        const slug = (config.config.systemName || "system").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        const filename = `${slug}-therapy-report-${config.dateFrom}-to-${config.dateTo}.txt`;
        setExportModal({ content: textContent, filename, format: "text" });
        toast.success("Report ready — copy the text below");
      } else {
        // Generate PDF and show download modal
        const { blob, filename } = await generateTherapyReport({
          config: config.config,
          sections,
          enabledSections,
          sectionOptions,
        });
        setExportModal({ filename, format: "pdf", blob });
        toast.success("PDF ready — tap Save / Share below");
      }

      // Save export log
      await db.ReportExport.create({
        date_from: config.dateFrom,
        date_to: config.dateTo,
        mode: config.mode,
        sections_included: Array.from(config.selectedSections),
      });
      await markTherapyNotesReported(sections, enabledSections);

    } catch (error) {
      toast.error(`Error: ${error.message}`);
      console.error("Report generation error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Called from ReportCustomizePreview after the user prunes per-item
  // entries and confirms. Builds the PDF from the now-filtered sections
  // and routes the result through the existing ExportModal.
  const runFinalExportFromPreview = async (filteredSections) => {
    if (!pendingPreview) return;
    const { enabledSections, config } = pendingPreview;
    try {
      setLoading(true);
      const sectionOptions = config.config.sectionOptions || {};
      const { blob, filename } = await generateTherapyReport({
        config: config.config,
        sections: filteredSections,
        enabledSections,
        sectionOptions,
      });
      await db.ReportExport.create({
        date_from: config.dateFrom,
        date_to: config.dateTo,
        mode: config.mode,
        sections_included: Array.from(config.selectedSections),
      });
      await markTherapyNotesReported(filteredSections, enabledSections);
      setPendingPreview(null);
      setExportModal({ filename, format: "pdf", blob });
      toast.success("PDF ready — tap Save / Share below");
    } catch (error) {
      toast.error(`Error: ${error.message}`);
      console.error("Report generation error:", error);
    } finally {
      setLoading(false);
    }
  };

  const builder = (
    <ReportBuilder
      pixel={pixel}
      extra={pixel ? <TherapyNotesCard notes={therapyNotes} /> : null}
      renderPreview={pixel ? (config) => (
        <PixelReportPreview config={config} alters={alters} frontingSessions={frontingSessions}
          emotionCheckIns={emotionCheckIns} therapyNotes={therapyNotes} levelCfg={levelCfg} />
      ) : null}
      templates={templates}
      onGenerate={handleGenerate}
      onSaveTemplate={async (config, name) => {
        const sectionOptions = config.config.sectionOptions || {};
        await db.ReportTemplate.create({
          name,
          period_type: "custom",
          mode: config.mode,
          sections_config: {
            ...Object.fromEntries(Array.from(config.selectedSections).map(s => [s, true])),
            // Saved explicitly so "off" survives a reload (a missing key means
            // an older template, which keeps the section on).
            therapyNotes: config.selectedSections.has("therapyNotes"),
          },
          noteworthy_thresholds: config.thresholds,
          include_alter_info: config.config.includeAlterInfo,
          show_cover_page: config.config.showCoverPage,
          cover_note: config.config.coverNote,
          system_name: config.config.systemName,
          therapist_name: config.config.therapistName,
          confidentiality_notice: config.config.confidentialityNotice,
          journal_detail: config.config.journalDetail,
          section_options: sectionOptions,
        });
        queryClient.invalidateQueries({ queryKey: ["reportTemplates"] });
        toast.success(`Template "${name}" saved!`);
      }}
      onDeleteTemplate={async (id) => {
        await db.ReportTemplate.delete(id);
        queryClient.invalidateQueries({ queryKey: ["reportTemplates"] });
      }}
      loading={loading}
      symptoms={symptoms}
      activities={activities}
      alters={alters}
    />
  );

  const dialogs = (
    <>
      <ReportCustomizePreview
        isOpen={!!pendingPreview}
        onClose={() => setPendingPreview(null)}
        sections={pendingPreview?.sections}
        enabledSections={pendingPreview?.enabledSections}
        onGenerate={runFinalExportFromPreview}
        loading={loading}
      />
      <ExportModal
        isOpen={!!exportModal}
        onClose={() => setExportModal(null)}
        content={exportModal?.content || ""}
        filename={exportModal?.filename || ""}
        format={exportModal?.format || "json"}
        blob={exportModal?.blob}
      />
    </>
  );

  if (pixel) {
    return (
      <div data-tour="therapy-report-builder" className="pxg-report-page">
        {builder}
        {/* Clinician-facing output — the disclaimer must travel with it. */}
        <MedicalDisclaimerFooter className="mt-4" />
        {dialogs}
      </div>
    );
  }

  return (
    <div data-tour="therapy-report-builder" className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-foreground">Therapy Report</h1>
        <p className="text-muted-foreground mt-2">
          Create a structured report to bring to your therapist. The report bridges the amnesia gap by surfacing what happened, who was fronting, and what was notable.
        </p>
      </div>

      <TherapyNotesCard notes={therapyNotes} />

      {builder}

      <ReportCustomizePreview
        isOpen={!!pendingPreview}
        onClose={() => setPendingPreview(null)}
        sections={pendingPreview?.sections}
        enabledSections={pendingPreview?.enabledSections}
        onGenerate={runFinalExportFromPreview}
        loading={loading}
      />

      {/* Clinician-facing output — the disclaimer must travel with it. */}
      <MedicalDisclaimerFooter className="mt-6" />

      <ExportModal
        isOpen={!!exportModal}
        onClose={() => setExportModal(null)}
        content={exportModal?.content || ""}
        filename={exportModal?.filename || ""}
        format={exportModal?.format || "json"}
        blob={exportModal?.blob}
      />
    </div>
  );
}