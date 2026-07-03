import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Sparkles, Plus, Share2, Download } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import AlterGrid from "@/components/alters/AlterGrid";
import CurrentFronters from "@/components/dashboard/CurrentFronters";
import AlterEditModal from "@/components/alters/AlterEditModal";
import AlterExportModal from "@/components/alters/AlterExportModal";
import ImportAltersModal from "@/components/alters/ImportAltersModal";
import SystemHeaderCard from "@/components/system/SystemHeaderCard";
import { useTerms } from "@/lib/useTerms";
import { useDeepLinkHighlight } from "@/lib/useDeepLinkHighlight";
import { DEFAULT_CONFIG } from "@/utils/navigationConfig";

export default function Home() {
  const [searchParams] = useSearchParams();
  const [showAddAlter, setShowAddAlter] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const terms = useTerms();

  // Handle bulletin deep-link
  useDeepLinkHighlight("bulletinId", "bulletin-");

  const { data: alters = [], isLoading: altersLoading } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list()
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list()
  });

  const systemSettings = settings[0] || null;

  const activeAlters = alters.filter((a) => !a.is_archived);
  const archivedAlters = alters.filter((a) => a.is_archived);

  const navConfig = useMemo(() => {
    return systemSettings?.navigation_config || DEFAULT_CONFIG;
  }, [systemSettings]);

  if (altersLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-xs text-muted-foreground">Loading...</p>
      </div>);
  }

  if (activeAlters.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-24 text-center">
        
        <div className="w-20 h-20 rounded-3xl bg-primary/5 flex items-center justify-center mb-6">
          <Sparkles className="w-9 h-9 text-primary/40" />
        </div>
        <h1 className="font-display text-3xl font-semibold text-foreground mb-2">
          Welcome to Oceans Symphony
        </h1>
        <p className="text-muted-foreground max-w-md leading-relaxed mb-8">
          Import your {terms.alters} from another plural app, or add them manually.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setShowImport(true)} className="rounded-xl px-6 gap-2">
            <Download className="w-4 h-4" />
            Import {terms.alters}
          </Button>
          <Button onClick={() => setShowAddAlter(true)} className="bg-primary hover:bg-primary/90 rounded-xl px-6">
            <Plus className="w-4 h-4 mr-2" />
            Add {terms.Alter}
          </Button>
        </div>
        <AlterEditModal open={showAddAlter} onClose={() => setShowAddAlter(false)} mode="create" />
        <ImportAltersModal open={showImport} onClose={() => setShowImport(false)} />
      </motion.div>);

  }

  return (
    <div>
      <motion.div
        data-tour="system-profile"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}>
        <SystemHeaderCard
          settings={systemSettings}
          action={
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowImport(true)}
                aria-label={`Import ${terms.alters}`}
                title={`Import ${terms.alters} from another plural app`}
                className="gap-1.5">
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Import</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowExport(true)}
                aria-label={`Export ${terms.alters}`}
                title={`Export ${terms.alters} to share`}
                className="gap-1.5">
                <Share2 className="w-4 h-4" />
                <span className="hidden sm:inline">Export</span>
              </Button>
              <Button
                data-tour="alter-add-btn"
                size="sm"
                onClick={() => setShowAddAlter(true)}
                className="bg-primary hover:bg-primary/90 gap-1.5">
                <Plus className="w-4 h-4" />
                Add {terms.Alter}
              </Button>
            </div>
          }
        />
      </motion.div>

      <div className="mb-4">
        <CurrentFronters alters={activeAlters} />
      </div>
      {/* This page (/Home) is the alters directory. Upcoming-plans
          surfaces with placement="home_top" / "home_bottom" now render
          on the Dashboard (/) instead — that's what their Settings
          labels say and where users expect them. */}
      <div data-tour="alters-grid">
        <AlterGrid alters={activeAlters} />
      </div>

      <AlterEditModal
        open={showAddAlter}
        onClose={() => setShowAddAlter(false)}
        mode="create" />

      <AlterExportModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        alters={alters} />

      <ImportAltersModal open={showImport} onClose={() => setShowImport(false)} />

    </div>);

}