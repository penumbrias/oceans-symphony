// Undo/redo for the edit menus (owner spec): two header buttons next to
// the dock-flip. TAP steps one state; HOLD either opens a Photoshop-style
// history window — every state the edit surfaces have passed through this
// session, tap any row to jump straight to it.
//
// ONE module-level history shared by every mount (Display options, the
// home drawer, the widget config sheet): a linear list of snapshots plus
// a cursor. Each snapshot carries the SystemSettings slices the menus
// edit AND the theme state (colours live in ThemeContext/localStorage,
// not SystemSettings). Editing while the cursor sits in the past
// truncates the future — Photoshop's default linear-history rule.
// Session-scoped on purpose: this is "try it, then walk it back", not a
// durable log (lookHistory keeps the durable preset snapshots).

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Undo2, Redo2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTheme } from "@/lib/ThemeContext";

const SETTINGS_FIELDS = ["ui_v2", "ui_v2_home", "ui_v2_home_desktop", "ui_v2_styles"];
const MAX = 40;
const HOLD_MS = 450;

const hist = { entries: [], cursor: -1, restoringUntil: 0, listeners: new Set() };
const emit = () => hist.listeners.forEach((fn) => fn());

// Which area changed — the row label in the history window.
const UI_V2_AREAS = {
  tokens: "Sizes & accent", bars: "Bars", barLooks: "Bar looks",
  icons: "Icons", commandKeys: "Quick keys",
};
const HOME_AREAS = {
  altersBar: "Pinned bar", background: "Background", wallpaper: "Wallpaper",
  pages: "Widgets & layout", grid: "Grid", styleMode: "Board style",
};
function subDiff(prev = {}, next = {}, names, fallback) {
  const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
  const out = [];
  for (const k of keys) {
    if (JSON.stringify(prev?.[k]) !== JSON.stringify(next?.[k])) out.push(names[k] || null);
  }
  const named = out.filter(Boolean);
  if (!out.length) return [];
  return named.length ? [...new Set(named)] : [fallback];
}
function diffLabel(prev, next) {
  const parts = [];
  if (JSON.stringify(prev.settings.ui_v2) !== JSON.stringify(next.settings.ui_v2)) {
    parts.push(...subDiff(prev.settings.ui_v2, next.settings.ui_v2, UI_V2_AREAS, "UI theme"));
  }
  for (const [field, label] of [["ui_v2_home", "Home board"], ["ui_v2_home_desktop", "Desktop board"]]) {
    if (JSON.stringify(prev.settings[field]) !== JSON.stringify(next.settings[field])) {
      parts.push(...subDiff(prev.settings[field], next.settings[field], HOME_AREAS, label));
    }
  }
  if (JSON.stringify(prev.settings.ui_v2_styles) !== JSON.stringify(next.settings.ui_v2_styles)) parts.push("Widget styles");
  if (JSON.stringify(prev.theme) !== JSON.stringify(next.theme)) parts.push("Colours & theme");
  return [...new Set(parts)].slice(0, 3).join(" · ") || "Change";
}

