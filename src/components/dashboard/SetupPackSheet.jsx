// Share / import home-screen setup packs — the "texture pack" flow.
// Export: pick which of the three types to include, title it, REVIEW the
// exact JSON, then download/copy. Import: paste or pick a file, review the
// summary + raw JSON, choose which included types to apply, and optionally
// save the pack to your app as a preset. No personal data ever rides along
// (see lib/setupPacks.js).

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Download, ClipboardPaste, Upload, Copy } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { sheetPortalGuards } from "@/lib/sheetPortalGuards";
import {
  buildPack, buildLayoutType, buildWidgetStylesType, buildUiThemeType,
  parsePack, summarizePack, packLooksSafe, buildApplyPatch, layoutHasLook, applyAppTheme,
} from "@/lib/setupPacks";
import { WIDGET_REGISTRY, widgetLabel } from "@/lib/widgetRegistry";
import { V2_WIDGETS } from "@/v2/widgets";

// The v2 board renders V2_WIDGETS; classic-derived boards use
// WIDGET_REGISTRY — name lookups must cover both or v2-native widgets
// print as raw ids ("presence"). LAZY: spreading at module scope hit a
// TDZ crash once the import graph grew a cycle (V2_WIDGETS not yet
// initialised when this module evaluated).
let _allDefs = null;
const allWidgetDefs = () => (_allDefs ||= { ...WIDGET_REGISTRY, ...V2_WIDGETS });
import { useTerms } from "@/lib/useTerms";
import { useTheme } from "@/lib/ThemeContext";
import { shareFile } from "@/lib/shareFile";
import { isNative } from "@/lib/platform";

const box = "rounded-xl border border-border/50 p-2.5 space-y-2";

function TypeCheck({ label, desc, checked, onChange, disabled = false }) {
  return (
    <label className={`flex items-start gap-2 text-xs cursor-pointer ${disabled ? "opacity-40" : ""}`}>
      <input type="checkbox" className="mt-0.5 w-4 h-4 rounded accent-primary" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="font-medium block">{label}</span>
        <span className="text-muted-foreground">{desc}</span>
      </span>
    </label>
  );
}

// ── Friendly review — the pack's contents the way the app names them,
// not the code behind them. The raw JSON stays available below it.
const KEY_LABELS = {
  font: "Font", fontScale: "Text size", radius: "Corner radius",
  borderW: "Border width", borderColor: "Border colour", borderStyle: "Border style",
  accent: "Accent colour", bg: "Background", bgOpacity: "Background opacity",
  bgImage: "Background image", bgSize: "Background image fit",
  textColor: "Text colour", padding: "Padding", shadow: "Shadow", css: "Custom CSS",
  padTop: "Top padding", padRight: "Right padding", padBottom: "Bottom padding", padLeft: "Left padding",
  gradFrom: "Gradient from", gradTo: "Gradient to", gradAngle: "Gradient angle", blur: "Blur",
  accentOpacity: "Accent opacity", textOpacity: "Text opacity", borderOpacity: "Border opacity",
  gradFromOpacity: "Gradient-from opacity", gradToOpacity: "Gradient-to opacity",
  alignX: "Horizontal alignment", actionsMode: "Quick actions mode", actionsEdge: "Quick actions edge",
  actionsAttach: "Quick actions attach", handleSides: "Handle halves",
};
const TOP_LABELS = {
  tokens: "Size & layout", bars: "Bars shown", barLooks: "Per-bar looks",
  icons: "Icon choices", commandKeys: "Quick-action keys", background: "Background",
};
const keyLabel = (k) => KEY_LABELS[k] || String(k).replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const isColor = (v) => typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v.trim());

function Val({ v }) {
  if (typeof v === "boolean") return <span className="text-foreground">{v ? "On" : "Off"}</span>;
  if (isColor(v)) return (
    <span className="inline-flex items-center gap-1 text-foreground">
      <span className="w-3 h-3 rounded-sm border border-border/60 inline-block flex-shrink-0" style={{ background: v }} aria-hidden="true" />
      {v}
    </span>
  );
  return <span className="text-foreground break-all">{String(v)}</span>;
}

