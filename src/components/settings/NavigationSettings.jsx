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
  // Pad to a multiple of 3 with nulls for layout
  const rows = [];
  for (let i = 0; i < checkedItems.length; i += COLS) {
    rows.push(checkedItems.slice(i, i + COLS));
  }

  const totalItems = checkedItems.length;

  const swapItems = (idxA, idxB) => {
    if (idxA < 0 || idxB < 0 || idxA >= totalItems || idxB >= totalItems) return;
    onMove(idxA, idxB);
  };

  return (
    <div className="space-y-1">
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="grid grid-cols-3 gap-1">
          {Array.from({ length: COLS }).map((_, colIdx) => {
            const item = row[colIdx];
            const flatIdx = rowIdx * COLS + colIdx;
            if (!item) return <div key={colIdx} className="rounded-lg border border-dashed border-border/30 h-16 opacity-30" />;

            const page = ALL_PAGES.find(p => p.id === item);
            const canLeft = colIdx > 0;
            const canRight = colIdx < COLS - 1 && flatIdx + 1 < totalItems;
            const canUp = rowIdx > 0;
            const canDown = flatIdx + COLS < totalItems;

            return (
              <div key={item} className="relative rounded-lg border border-border/50 bg-card p-1 flex flex-col items-center gap-1 min-h-[4rem]">
                {/* Top: up arrow */}
                <div className="w-full flex justify-center h-4">
                  {canUp && (
                    <button onClick={() => swapItems(flatIdx, flatIdx - COLS)} className="text-muted-foreground hover:text-foreground transition-colors">
                      <ArrowUp className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Middle row: left | label | right */}
                <div className="flex items-center gap-1 w-full justify-between">
                  <div className="w-4 flex justify-center flex-shrink-0">
                    {canLeft && (
                      <button onClick={() => swapItems(flatIdx, flatIdx - 1)} className="text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowLeft className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <span className="text-xs font-medium text-foreground text-center leading-tight flex-1 truncate px-0.5">
                    {page?.label || item}
                  </span>
                  <div className="w-4 flex justify-center flex-shrink-0">
                    {canRight && (
                      <button onClick={() => swapItems(flatIdx, flatIdx + 1)} className="text-muted-foreground hover:text-foreground transition-colors">
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Bottom: down arrow */}
                <div className="w-full flex justify-center h-4">
                  {canDown && (
                    <button onClick={() => swapItems(flatIdx, flatIdx + COLS)} className="text-muted-foreground hover:text-foreground transition-colors">
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Remove button */}
                <button
                  onClick={() => onToggle(item)}
                  className="absolute top-0.5 right-0.5 text-muted-foreground hover:text-destructive transition-colors"
                  title="Remove"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
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
          const checkedItems = config[location] || [];
          const uncheckedItems = ALL_PAGES.filter(p => !checkedItems.includes(p.id));

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
                      {uncheckedItems.map(page => (
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