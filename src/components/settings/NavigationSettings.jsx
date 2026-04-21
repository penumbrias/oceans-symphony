import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Navigation, Save, Loader2, ChevronDown, ChevronUp, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, X } from "lucide-react";
import { ALL_PAGES, DEFAULT_CONFIG } from "@/utils/navigationConfig";

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

// 3-column grid editor for Dashboard Grid
function DashboardGridEditor({ checkedItems, onMove, onToggle }) {
  const COLS = 3;
  const totalItems = checkedItems.length;

  const rows = [];
  for (let i = 0; i < totalItems; i += COLS) {
    rows.push(checkedItems.slice(i, i + COLS));
  }

  const swap = (a, b) => {
    if (a < 0 || b < 0 || a >= totalItems || b >= totalItems) return;
    onMove(a, b);
  };

  return (
    <div className="space-y-1.5">
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: COLS }).map((_, colIdx) => {
            const item = row[colIdx];
            const flatIdx = rowIdx * COLS + colIdx;
            if (!item) return <div key={colIdx} className="rounded-lg border border-dashed border-border/20 h-20" />;

            const page = ALL_PAGES.find(p => p.id === item);
            const label = page?.label || item;

            const canUp    = rowIdx > 0;
            const canDown  = flatIdx + COLS < totalItems;
            const canLeft  = colIdx > 0;
            const canRight = colIdx < COLS - 1 && flatIdx + 1 < totalItems;

            const textAlign = colIdx === 0 ? "text-left" : colIdx === 1 ? "text-center" : "text-right";
            const justifyLabel = colIdx === 0 ? "justify-start" : colIdx === 1 ? "justify-center" : "justify-end";

            return (
              <div key={item} className="relative rounded-lg border border-border/50 bg-card flex flex-col items-center h-20">
                {/* Remove */}
                <button
                  onClick={() => onToggle(item)}
                  className="absolute top-0.5 right-0.5 p-0.5 text-muted-foreground hover:text-destructive transition-colors z-10"
                >
                  <X className="w-3 h-3" />
                </button>

                {/* Up */}
                <div className="h-5 flex items-center justify-center">
                  {canUp
                    ? <button onClick={() => swap(flatIdx, flatIdx - COLS)} className="p-0.5 text-muted-foreground hover:text-foreground"><ArrowUp className="w-3 h-3" /></button>
                    : <div className="w-4 h-4" />}
                </div>

                {/* Middle row: left | label | right */}
                <div className="flex items-center w-full flex-1 overflow-hidden">
                  <div className="w-4 flex-shrink-0 flex items-center justify-center">
                    {canLeft
                      ? <button onClick={() => swap(flatIdx, flatIdx - 1)} className="flex items-center justify-center text-muted-foreground hover:text-foreground"><ArrowLeft className="w-3 h-3" /></button>
                      : null}
                  </div>

                  <div className={`flex-1 flex ${justifyLabel} overflow-hidden px-0.5`}>
                    <span className={`text-[10px] font-semibold text-foreground leading-tight truncate ${textAlign}`}>
                      {label}
                    </span>
                  </div>

                  <div className="w-4 flex-shrink-0 flex items-center justify-center">
                    {canRight
                      ? <button onClick={() => swap(flatIdx, flatIdx + 1)} className="flex items-center justify-center text-muted-foreground hover:text-foreground"><ArrowRight className="w-3 h-3" /></button>
                      : null}
                  </div>
                </div>

                {/* Down */}
                <div className="h-5 flex items-center justify-center">
                  {canDown
                    ? <button onClick={() => swap(flatIdx, flatIdx + COLS)} className="p-0.5 text-muted-foreground hover:text-foreground"><ArrowDown className="w-3 h-3" /></button>
                    : <div className="w-4 h-4" />}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function NavigationSettings({ settings }) {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [openSection, setOpenSection] = useState(null);

  useEffect(() => {
    if (settings?.navigation_config) {
      setConfig(settings.navigation_config);
    } else {
      setConfig(DEFAULT_CONFIG);
    }
  }, [settings?.navigation_config]);

  const handleToggle = (location, pageId) => {
    setConfig(prev => {
      const list = [...prev[location]];
      const idx = list.indexOf(pageId);
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        const maxLen = location === "topBar" ? 6 : location === "bottomBar" ? 5 : 999;
        if (list.length < maxLen) list.push(pageId);
      }
      return { ...prev, [location]: list };
    });
  };

  const handleMove = (location, index, direction) => {
    setConfig(prev => {
      const list = [...prev[location]];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= list.length) return prev;
      [list[index], list[targetIndex]] = [list[targetIndex], list[index]];
      return { ...prev, [location]: list };
    });
  };

  const handleSwap = (location, idxA, idxB) => {
    setConfig(prev => {
      const list = [...prev[location]];
      if (idxA < 0 || idxB < 0 || idxA >= list.length || idxB >= list.length) return prev;
      [list[idxA], list[idxB]] = [list[idxB], list[idxA]];
      return { ...prev, [location]: list };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, { navigation_config: config });
      } else {
        await base44.entities.SystemSettings.create({ navigation_config: config });
      }
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Navigation className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Navigation</CardTitle>
            <CardDescription>Customize where pages appear and their order</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {["topBar", "bottomBar", "dashboardGrid"].map(location => {
          const maxLen = location === "topBar" ? 6 : location === "bottomBar" ? 5 : 999;
          const count = config[location]?.length || 0;
          const isOpen = openSection === location;
          const sectionLabel = location === "topBar" ? "Top Navigation Bar" : location === "bottomBar" ? "Mobile Bottom Bar" : "Dashboard Grid";
          const isDashboard = location === "dashboardGrid";
          const checkedItems = config[location] || [];
          const availablePages = isDashboard ? ALL_PAGES.filter(p => p.id !== "home") : ALL_PAGES;
          const uncheckedItems = availablePages.filter(p => !checkedItems.includes(p.id));

          return (
            <div key={location} className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setOpenSection(isOpen ? null : location)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-semibold text-sm text-foreground">{sectionLabel}</span>
                  <span className="text-xs text-muted-foreground ml-2">{count}</span>
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>

              {isOpen && (
                <div className="px-4 py-3 border-t border-border bg-muted/5 space-y-3">
                  {location === "dashboardGrid" ? (
                    <>
                      <p className="text-xs text-muted-foreground">Mirrors the 3-column grid on the dashboard. Use arrows to swap positions.</p>
                      <DashboardGridEditor
                        checkedItems={checkedItems}
                        onMove={(idxA, idxB) => handleSwap(location, idxA, idxB)}
                        onToggle={(pageId) => handleToggle(location, pageId)}
                      />
                    </>
                  ) : (
                    <div className="space-y-2">
                      {checkedItems.map((pageId, index) => {
                        const page = ALL_PAGES.find(p => p.id === pageId);
                        if (!page) return null;
                        return (
                          <ActiveItem
                            key={page.id}
                            label={page.label}
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
                  )}

                  {uncheckedItems.length > 0 && (
                    <div className="space-y-2 mt-3 pt-3 border-t border-border/30">
                      {uncheckedItems.filter(p => !(isDashboard && p.id === "home")).map(page => (
                        <div key={page.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20 opacity-60">
                          <div className="w-4 h-4" />
                          <span className="flex-1 text-sm text-muted-foreground">{page.label}</span>
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

        <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 w-full mt-4">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Navigation Settings
        </Button>
      </CardContent>
    </Card>
  );
}