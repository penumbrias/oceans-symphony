import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { localEntities } from "@/api/base44Client";
import ReportBuilder from "@/components/report/ReportBuilder";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/components/ui/use-toast";
import * as reportSections from "@/lib/reportSections";
import { generateTherapyReport } from "@/lib/reportGenerator";

const localMode = isLocalMode();
const db = localMode ? localEntities : base44.entities;

export default function TherapyReportPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

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

  const { data: templates = [] } = useQuery({
    queryKey: ["reportTemplates"],
    queryFn: () => db.ReportTemplate.list(),
  });

  const handleGenerate = async (config) => {
    try {
      setLoading(true);

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

      const fronting = reportSections.buildFrontingSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        frontingSessions,
        alters,
        includeAlterInfo: config.config.includeAlterInfo !== false,
        thresholds: config.thresholds,
        mode: config.mode,
      });

      const emotions = reportSections.buildEmotionSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        emotionCheckIns,
        alters,
        includeAlterInfo: config.config.includeAlterInfo !== false,
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
      });

      const activitiesData = reportSections.buildActivitiesSection({
        dateFrom: config.dateFrom,
        dateTo: config.dateTo,
        activities,
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
        includeAlterInfo: config.config.includeAlterInfo !== false,
        thresholds: config.thresholds,
        mode: config.mode,
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
      });

      // Collect alter IDs from report
      const alterIdsInReport = new Set();
      fronting.sessionList.forEach(s => {
        const id = frontingSessions.find(fs => fs.start_time === s.date)?.alter_id;
        if (id) alterIdsInReport.add(id);
      });
      emotions.checkInList.forEach(e => {
        if (e.who && e.who !== "a system member") {
          const a = alters.find(x => x.name === e.who);
          if (a) alterIdsInReport.add(a.id);
        }
      });

      const alterAppendix = config.config.includeAlterInfo && config.selectedSections.has("alterAppendix")
        ? reportSections.buildAlterAppendix({ alters, alterIdsInReport })
        : [];

      // Determine enabled sections
      const enabledSections = new Set();
      enabledSections.add("overview");
      config.selectedSections.forEach(s => enabledSections.add(s));

      // Generate PDF
      await generateTherapyReport({
        config: config.config,
        sections: {
          overview,
          fronting,
          emotions,
          symptoms: symptomsData,
          activities: activitiesData,
          journals,
          diary,
          patterns,
          alterAppendix,
        },
        enabledSections,
      });

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

      toast({
        title: "Report generated!",
        description: "Your therapy report PDF has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Error generating report",
        description: error.message,
        variant: "destructive",
      });
      console.error("Report generation error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
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
      />
    </div>
  );
}