const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function UndoRedoButtons() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const settingsRow = rows[0] || null;
  const {
    selectedTheme, themeMode, customColors,
    setSelectedTheme, setThemeMode, updateCustomColorsFull, clearCustomColors,
  } = useTheme();

  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    hist.listeners.add(fn);
    return () => hist.listeners.delete(fn);
  }, []);

  const snapNow = () => ({
    settings: Object.fromEntries(SETTINGS_FIELDS.map((f) => [f, settingsRow?.[f] ?? null])),
    theme: { selectedTheme, themeMode, customColors },
  });
  const snapJson = settingsRow ? JSON.stringify(snapNow()) : null;

  // Record every observed state. Two mounted instances dedupe against
  // the cursor entry, so only one of them actually pushes. The
  // restoringUntil window keeps the mixed intermediate states a restore
  // passes through (settings landed, theme still refetching) out of the
  // list.
  useEffect(() => {
    if (!snapJson) return;
    const cur = hist.entries[hist.cursor];
    if (cur && cur.json === snapJson) return;
    if (Date.now() < hist.restoringUntil) return;
    const snap = JSON.parse(snapJson);
    const label = cur ? diffLabel(cur.snap, snap) : "Opened";
    const kept = hist.entries.slice(0, hist.cursor + 1);
    hist.entries = [...kept, { ts: Date.now(), label, snap, json: snapJson }].slice(-MAX);
    hist.cursor = hist.entries.length - 1;
    emit();
  }, [snapJson]);

  const restore = async (idx) => {
    const e = hist.entries[idx];
    if (!e || !settingsRow?.id) return;
    hist.cursor = idx;
    hist.restoringUntil = Date.now() + 1500;
    emit();
    try {
      await base44.entities.SystemSettings.update(settingsRow.id, { ...e.snap.settings });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
      const t = e.snap.theme || {};
      if (t.customColors) updateCustomColorsFull(t.customColors.light, t.customColors.dark);
      else if (customColors) clearCustomColors();
      if (t.selectedTheme && t.selectedTheme !== selectedTheme) setSelectedTheme(t.selectedTheme);
      if (t.themeMode && t.themeMode !== themeMode) setThemeMode(t.themeMode);
    } catch { /* next interaction retries */ }
  };

  const canUndo = hist.cursor > 0;
  const canRedo = hist.cursor >= 0 && hist.cursor < hist.entries.length - 1;

  // Hold-to-open: pointerdown starts the timer; firing swallows the
  // trailing click so a hold never also steps the history.
  const [histOpen, setHistOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const holdTimer = useRef(null);
  const holdFired = useRef(false);
  const wrapRef = useRef(null);
  const openHistory = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) {
      const W = 240;
      setPos({
        top: r.bottom + 6 + 260 > window.innerHeight ? Math.max(8, r.top - 266) : r.bottom + 6,
        left: Math.max(8, Math.min(r.right - W, window.innerWidth - W - 8)),
      });
    }
    setHistOpen(true);
  };
  const startHold = () => {
    holdFired.current = false;
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => { holdFired.current = true; openHistory(); }, HOLD_MS);
  };
  const endHold = () => clearTimeout(holdTimer.current);
  const tap = (fn) => () => {
    if (holdFired.current) { holdFired.current = false; return; }
    fn();
  };

  useEffect(() => {
    if (!histOpen) return undefined;
    const close = (e) => {
      if (e.target.closest?.("[data-uiedit-history]")) return;
      if (wrapRef.current?.contains(e.target)) return;
      setHistOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [histOpen]);

  const btnCls = "flex items-center justify-center w-8 h-8 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground disabled:opacity-30";
  const entries = hist.entries;

  return (
    <span ref={wrapRef} className="flex items-center gap-1.5">
      <button type="button" disabled={!canUndo}
        aria-label="Undo" title="Undo — hold for history"
        onClick={tap(() => canUndo && restore(hist.cursor - 1))}
        onPointerDown={startHold} onPointerUp={endHold} onPointerCancel={endHold} onPointerLeave={endHold}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: "none" }}
        className={btnCls}>
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button type="button" disabled={!canRedo}
        aria-label="Redo" title="Redo — hold for history"
        onClick={tap(() => canRedo && restore(hist.cursor + 1))}
        onPointerDown={startHold} onPointerUp={endHold} onPointerCancel={endHold} onPointerLeave={endHold}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: "none" }}
        className={btnCls}>
        <Redo2 className="w-3.5 h-3.5" />
      </button>
      {histOpen && createPortal(
        <div data-uiedit-history
          className="fixed z-[95] w-60 rounded-xl border border-border/60 bg-card shadow-xl p-1"
          style={{ top: pos.top, left: pos.left }}>
          <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1">Edit history</p>
          <div className="max-h-56 overflow-y-auto overscroll-contain space-y-0.5">
            {entries.map((e, i) => {
              const future = i > hist.cursor;
              const active = i === hist.cursor;
              return (
                <button key={`${e.ts}_${i}`} type="button" onClick={() => restore(i)}
                  className={`w-full text-left px-2 py-1.5 rounded-lg flex items-baseline gap-2 ${
                    active ? "bg-[color-mix(in_srgb,var(--v2-accent,var(--color-primary))_14%,transparent)] text-foreground"
                    : future ? "text-muted-foreground/50 hover:text-muted-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
                  <span className="text-xs flex-1 min-w-0 truncate">{e.label}</span>
                  <span className="text-[0.625rem] tabular-nums flex-shrink-0">{fmtTime(e.ts)}</span>
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </span>
  );
}
