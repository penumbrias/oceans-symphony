// The Guide's Setup phase hub: a checklist of the remaining setup tasks
// the user can tick off in any order (v0.84.9 per owner). Progress
// persists to localStorage under CHECKLIST_KEY so re-entering the guide
// (via the dashboard "Continue setup" chip, or Settings → About →
// Re-run setup) picks up where the user left off — checked items stay
// checked. Each item expands inline to show the interactive UI or a
// direct link.

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Heart, Activity as ActivityIcon, CloudOff, Check, ChevronDown, ChevronRight, Download, Plus, ExternalLink, ShieldAlert, Sparkles, Settings2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/lib/useTerms";
import CustomEmotionsManager from "@/components/settings/CustomEmotionsManager";
import AutoBackupSettings from "@/components/settings/AutoBackupSettings";
import ImportAltersModal from "@/components/alters/ImportAltersModal";
import { BundleList } from "@/components/symptoms/BundlePicker";
import ActivityCustomizationMenu from "@/components/activities/ActivityCustomizationMenu";

export const CHECKLIST_KEY = "symphony_setup_checklist_v1";
export const CHECKLIST_ITEMS = ["alters", "tracking", "activity", "backup"];

export function loadChecklist() {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch { return {}; }
}
export function saveChecklist(state) {
  try { localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state || {})); } catch { /* storage off */ }
}
export function checklistComplete(state = loadChecklist()) {
  return CHECKLIST_ITEMS.every((k) => !!state[k]);
}
export function checklistProgress(state = loadChecklist()) {
  const done = CHECKLIST_ITEMS.filter((k) => !!state[k]).length;
  return { done, total: CHECKLIST_ITEMS.length };
}

