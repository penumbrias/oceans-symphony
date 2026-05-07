import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { localEntities } from "@/api/base44Client";
import ReportBuilder from "@/components/report/ReportBuilder";
import ExportModal from "@/components/report/ExportModal";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "sonner";
import * as reportSections from "@/lib/reportSections";
import { generateTherapyReport, formatTherapyReportAsText } from "@/lib/reportGenerator";

const localMode = isLocalMode();
const db = localMode ? localEntities : base44.entities;

export default function TherapyReportPage() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [exportModal, setExportModal] = useState(null);

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => db.Alter.list(),
  });

  const { data: frontingSessions = [] } = useQuery({
    queryKey: ["frontingSessions"],
    queryFn: () => db.FrontingSession.list(),
  });

  const { data: emotionCheckIns = [] } = useQuery({
    queryKey: ["emotionCheckIns"],
    queryFn: () => db.EmotionCheckIn.list(),
  });

  const { data: symptoms = [] } = useQuery({
    queryKey: ["symptoms"],
    queryFn: () => db.Symptom.list(),
  });

  const { data: symptomCheckIns = [] } = useQuery({
    queryKey: ["symptomCheckIns"],
    queryFn: () => db.SymptomCheckIn.list(),
  });

  const { data: symptomSessions = [] } = useQuery({
    queryKey: ["symptomSessions"],
    queryFn: () => db.SymptomSession.list(),
  });

  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => db.Activity.list(),
  });

  const { data: journalEntries = [] } = useQuery({
    queryKey: ["journalEntries"],
    queryFn: () => db.JournalEntry.list(),
  });

  const { data: diaryCards = [] } = useQuery({
    queryKey: ["diaryCards"],
    queryFn: () => db.DiaryCard.list(),
  });

  const { data: bulletins = [] } = useQuery({
    queryKey: ["bulletins"],
    queryFn: () => db.Bulletin.list(),
  });

  const { data: systemCheckIns = [] } = useQuery({
    queryKey: ["systemCheckIns"],
    queryFn: () => db.SystemCheckIn.list(),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => db.Task.list(),
  });

  const { data: dailyProgress = [] } = useQuery({
    queryKey: ["dailyProgress"],
    queryFn: () => db.DailyProgress.list(),
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["reportTemplates"],
    queryFn: () => db.ReportTemplate.list(),
  });

  const { data: statusNotes = [] } = useQuery({
    queryKey: ["statusNotes"],
    queryFn: () => localEntities.StatusNote.list(),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => localEntities.Location.list(),
  });

  const { data: sleepLogs = [] } = useQuery({
    queryKey: ["sleepLogs"],
    queryFn: () => db.Sleep.list(),
  });

  const { data: supportEntries = [] } = useQuery({
    queryKey: ["supportJournalEntries"],
    queryFn: () => db.SupportJournalEntry.list(),
  });

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
        frontingSessions,
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
        fronting,
        emotions,
        statusNotes: statusNotesSection,
        symptoms: symptomsData,
        activities: activitiesData,
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

      // Save template if requested
      if (config.saveAsTemplate) {
        await db.ReportTemplate.create({
          name: config.saveAsTemplate.name,
          period_type: "custom",
          mode: config.mode,
          sections_config: Object.fromEntries(config.selectedSections.map(s => [s, true])),
          noteworthy_thresholds: config.thresholds,
          include_alter_info: config.config.includeAlterInfo,
          show_cover_page: config.config.showCoverPage,
          cover_note: config.config.coverNote,
          system_name: config.config.systemName,
          therapist_name: config.config.therapistName,
          confidentiality_notice: config.config.confidentialityNotice,
          journal_detail: config.config.journalDetail,
        });
        queryClient.invalidateQueries({ queryKey: ["reportTemplates"] });
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
      console.error("Report generation error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-tour="therapy-report-builder" className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Therapy Report</h1>
        <p className="text-muted-foreground mt-2">
          Create a structured report to bring to your therapist. The report bridges the amnesia gap by surfacing what happened, who was fronting, and what was notable.
        </p>
      </div>

      <ReportBuilder
        templates={templates}
        onGenerate={handleGenerate}
        loading={loading}
        symptoms={symptoms}
        activities={activities}
        alters={alters}
      />

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