import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Users, Sparkles, Plus } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import AlterGrid from "@/components/alters/AlterGrid";
import FrontingBar from "@/components/fronting/FrontingBar";
import AlterEditModal from "@/components/alters/AlterEditModal";
import { useTerms } from "@/lib/useTerms";
import { ALL_PAGES, DEFAULT_CONFIG } from "@/utils/navigationConfig";
import { useMentionHighlight } from "@/lib/useMentionHighlight";

export default function Home() {
  const [showAddAlter, setShowAddAlter] = useState(false);
  const [groupFilter, setGroupFilter] = useState(null);
  const terms = useTerms();
  const [searchParams] = useSearchParams();
  const bulletinId = searchParams.get("bulletinId");

  useMentionHighlight("id", !!bulletinId);

  const { data: alters = [], isLoading: altersLoading } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list()
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list()
  });

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list()
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["frontHistory"],
    queryFn: () => base44.entities.FrontingSession.list("-start_time", 50)
  });

  const systemSettings = settings[0] || null;
  const isConnected = !!systemSettings?.sp_token;
  const activeSession = sessions.find((s) => s.is_active);

  const activeAlters = alters.filter((a) => !a.is_archived);
  const archivedAlters = alters.filter((a) => a.is_archived);

  const filteredAlters = groupFilter
    ? activeAlters.filter((a) => groups.find((g) => g.id === groupFilter)?.alter_ids?.includes(a.id))
    : activeAlters;

  const navConfig = useMemo(() => {
    return systemSettings?.navigation_config || DEFAULT_CONFIG;
  }, [systemSettings]);

  if (altersLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>);

  }

  if (!isConnected && activeAlters.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-24 text-center">
        
        <div className="w-20 h-20 rounded-3xl bg-primary/5 flex items-center justify-center mb-6">
          <Sparkles className="w-9 h-9 text-primary/40" />
        </div>
        <h1 className="font-display text-3xl font-semibold text-foreground mb-2">
          Welcome to Innerworld
        </h1>
        <p className="text-muted-foreground max-w-md leading-relaxed mb-8">
          Connect your Simply Plural account to import {terms.alters}, or add them manually.
        </p>
        <div className="flex gap-3">
          <Link to="/settings">
            <Button variant="outline" className="rounded-xl px-6">
              Connect Simply Plural
            </Button>
          </Link>
          <Button onClick={() => setShowAddAlter(true)} className="bg-primary hover:bg-primary/90 rounded-xl px-6">
            <Plus className="w-4 h-4 mr-2" />
            Add {terms.Alter}
          </Button>
        </div>
        <AlterEditModal open={showAddAlter} onClose={() => setShowAddAlter(false)} mode="create" />
      </motion.div>);

  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }} className="mb-3 flex items-start justify-between">

        
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground">
            {systemSettings?.system_name || "Your System"}
          </h1>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            <Users className="w-4 h-4" />
            {activeAlters.length} active {activeAlters.length !== 1 ? terms.alters : terms.alter}
            {archivedAlters.length > 0 &&
            <span className="text-muted-foreground/60">· {archivedAlters.length} archived</span>
            }
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAddAlter(true)}
          className="bg-primary hover:bg-primary/90 gap-1.5">
          
          <Plus className="w-4 h-4" />
          Add {terms.Alter}
        </Button>
      </motion.div>

      <FrontingBar alters={activeAlters} />

      {/* Group Filter */}
      {groups.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
          <button
            onClick={() => setGroupFilter(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              !groupFilter ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            All {terms.alters}
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => setGroupFilter(group.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                groupFilter === group.id ? "text-white border-transparent" : "border-border text-muted-foreground hover:border-primary/40"
              }`}
              style={groupFilter === group.id ? { backgroundColor: group.color || "hsl(var(--primary))" } : {}}
            >
              {group.icon && <span>{group.icon}</span>}
              {group.name}
              <span className="opacity-70">({group.alter_ids?.length || 0})</span>
            </button>
          ))}
        </div>
      )}

      <AlterGrid alters={filteredAlters} currentSession={activeSession} />

      <AlterEditModal
        open={showAddAlter}
        onClose={() => setShowAddAlter(false)}
        mode="create" />
      
    </div>);

}