function ChecklistItem({ id, icon: Icon, title, description, done, expanded, onToggleExpand, onToggleDone, highlight, children }) {
  return (
    <div
      className={`border rounded-xl overflow-hidden ${
        highlight ? "border-amber-500/60 bg-amber-500/5 ring-1 ring-amber-500/20" : "border-border/60"
      }`}
    >
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
      >
        {highlight && (
          <span
            className="text-[0.5625rem] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 border border-amber-500/50 rounded px-1 py-px flex-shrink-0"
            title="Please don't skip this one"
          >
            Important
          </span>
        )}
        <span
          onClick={(e) => { e.stopPropagation(); onToggleDone(); }}
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Mark ${title} as not done` : `Mark ${title} as done`}
          className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
            done
              ? "bg-primary border-primary text-primary-foreground"
              : "border-border/70 hover:border-primary"
          }`}
        >
          {done && <Check className="w-3 h-3" />}
        </span>
        <Icon className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="flex-1 min-w-0">
          <span className={`text-sm font-medium block ${done ? "line-through text-muted-foreground" : ""}`}>{title}</span>
          <span className="text-xs text-muted-foreground block truncate">{description}</span>
        </span>
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>
      {expanded && (
        <div className="border-t border-border/50 px-3 py-3 space-y-3 bg-muted/10">
          {children}
          <div className="flex justify-end pt-1">
            <Button size="sm" variant={done ? "outline" : "default"} onClick={onToggleDone} className="text-xs">
              {done ? "Not done yet" : "Mark done"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// `bundleProps` lets the parent (TourModal) hand in the bundle picker's
// wired-up state so the Tracking section can host it inline (v0.85 —
// picker moved out of its own pre-checklist page and into this hub).
export default function SetupChecklist({ onCloseGuide, bundleProps = null }) {
  const t = useTerms();
  const navigate = useNavigate();
  const [state, setState] = useState(() => loadChecklist());
  const [expanded, setExpanded] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showActivityMenu, setShowActivityMenu] = useState(false);

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities"],
    queryFn: () => base44.entities.Activity.list("-timestamp", 5),
  });

  // Auto-detect completion when the underlying data exists — respects the
  // user's manual override (if they've explicitly marked something done or
  // undone, we don't fight them).
  useEffect(() => {
    setState((prev) => {
      const next = { ...prev };
      let changed = false;
      if (alters.filter((a) => !a.is_archived).length > 0 && !prev.altersUserToggled && !prev.alters) {
        next.alters = true; changed = true;
      }
      if (activities.length > 0 && !prev.activityUserToggled && !prev.activity) {
        next.activity = true; changed = true;
      }
      if (changed) { saveChecklist(next); return next; }
      return prev;
    });
  }, [alters, activities]);

  const toggle = (id) => {
    setState((prev) => {
      const next = { ...prev, [id]: !prev[id], [`${id}UserToggled`]: true };
      saveChecklist(next);
      return next;
    });
  };

  const progress = useMemo(() => {
    const done = CHECKLIST_ITEMS.filter((k) => !!state[k]).length;
    return { done, total: CHECKLIST_ITEMS.length };
  }, [state]);

  const items = [
    {
      id: "alters",
      icon: Users,
      title: `${t.Alters} setup`,
      description: `Add ${t.alters} one at a time, or import a backup.`,
      content: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            You can add {t.alters} one by one from the {t.Alters} page, or import from Simply Plural,
            PluralKit, or a Symphony backup.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => { onCloseGuide?.(); navigate("/Home"); }} className="text-xs gap-1">
              <Plus className="w-3 h-3" /> Add {t.alters}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowImport(true)} className="text-xs gap-1">
              <Download className="w-3 h-3" /> Import
            </Button>
          </div>
          <ImportAltersModal open={showImport} onClose={() => setShowImport(false)} />
        </div>
      ),
    },
    {
      id: "tracking",
      icon: Heart,
      title: "Tracking setup",
      description: "Choose what to track, tune emotions, rename groups.",
      content: (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Oceans Symphony is designed to help you learn about and understand your {t.system}.
              The following preset packages are categories of experiences and symptoms that can be
              worthwhile for some to keep an eye on — pick as many or as few as you would like.
            </p>
            {bundleProps ? (
              <BundleList
                existingKeys={bundleProps.existingKeys}
                selected={bundleProps.selected}
                onToggleItem={bundleProps.onToggleItem}
                onToggleBundle={bundleProps.onToggleBundle}
                terms={bundleProps.terms}
              />
            ) : null}
            {bundleProps?.applyBundlesDiff && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => { await bundleProps.applyBundlesDiff(); }}
                  className="text-xs"
                >
                  Save tracking selection
                </Button>
              </div>
            )}
          </div>
          <div className="border-t border-border/40 pt-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              And tune emotions — mark distress, rename groups, add your own:
            </p>
            <CustomEmotionsManager />
          </div>
          <Button size="sm" variant="outline" onClick={() => { onCloseGuide?.(); navigate("/manage-checkin"); }} className="text-xs gap-1">
            Open check-in manager (sections, diary, more) <ExternalLink className="w-3 h-3" />
          </Button>
        </div>
      ),
    },
    {
      id: "activity",
      icon: ActivityIcon,
      title: "Activity tracker",
      description: "Add activities and sub-activities you'd like to track.",
      content: (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            The Activity tracker records what you're doing throughout the day — logged retroactively
            or planned ahead, in nested categories (Self-care → Hygiene → Shower). It powers the
            timeline's activity column and "goals" progress bars.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setShowActivityMenu(true)} className="text-xs gap-1">
              <Settings2 className="w-3 h-3" /> Add activities &amp; sub-activities
            </Button>
            <Button size="sm" variant="outline" onClick={() => { onCloseGuide?.(); navigate("/activities"); }} className="text-xs gap-1">
              Open full tracker <ExternalLink className="w-3 h-3" />
            </Button>
          </div>
          {showActivityMenu && <ActivityCustomizationMenu onClose={() => setShowActivityMenu(false)} />}
        </div>
      ),
    },
    {
      id: "backup",
      icon: ShieldAlert,
      title: "Backups & optional encryption",
      description: "Local means no cloud copy — please don't skip.",
      highlight: true,
      content: (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Automatic backups save a copy on a schedule (native only). Optional at-rest encryption
            lives in Settings → Data & privacy → Storage & encryption.
          </p>
          <AutoBackupSettings />
          <Button size="sm" variant="outline" onClick={() => { onCloseGuide?.(); navigate("/settings#data"); }} className="text-xs gap-1">
            Open Data &amp; privacy <ExternalLink className="w-3 h-3" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pick what fits — check items off as you go. Everything's editable later in Settings, and
        you can leave and come back to this guide from the dashboard.
      </p>
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          {progress.done} of {progress.total} done
        </span>
        <div className="h-1.5 flex-1 mx-3 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <ChecklistItem
            key={item.id}
            id={item.id}
            icon={item.icon}
            title={item.title}
            description={item.description}
            done={!!state[item.id]}
            expanded={expanded === item.id}
            highlight={!!item.highlight && !state[item.id]}
            onToggleExpand={() => setExpanded((cur) => (cur === item.id ? null : item.id))}
            onToggleDone={() => toggle(item.id)}
          >
            {item.content}
          </ChecklistItem>
        ))}
      </div>
    </div>
  );
}
