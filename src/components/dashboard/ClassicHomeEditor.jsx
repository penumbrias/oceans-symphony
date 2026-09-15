// In-place edit mode for the CLASSIC home screen. The classic cards are
// treated the way board widgets are: every card is a slot the user can
// drag to reorder, remove, add back, or configure through the SAME
// WidgetConfigSheet the board uses — with the card's current appearance
// offered as the "Classic" display mode alongside the board modes. The
// old settings-popup pill list stays in Settings → Appearance, but this
// is the front door.
//
// Dashboard owns the state and persistence (dashboard_layout on the
// SystemSettings singleton); this file is only the edit-mode chrome.

import React from "react";
import { createPortal } from "react-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, SlidersHorizontal, X, Plus, RotateCcw, Check } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { WIDGET_CATEGORIES } from "@/lib/widgetRegistry";

// Quick-action sub-toggles that live INSIDE the Quick Check-In card's row —
// they never render as standalone cards, so the editor skips them.
export const CLASSIC_SUB_TOGGLE_IDS = [
  "start_activity_button",
  "start_symptom_button",
  "quick_task_button",
  "quick_plan_button",
];

// One editable card. The whole tile drags (the card's own controls are
// inert while editing, same as board widgets); the chip row on top names
// the card and carries options/remove.
export function ClassicEditShell({ id, label, locked, configurable, onConfigure, onRemove, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 60 : undefined,
  };
  const stop = (e) => e.stopPropagation();
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`relative mb-4 mt-3 rounded-2xl touch-none cursor-grab active:cursor-grabbing break-inside-avoid ${
        isDragging ? "ring-2 ring-primary shadow-xl" : "ring-1 ring-primary/35"
      }`}
    >
      {/* min-height keeps cards that currently render nothing (no pins,
          no plans) grabbable instead of collapsing to a bare chip. */}
      <div className="pointer-events-none select-none rounded-2xl overflow-hidden min-h-[38px] max-h-[40vh] [&>*]:!mb-0">
        {children}
      </div>
      <div className="absolute -top-3 left-2 right-2 flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1 max-w-[62%] rounded-full border border-border bg-background/95 shadow-sm px-2 py-0.5 text-[0.6875rem] font-medium">
          <GripVertical className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <span className="flex items-center gap-1">
          {configurable && (
            <button
              type="button"
              aria-label={`${label} options`}
              onPointerDown={stop}
              onTouchStart={stop}
              onClick={(e) => { e.stopPropagation(); onConfigure(); }}
              className="w-7 h-7 rounded-full border border-border bg-background/95 shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
          {!locked && (
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onPointerDown={stop}
              onTouchStart={stop}
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="w-7 h-7 rounded-full border border-border bg-background/95 shadow-sm flex items-center justify-center text-muted-foreground hover:text-destructive"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

// The edit-mode bottom bar — Add / Reset / Done, floating above the app's
// bottom chrome the way the board's edit toolbar does.
export function ClassicEditBar({ onAdd, onReset, onDone }) {
  return createPortal(
    <div
      className="fixed z-[90] left-3 right-3 sm:left-auto sm:right-4 flex justify-center sm:justify-end"
      style={{
        bottom:
          "calc(max(var(--v2-bottom-chrome-h, 0px), var(--bottom-nav-height, 56px)) + var(--v2-qa-float-bottom-h, 0px) + 14px + var(--os-sab))",
      }}
      role="toolbar"
      aria-label="Home screen edit mode"
    >
      <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-background/95 backdrop-blur shadow-lg px-2 py-1.5">
        <Button size="sm" variant="ghost" onClick={onAdd} className="text-xs gap-1">
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset} className="text-xs gap-1">
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </Button>
        <Button size="sm" onClick={onDone} className="text-xs gap-1">
          <Check className="w-3.5 h-3.5" /> Done
        </Button>
      </div>
    </div>,
    document.body
  );
}

// Add sheet: the home screen's own hidden cards first, then the full board
// widget catalogue grouped the way the board's drawer groups it.
export function ClassicAddSheet({ open, onClose, hiddenCards, widgets, terms, onAddCard, onAddWidget }) {
  const byCategory = {};
  for (const w of widgets) {
    (byCategory[w.category] ||= []).push(w);
  }
  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-1">
          <DrawerTitle className="text-base">Add to the home screen</DrawerTitle>
        </DrawerHeader>
        <div
          className="px-3 pb-6 overflow-y-auto overscroll-contain space-y-4"
          style={{ paddingBottom: "calc(var(--os-sab) + 24px)" }}
        >
          {hiddenCards.length > 0 && (
            <section>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Home screen cards you've removed
              </p>
              <div className="space-y-1.5">
                {hiddenCards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onAddCard(c.id)}
                    className="w-full flex items-start gap-2 rounded-xl border border-border/50 bg-card px-3 py-2 text-left hover:border-primary/40"
                  >
                    <Plus className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium truncate">{applyTerms(c.label, terms)}</span>
                      {c.description && (
                        <span className="block text-[0.6875rem] text-muted-foreground leading-snug">
                          {applyTerms(c.description, terms)}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {WIDGET_CATEGORIES.filter((cat) => byCategory[cat.id]?.length).map((cat) => (
            <section key={cat.id}>
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                {applyTerms(cat.label, terms)}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {byCategory[cat.id].map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onAddWidget(w.id)}
                    className="flex items-center gap-2 rounded-xl border border-border/50 bg-card px-2.5 py-2 text-left hover:border-primary/40"
                  >
                    {w.Icon && <w.Icon className="w-4 h-4 text-primary flex-shrink-0" />}
                    <span className="text-xs font-medium truncate">{applyTerms(w.label, terms)}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// Restore-to-default, with the option to keep the current arrangement as a
// widget board page first — resetting must never silently discard a layout
// someone spent time on.
export function ClassicResetDialog({ open, onClose, onKeepAsPage, onJustReset }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Restore the default home screen?</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Your current arrangement can be kept as a page on the widget board
          before the home screen resets — or reset without keeping it. Nothing
          you've recorded changes either way.
        </p>
        <div className="flex flex-col gap-2 pt-1">
          <Button size="sm" onClick={onKeepAsPage} className="text-xs">
            Keep it as a board page, then reset
          </Button>
          <Button size="sm" variant="outline" onClick={onJustReset} className="text-xs">
            Just reset
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} className="text-xs">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
