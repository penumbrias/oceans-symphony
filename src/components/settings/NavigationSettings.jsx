import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Navigation, Save, Loader2, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { ALL_PAGES, DEFAULT_CONFIG } from "@/utils/navigationConfig";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
      const updated = { ...prev };
      const list = [...updated[location]];
      const idx = list.indexOf(pageId);
      if (idx >= 0) {
        list.splice(idx, 1);
      } else {
        const maxLen = location === "topBar" ? 6 : location === "bottomBar" ? 5 : 999;
        if (list.length < maxLen) {
          list.push(pageId);
        }
      }
      updated[location] = list;
      return updated;
    });
  };

  const handleDragEnd = (event, location) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setConfig(prev => {
        const list = [...prev[location]];
        const oldIndex = list.indexOf(active.id);
        const newIndex = list.indexOf(over.id);
        return { ...prev, [location]: arrayMove(list, oldIndex, newIndex) };
      });
    }
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
              {/* Header - Clickable to toggle */}
              <button
                onClick={() => setOpenSection(isOpen ? null : location)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-semibold text-sm text-foreground">{sectionLabel}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {count}/{maxLen}
                  </span>
                </div>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </button>

              {/* Content - Shown when open */}
              {isOpen && (
                <div className="px-4 py-3 border-t border-border bg-muted/5 space-y-3">
                  <DndContext collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, location)}>
                    <SortableContext items={checkedItems} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {/* Active items (sortable) */}
                        {checkedItems.map(pageId => {
                          const page = ALL_PAGES.find(p => p.id === pageId);
                          return page ? <SortableItem key={page.id} id={page.id} label={page.label} checked onToggle={() => handleToggle(location, page.id)} /> : null;
                        })}
                      </div>
                    </SortableContext>

                    {/* Inactive items (not sortable) */}
                    {uncheckedItems.length > 0 && (
                      <div className="space-y-2 mt-3 pt-3 border-t border-border/30">
                        {uncheckedItems.map(page => (
                          <div key={page.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20 opacity-60">
                            <div className="w-4 h-4 text-muted-foreground/30"><GripVertical className="w-4 h-4" /></div>
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
                  </DndContext>
                </div>
              )}
            </div>
          );
        })}

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 w-full mt-4"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Navigation Settings
        </Button>
      </CardContent>
    </Card>
  );
}

function SortableItem({ id, label, checked, onToggle }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 p-2 rounded-lg bg-card border border-border/50 transition-all">
      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab active:cursor-grabbing" {...attributes} {...listeners} />
      <span className="flex-1 text-sm text-foreground">{label}</span>
      <Checkbox checked={checked} onCheckedChange={onToggle} />
    </div>
  );
}