// One key/value line — or, for a nested object, an indented block of them.
function KVRows({ obj, depth = 0 }) {
  const entries = Object.entries(obj || {}).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!entries.length) return <p className="text-[0.6875rem] text-muted-foreground">Nothing set — app defaults.</p>;
  return (
    <div className="space-y-0.5">
      {entries.map(([k, v]) => {
        const label = depth === 0 ? (TOP_LABELS[k] || keyLabel(k)) : keyLabel(k);
        if (Array.isArray(v)) return (
          <p key={k} className="text-[0.6875rem]"><span className="text-muted-foreground">{label}:</span>{" "}
            <span className="text-foreground break-all">{v.map((x) => (typeof x === "object" ? "(complex)" : String(x))).join(", ") || "none"}</span></p>
        );
        if (v && typeof v === "object") {
          if (depth >= 2) return null;
          return (
            <div key={k} className="pt-0.5">
              <p className="text-[0.6875rem] font-medium">{label}</p>
              <div className="pl-2.5 border-l border-border/40 ml-0.5"><KVRows obj={v} depth={depth + 1} /></div>
            </div>
          );
        }
        return (
          <p key={k} className="text-[0.6875rem] flex items-baseline gap-1">
            <span className="text-muted-foreground flex-shrink-0">{label}:</span> <Val v={v} />
          </p>
        );
      })}
    </div>
  );
}

