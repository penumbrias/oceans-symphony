import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp, ArrowUp, ArrowDown } from "lucide-react";
import { ALL_PAGES, DEFAULT_CONFIG } from "@/utils/navigationConfig";
import { useTerms } from "@/lib/useTerms";
import { isNative } from "@/lib/platform";

function ActiveItem({ label, checked, onToggle, onMoveUp, onMoveDown, isFirst, isLast }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-card border border-border/50">
      <div className="flex flex-col gap-0.5">
        <button onClick={onMoveUp} disabled={isFirst} className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed">
          <ArrowUp className="w-3 h-3" />
        </button>
        <button onClick={onMoveDown} disabled={isLast} className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed">
          <ArrowDown className="w-3 h-3" />
        </button>
      </div>
      <span className="flex-1 text-sm text-foreground">{label}</span>
      <Checkbox checked={checked} onCheckedChange={onToggle} />
    </div>
  );
}

// Navigation-bar config. The dashboard grid is edited directly on the
// dashboard page (its own drag-to-arrange UI), so it's intentionally
// NOT editable here anymore — this surface is only the nav bars.
//
// The top navigation bar isn't shown on mobile, so on native (and when
// `showTopBar` is false) we present only the mobile bottom bar to avoid
// offering an irrelevant control. On web, both are shown.
export default function NavigationSettings({ settings, showTopBar }) {
  const queryClient = useQueryClient();
  const terms = useTerms();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [openSection, setOpenSection] = useState(null);

  // Default to hiding the top-bar config on native; let the caller
  // override via the explicit `showTopBar` prop.
  const topBarVisible = showTopBar !== undefined ? showTopBar : !isNative();

  const pageTermMap = {
    alters:           terms.Alters,
    checkin:          `${terms.System} Meeting`,
    "system-map":     `${terms.System} Map`,
    "system-history": `${terms.System} History`,
  };
  const resolveLabel = (pageId) => {
    const page = ALL_PAGES.find(p => p.id === pageId);
    return pageTermMap[pageId] || page?.label || pageId;
  };

  useEffect(() => {
    if (settings?.navigation_config) {
      const saved = settings.navigation_config;
      const removed = saved.dashboardGridRemoved || [];
      // Preserve the saved dashboardGrid + its merge behaviour even though
      // this surface no longer edits it — the dashboard page reads it and
      // we must not clobber the user's grid when saving the nav bars.
      const merged = {
        ...saved,
        dashboardGridRemoved: removed,
        dashboardGrid: [
          ...(saved.dashboardGrid || []),
          ...DEFAULT_CONFIG.dashboardGrid.filter(id => !(saved.dashboardGrid || []).includes(id) && !removed.includes(id)),
        ],
      };
      setConfig(merged);
    } else {
      setConfig(DEFAULT_CONFIG);
    }
  }, [settings?.navigation_config]);

  // Autosave: persist the given config immediately (no save button).
  const persist = async (cfg) => {
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, { navigation_config: cfg });
      } else {
        await base44.entities.SystemSettings.create({ navigation_config: cfg });
      }
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) {
      console.warn("[NavigationSettings] save failed:", e?.message || e);
    }
  };

  const handleToggle = (location, pageId) => {
    const list = [...(config[location] || [])];
    const idx = list.indexOf(pageId);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      const maxLen = location === "topBar" ? 6 : 5;
      if (list.length < maxLen) list.push(pageId);
    }
    const next = { ...config, [location]: list };
    setConfig(next);
    persist(next);
  };

  const handleMove = (location, index, direction) => {
    const list = [...(config[location] || [])];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    [list[index], list[targetIndex]] = [list[targetIndex], list[index]];
    const next = { ...config, [location]: list };
    setConfig(next);
    persist(next);
  };

  // Only the nav bars are editable here. Top bar is filtered out where
  // it isn't shown (native / mobile).
  const locations = topBarVisible ? ["bottomBar", "topBar"] : ["bottomBar"];

  return (
    <div className="space-y-2">
      {locations.map(location => {
        const maxLen = location === "topBar" ? 6 : 5;
        const count = config[location]?.length || 0;
        const isOpen = openSection === location;
        const sectionLabel = location === "topBar" ? "Top navigation bar" : "Mobile bottom bar";
        const checkedItems = config[location] || [];
        const uncheckedItems = ALL_PAGES.filter(p => !checkedItems.includes(p.id));

        return (
          <div key={location} className="border border-border/50 rounded-lg overflow-hidden">
            <button
              onClick={() => setOpenSection(isOpen ? null : location)}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">{sectionLabel}</span>
                <span className="text-xs text-muted-foreground ml-2">{count}/{maxLen}</span>
              </div>
              {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground ml-1" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-1" />}
            </button>

            {isOpen && (
              <div className="px-3 py-3 border-t border-border/40 bg-muted/5 space-y-3">
                <div className="space-y-2">
                  {checkedItems.map((pageId, index) => {
                    const page = ALL_PAGES.find(p => p.id === pageId);
                    if (!page) return null;
                    return (
                      <ActiveItem
                        key={page.id}
                        label={resolveLabel(page.id)}
                        checked
                        onToggle={() => handleToggle(location, page.id)}
                        onMoveUp={() => handleMove(location, index, -1)}
                        onMoveDown={() => handleMove(location, index, 1)}
                        isFirst={index === 0}
                        isLast={index === checkedItems.length - 1}
                      />
                    );
                  })}
                </div>

                {uncheckedItems.length > 0 && (
                  <div className="space-y-2 mt-3 pt-3 border-t border-border/30">
                    {uncheckedItems.map(page => (
                      <div key={page.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20 opacity-60">
                        <div className="w-4 h-4" />
                        <span className="flex-1 text-sm text-muted-foreground">{resolveLabel(page.id)}</span>
                        <Checkbox
                          checked={false}
                          disabled={count >= maxLen}
                          onCheckedChange={() => handleToggle(location, page.id)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}