function FriendlyReview({ pack }) {
  const terms = useTerms();
  const [open, setOpen] = useState(false);
  const t = pack?.types || {};
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full flex items-center justify-between text-xs font-medium py-1">
        <span>Review what's included</span>
        <ChevronDown className="w-3.5 h-3.5" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-border/40 bg-muted/20 p-2 space-y-2.5">
          {t.layout && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold">Widget layout</p>
              {(t.layout.pages || []).map((pg, pi) => (
                <div key={pi} className="space-y-1">
                  <p className="text-[0.6875rem] text-muted-foreground">Page {pi + 1} · {pg.layoutMode === "free" ? "free placement" : "flowing"} · {(pg.widgets || []).length} widget(s)</p>
                  {(pg.widgets || []).map((w, wi) => {
                    const def = allWidgetDefs()[w.widgetId];
                    const st = Object.fromEntries(Object.entries(w.settings || {}).filter(([, v]) => v !== "" && v != null));
                    return (
                      <div key={wi} className="rounded-md border border-border/40 px-2 py-1.5">
                        <p className="text-[0.6875rem] font-medium">
                          {def ? widgetLabel(def, terms) : w.widgetId}
                          <span className="text-muted-foreground font-normal">
                            {w.span ? ` · ${w.span.cols}×${w.span.rows}` : ""}{w.mode && w.mode !== "normal" ? ` · ${w.mode}` : ""}
                          </span>
                        </p>
                        {Object.keys(st).length > 0 && <div className="pt-0.5"><KVRows obj={st} depth={1} /></div>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          {t.widgetStyles && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold">Widget styles</p>
              {t.widgetStyles.map((sty, si) => (
                <div key={si} className="rounded-md border border-border/40 px-2 py-1.5">
                  <p className="text-[0.6875rem] font-medium">{sty.label}</p>
                  <div className="pt-0.5"><KVRows obj={sty.look} depth={1} /></div>
                </div>
              ))}
            </div>
          )}
          {t.uiTheme && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold">UI theme</p>
              <KVRows obj={t.uiTheme} />
            </div>
          )}
          {!t.layout && !t.widgetStyles && !t.uiTheme && (
            <p className="text-[0.6875rem] text-muted-foreground">Nothing selected yet.</p>
          )}
          <p className="text-[0.625rem] text-muted-foreground border-t border-border/40 pt-1.5">
            This is everything in the pack — there is nothing beyond what's listed here and in the raw code below.
          </p>
        </div>
      )}
    </div>
  );
}

function RawReview({ json }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full flex items-center justify-between text-xs font-medium py-1">
        <span>View the raw code</span>
        <ChevronDown className="w-3.5 h-3.5" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .18s" }} />
      </button>
      {open && (
        <pre className="text-[0.625rem] font-mono whitespace-pre-wrap break-all max-h-56 overflow-y-auto overscroll-contain rounded-lg border border-border/40 bg-muted/20 p-2">
          {json}
        </pre>
      )}
    </div>
  );
}

export default function SetupPackSheet({ open, onClose, home, currentPageId = null, uiV2Raw, userStyles, settingsRow, initialTab = null }) {
  const qc = useQueryClient();
  const sheetTerms = useTerms();
  // The base colour scheme rides the UI-theme type (it lives in
  // ThemeContext, not ui_v2 — without it a themed board arrived washed
  // out on the default palette).
  const { selectedTheme, themeMode, customColors, selectedFont } = useTheme();
  const fileRef = useRef(null);
  const [tab, setTab] = useState("export"); // export | import
  const [title, setTitle] = useState("");
  const [inc, setInc] = useState({ layout: true, widgetStyles: false, uiTheme: false });
  const [imported, setImported] = useState(null); // parsed pack
  const [apply, setApply] = useState({ layout: true, widgetStyles: true, uiTheme: true });
  const [saveAsPreset, setSaveAsPreset] = useState(true);
  const [placement, setPlacement] = useState("new"); // new | merge | replace
  // Take the pack's widget appearance along with its arrangement, or keep
  // your own styling — the pack's look is a choice, not a rider.
  const [applyLook, setApplyLook] = useState(true);
  // The Presets section (and the edit bar's Save menu) open straight to a
  // specific tab.
  React.useEffect(() => { if (open && initialTab) setTab(initialTab); }, [open, initialTab]);

  // Granular export selection (owner spec): which PAGES ride along
  // (default: just the page you're on), which WIDGETS on each selected
  // page, and which saved STYLES. Re-seeded each open so the default
  // always reflects where the user is standing.
  const pages = home?.pages || [];
  const [pageSel, setPageSel] = useState(() => new Set());
  const [widgetDrop, setWidgetDrop] = useState({}); // pageId -> Set of EXCLUDED instanceIds
  const [pageOpen, setPageOpen] = useState(null);   // pageId with the widget list expanded
  const [styleSel, setStyleSel] = useState(() => new Set());
  // Widget appearance rides a layout export ONLY on request (owner report:
  // colours were coming along uninvited).
  const [incLook, setIncLook] = useState(false);
  useEffect(() => {
    if (!open) return;
    const startPage = pages.find((p) => p.id === currentPageId) || pages[0];
    setPageSel(new Set(startPage ? [startPage.id] : []));
    setWidgetDrop({});
    setPageOpen(null);
    setStyleSel(new Set((userStyles || []).map((st) => st.id)));
    setIncLook(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const togglePage = (id) => setPageSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleStyle = (id) => setStyleSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleWidget = (pageId, instanceId) => setWidgetDrop((m) => {
    const cur = new Set(m[pageId] || []);
    if (cur.has(instanceId)) cur.delete(instanceId); else cur.add(instanceId);
    return { ...m, [pageId]: cur };
  });
  const selectedHome = useMemo(() => ({
    ...home,
    pages: pages
      .filter((p) => pageSel.has(p.id))
      .map((p) => ({ ...p, widgets: (p.widgets || []).filter((w) => !(widgetDrop[p.id] || new Set()).has(w.instanceId)) })),
  }), [home, pages, pageSel, widgetDrop]);
  const selectedStyles = useMemo(() => (userStyles || []).filter((st) => styleSel.has(st.id)), [userStyles, styleSel]);

  const pack = useMemo(() => {
    if (tab !== "export") return null;
    return buildPack({
      title: title || "My setup",
      layout: inc.layout && pageSel.size ? buildLayoutType(selectedHome, { includeLook: incLook }) : null,
      widgetStyles: inc.widgetStyles && selectedStyles.length ? buildWidgetStylesType(selectedStyles) : null,
      uiTheme: inc.uiTheme ? buildUiThemeType(uiV2Raw, { selectedTheme, themeMode, customColors, selectedFont }) : null,
    });
  }, [tab, title, inc, selectedHome, selectedStyles, pageSel, incLook, uiV2Raw, selectedTheme, themeMode, customColors, selectedFont]);
  const packJson = useMemo(() => (pack ? JSON.stringify(pack, null, 2) : ""), [pack]);

  const download = async () => {
    const blob = new Blob([packJson], { type: "application/json" });
    const filename = `${(title || "symphony-setup").replace(/[^\w-]+/g, "-").toLowerCase()}.symphony-pack.json`;
    const res = await shareFile({ blob, filename, title: "Oceans Symphony setup pack", dialogTitle: "Save setup pack", prefer: "download" });
    if (res?.result === "failed") toast.error("Couldn't save the file — try Copy instead");
    else if (res?.result && res.result !== "cancelled") toast.success(isNative() ? "Saved" : "Downloading…");
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(packJson); toast.success("Copied"); }
    catch { toast.error("Couldn't copy — use Download instead"); }
  };

  const readText = (text) => {
    try {
      const p = parsePack(text);
      if (!packLooksSafe(p)) { toast.error("This pack contains personal-looking data — refusing to import it."); return; }
      setImported(p);
      setApply({ layout: !!p.types.layout, widgetStyles: !!p.types.widgetStyles, uiTheme: !!p.types.uiTheme });
    } catch (e) { toast.error(e.message || "Couldn't read that"); }
  };
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) readText(await f.text());
  };
  const [manualPaste, setManualPaste] = useState(false);
  const [manualText, setManualText] = useState("");
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) throw new Error("empty");
      readText(text);
    } catch {
      // Reading the clipboard is blocked far more often than writing it
      // (Firefox, most WebViews) — hand the user a box to paste into.
      setManualPaste(true);
      toast.info("Couldn't read the clipboard directly — paste into the box below.");
    }
  };

  const applyImport = async () => {
    if (!imported || !settingsRow?.id) return;
    try {
      const patch = buildApplyPatch({
        pack: imported,
        which: { ...apply, layoutPlacement: placement, currentPageId, stripLayoutLook: !applyLook },
        savePreset: saveAsPreset, settingsRow,
      });
      await base44.entities.SystemSettings.update(settingsRow.id, patch);
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
      if (apply.uiTheme) applyAppTheme(imported.types.uiTheme?.appTheme);
      toast.success("Pack applied");
      setImported(null);
      onClose?.();
    } catch (e) { toast.error(e?.message || "Couldn't apply"); }
  };

  return (
    <Drawer open={open} modal={false} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DrawerContent className="max-h-[88vh]" {...sheetPortalGuards}>
        <DrawerHeader className="pb-1">
          <DrawerTitle className="text-base">Setup packs</DrawerTitle>
          <DrawerDescription className="sr-only">Share or import home-screen layouts, widget styles and UI themes.</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-6 overflow-y-auto overscroll-contain space-y-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
          <div className="flex gap-1">
            {[["export", "Share"], ["import", "Import"]].map(([id, label]) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}
                className={`text-xs px-3 py-1.5 rounded-full border ${tab === id ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>
                {label}
              </button>
            ))}
          </div>

          {tab === "export" && (
            <>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60}
                placeholder="Pack name"
                className="w-full h-9 px-3 rounded-lg border border-border/50 bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              <div className={box}>
                <TypeCheck label="Widget layout" desc="Which widgets, where, at what size — a ready-made home page."
                  checked={inc.layout} onChange={(v) => setInc((s) => ({ ...s, layout: v }))} />
                {inc.layout && (
                  <div className="pl-6 space-y-1">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" className="w-3.5 h-3.5 rounded accent-primary"
                        checked={incLook} onChange={(e) => setIncLook(e.target.checked)} />
                      <span className="text-muted-foreground">Include widget appearance (colours, fonts, borders)</span>
                    </label>
                    {pages.map((p, i) => {
                      const on = pageSel.has(p.id);
                      const drop = widgetDrop[p.id] || new Set();
                      const expanded = pageOpen === p.id;
                      const total = (p.widgets || []).length;
                      return (
                        <div key={p.id}>
                          <div className="flex items-center gap-1.5">
                            <label className="flex items-center gap-2 text-xs cursor-pointer flex-1 min-w-0">
                              <input type="checkbox" className="w-3.5 h-3.5 rounded accent-primary" checked={on} onChange={() => togglePage(p.id)} />
                              <span className="truncate">
                                {p.label || `Page ${i + 1}`}
                                {p.id === currentPageId && <span className="text-muted-foreground"> · this page</span>}
                                <span className="text-muted-foreground"> · {total - (on ? drop.size : 0)}/{total} widgets</span>
                              </span>
                            </label>
                            {on && total > 0 && (
                              <button type="button" onClick={() => setPageOpen(expanded ? null : p.id)}
                                aria-expanded={expanded} aria-label={`Choose widgets on ${p.label || `page ${i + 1}`}`}
                                className="p-1 text-muted-foreground hover:text-foreground flex-shrink-0">
                                <ChevronRight className="w-3 h-3" style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                              </button>
                            )}
                          </div>
                          {on && expanded && (
                            <div className="pl-5 pt-0.5 space-y-0.5">
                              {(p.widgets || []).map((w) => (
                                <label key={w.instanceId} className="flex items-center gap-2 text-[0.6875rem] cursor-pointer">
                                  <input type="checkbox" className="w-3 h-3 rounded accent-primary"
                                    checked={!drop.has(w.instanceId)} onChange={() => toggleWidget(p.id, w.instanceId)} />
                                  <span className="truncate text-muted-foreground">
                                    {w.settings?.label || widgetLabel(allWidgetDefs()[w.widgetId], sheetTerms) || w.widgetId}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <TypeCheck label="Widget styles" desc={`Your saved widget looks (${userStyles.length}) — colours, fonts, borders.`}
                  checked={inc.widgetStyles} onChange={(v) => setInc((s) => ({ ...s, widgetStyles: v }))}
                  disabled={!userStyles.length} />
                {inc.widgetStyles && userStyles.length > 0 && (
                  <div className="pl-6 space-y-1">
                    {userStyles.map((st) => (
                      <label key={st.id} className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" className="w-3.5 h-3.5 rounded accent-primary"
                          checked={styleSel.has(st.id)} onChange={() => toggleStyle(st.id)} />
                        <span className="truncate">{st.label}</span>
                      </label>
                    ))}
                  </div>
                )}
                <TypeCheck label="UI theme" desc="Display options — bars, tokens, per-bar looks."
                  checked={inc.uiTheme} onChange={(v) => setInc((s) => ({ ...s, uiTheme: v }))} />
              </div>
              <p className="text-[0.6875rem] text-muted-foreground">
                Personal data never rides along: journals, groups, images and every record reference are stripped automatically. Review below before sharing.
              </p>
              <FriendlyReview pack={pack} />
              <RawReview json={packJson} />
              <div className="flex gap-2">
                <button type="button" onClick={download} disabled={!pack || !Object.keys(pack.types).length}
                  className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-1.5 disabled:opacity-40">
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                <button type="button" onClick={copy} disabled={!pack || !Object.keys(pack.types).length}
                  className="h-9 px-3 rounded-lg border border-border/50 text-sm flex items-center gap-1.5 disabled:opacity-40">
                  <Copy className="w-3.5 h-3.5" /> Copy
                </button>
              </div>
            </>
          )}

          {tab === "import" && !imported && (
            <>
              <div className="flex gap-2">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex-1 h-9 rounded-lg border border-border/50 text-sm flex items-center justify-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Pick a file
                </button>
                <button type="button" onClick={paste}
                  className="flex-1 h-9 rounded-lg border border-border/50 text-sm flex items-center justify-center gap-1.5">
                  <ClipboardPaste className="w-3.5 h-3.5" /> Paste
                </button>
                <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onFile} />
              </div>
              {!manualPaste && (
                <button type="button" onClick={() => setManualPaste(true)}
                  className="text-[0.6875rem] text-muted-foreground underline underline-offset-2">
                  Paste manually instead
                </button>
              )}
              {manualPaste && (
                <div className="space-y-1.5">
                  <textarea value={manualText} onChange={(e) => setManualText(e.target.value)}
                    placeholder='Long-press → Paste the pack text here ({"__format":"symphony_setup_pack"…)'
                    rows={4}
                    className="w-full px-2.5 py-2 rounded-lg border border-border/50 bg-transparent text-[0.6875rem] font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
                  <button type="button" disabled={!manualText.trim()}
                    onClick={() => { readText(manualText.trim()); }}
                    className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40">
                    Read it
                  </button>
                </div>
              )}
            </>
          )}

          {tab === "import" && imported && (
            <>
              <p className="text-sm font-medium">{imported.title || "Untitled pack"}</p>
              <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                {summarizePack(imported).map((line, i) => <li key={i}>{line}</li>)}
              </ul>
              <div className={box}>
                {imported.types.layout && (
                  <>
                    <TypeCheck label="Widget layout" desc="Where should it land? Pick below."
                      checked={apply.layout} onChange={(v) => setApply((s) => ({ ...s, layout: v }))} />
                    {apply.layout && (
                      <div className="pl-6 space-y-1.5">
                        <div className="flex flex-wrap gap-1">
                          {[["new", "As a new page"], ["merge", "Add to my current page"], ["replace", "Replace my current page"]].map(([id, label]) => (
                            <button key={id} type="button" aria-pressed={placement === id} onClick={() => setPlacement(id)}
                              className={`text-[0.6875rem] px-2.5 py-1 rounded-full border ${placement === id
                                ? "border-primary/60 bg-primary/10 text-primary"
                                : "border-border/50 text-muted-foreground"}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                        {layoutHasLook(imported.types.layout) && (
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <input type="checkbox" className="w-3.5 h-3.5 rounded accent-primary"
                              checked={applyLook} onChange={(e) => setApplyLook(e.target.checked)} />
                            <span className="text-muted-foreground">Apply the pack's widget appearance (colours, fonts, borders) — untick to keep your own styling</span>
                          </label>
                        )}
                      </div>
                    )}
                  </>
                )}
                {imported.types.widgetStyles && (
                  <TypeCheck label="Widget styles" desc="Added to your saved styles (name clashes skipped)."
                    checked={apply.widgetStyles} onChange={(v) => setApply((s) => ({ ...s, widgetStyles: v }))} />
                )}
                {imported.types.uiTheme && (
                  <TypeCheck label="UI theme" desc="REPLACES your Display-options state (undo via Display options history)."
                    checked={apply.uiTheme} onChange={(v) => setApply((s) => ({ ...s, uiTheme: v }))} />
                )}
                <TypeCheck label="Save to my app as a preset" desc="Keeps the whole pack under Setup packs for later."
                  checked={saveAsPreset} onChange={setSaveAsPreset} />
              </div>
              <FriendlyReview pack={imported} />
              <RawReview json={JSON.stringify(imported, null, 2)} />
              <div className="flex gap-2">
                <button type="button" onClick={applyImport}
                  className="flex-1 h-9 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
                  Apply
                </button>
                <button type="button" onClick={() => setImported(null)}
                  className="h-9 px-3 rounded-lg border border-border/50 text-sm">
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
