// Display options in the house's Settings room, drawn as board 07's
// "Appearance: the look": the file tabs Look · Text · Shape · Bars · Colour ·
// Styles, the Look tab's rows (Look, Colours, fonts, Border / Bevel depth /
// Corner rounding, Icons, Header wave, Penumblob) and the footer Reset the
// look · Import a look · Share this look. The Preview column beside it is
// HouseSettings' LookPreview.
//
// Every control writes through a path that already exists (lookModel.js
// lists which): the settings writer (ui_look, ui_pixel, wave_color_custom),
// ThemeContext's custom colours, the accessibility font setters, the setup
// pack sheet for import and share. Text, Shape, Bars, Colour and Styles show
// the existing Display options tabs (UiEditSheet) in the house's row style;
// "Open the full options" opens the old sheet with everything, including
// the per-page and profile-default looks.

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/house/kit/Button";
import { PageTabs } from "@/house/kit/Panel";
import { Segmented, SliderRow } from "@/house/kit/Choices";
import { NestedPicker } from "@/house/kit/Pickers";
import { HousePopups } from "@/house/kit/KitLayer";
import { Sheet } from "@/house/kit/Sheet";
import { LoadingBlock } from "@/house/kit/States";
import { showToast } from "@/house/kit/Toast";
import { useHouse } from "@/house/tokens/HouseRoot";
import ColorPicker from "@/components/shared/ColorPicker";
import { useTheme } from "@/lib/ThemeContext";
import { useTerms } from "@/lib/useTerms";
import { useT } from "@/lib/i18n";
import { writeSettings } from "@/lib/settingsWriter";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { readPixelLook } from "@/lib/pixelLook";
import { houseLookFromRow } from "@/house/tokens/roles";
import { themeColours, readDevicePaint } from "@/house/paint/translate";
import { useFontOptions } from "@/lib/useFontOptions";
import {
  getAccessibilitySettings, setAccessibilityFontFamily, setAccessibilityHeadingFont,
  A11Y_CHANGED_EVENT, APP_FONT_OPTIONS,
} from "@/lib/useAccessibility";
import { useBoardField } from "@/lib/boardWriter";
import { resolveUserStyles } from "@/lib/widgetLook";
import {
  LOOK_SWATCHES, LOOK_SLIDERS, swatchTarget, swatchShown, swatchIsOwn, themeDraft, nextHouseSwatches,
  waveChoice, lookResetPatch, houseBodyOptions, houseHeadingOptions, isUnchosenBody,
  HOUSE_BODY_DEFAULT_ID, HOUSE_HEADING_DEFAULT_ID,
} from "@/house/settings/lookModel";

const UiEditSheet = React.lazy(() => import("@/components/v2/UiEditSheet"));
const SetupPackSheet = React.lazy(() => import("@/components/dashboard/SetupPackSheet"));

function useSettingsRow() {
  const { data: list = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  return pickPrimarySystemSettings(list) || null;
}

// A settings write that waits for the picker to settle (a drag across the
// colour square would otherwise queue one write per step).
function useSettled(ms = 250) {
  const timer = useRef(null);
  const last = useRef(null);
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); last.current?.(); } }, []);
  return (fn) => {
    last.current = fn;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; const f = last.current; last.current = null; f?.(); }, ms);
  };
}

export default function DisplayLookPage({ onOpenSheet, phone = false }) {
  const tr = useT();
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem("os_bars_focus") ? "bars" : "look"; } catch { return "look"; }
  });
  const tabs = [
    { id: "look", label: "Look" },
    { id: "text", label: tr("editSheet.tabText") },
    { id: "shape", label: tr("editSheet.tabShape") },
    { id: "bars", label: tr("editSheet.bars") },
    { id: "colour", label: tr("editSheet.tabColour") },
    { id: "styles", label: tr("editSheet.tabStyles") },
  ];
  return (
    <div className="hst-insp hlk" data-tour="settings-display-inspector" data-phone={phone || undefined}>
      <div className="hst-insp-tabs">
        <PageTabs label="Display options" idPrefix="inspector" value={tab} onChange={setTab} tabs={tabs} />
      </div>
      {tab === "look" ? (
        <LookTab onTab={setTab} />
      ) : (
        <Suspense fallback={<LoadingBlock label="Loading Display options" />}>
          <UiEditSheet tab={tab} scopeless renderTabs={() => null} />
        </Suspense>
      )}
      <div className="hst-insp-foot">
        <Button rank="quiet" onClick={onOpenSheet}>Open the full options</Button>
      </div>
    </div>
  );
}

// ── The Look tab (board 07) ────────────────────────────────────────────
function LookTab({ onTab }) {
  const terms = useTerms();
  const qc = useQueryClient();
  const house = useHouse();
  const paint = house?.paint;
  const roles = house?.roles || {};
  const row = useSettingsRow();
  const px = readPixelLook(row);
  const look = houseLookFromRow(row);
  const { customColors, updateCustomColorsFull, stashAndClearCustomColors } = useTheme();
  const settle = useSettled();
  const [picking, setPicking] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [pack, setPack] = useState(null); // "import" | "export" | null

  const write = (patch) => writeSettings(patch, { queryClient: qc });
  const writePixel = (patch) => {
    const sub = {};
    for (const [k, v] of Object.entries(patch)) sub[k] = (v === "" || v == null) ? undefined : v;
    return write({ ui_pixel: sub });
  };

  // ── Colours ──
  const variant = paint?.tokens?.variant === "light" ? "light" : "dark";
  const setSwatch = (key, hex) => {
    const target = swatchTarget(key, px);
    if (!target) return;
    if (target.kind === "theme") {
      let device = {};
      try { device = readDevicePaint((k) => localStorage.getItem(k)); } catch { /* storage blocked */ }
      const base = themeColours(device, "pixel");
      const draft = themeDraft(customColors, base, variant, target.key, hex);
      updateCustomColorsFull(draft.light, draft.dark);
    } else if (target.kind === "pixel") {
      settle(() => writePixel({ [target.key]: hex }));
    } else if (target.kind === "house") {
      settle(() => write((fresh) => {
        const cur = fresh?.ui_pixel && typeof fresh.ui_pixel === "object" ? fresh.ui_pixel : {};
        const swatches = nextHouseSwatches(cur.swatches, target.key, hex);
        const next = { ...cur, swatches };
        if (!Object.keys(swatches).length) delete next.swatches;
        return { ui_pixel: next };
      }));
    } else if (target.kind === "wave") {
      settle(() => write({ wave_color_custom: hex || null }));
    }
  };
  const clearSwatch = (key) => setSwatch(key, "");

  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const alterChips = alters.filter((a) => !a.is_archived && a.color).slice(0, 2).map((a) => a.color);

  // ── Fonts ──
  const fontOptions = useFontOptions({ includeInherit: false });
  const [a11y, setA11y] = useState(() => getAccessibilitySettings());
  useEffect(() => {
    const refresh = () => setA11y(getAccessibilitySettings());
    window.addEventListener(A11Y_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(A11Y_CHANGED_EVENT, refresh);
  }, []);
  const bodyOptions = useMemo(() => houseBodyOptions(fontOptions), [fontOptions]);
  const headingOptions = useMemo(() => houseHeadingOptions(fontOptions, look), [fontOptions, look]);
  const bodyValue = isUnchosenBody(a11y.fontFamily) ? HOUSE_BODY_DEFAULT_ID : a11y.fontFamily;
  const headingValue = a11y.headingFont || HOUSE_HEADING_DEFAULT_ID;
  const pickBody = (id) => {
    setAccessibilityFontFamily(id === HOUSE_BODY_DEFAULT_ID ? APP_FONT_OPTIONS[0].value : id);
    setA11y(getAccessibilitySettings());
  };
  const pickHeading = (id) => { setAccessibilityHeadingFont(id || HOUSE_HEADING_DEFAULT_ID); setA11y(getAccessibilitySettings()); };

  // ── Reset ──
  const reset = async () => {
    setResetOpen(false);
    const { clear, undo } = lookResetPatch(row?.ui_pixel);
    const waveBefore = row?.wave_color_custom ?? null;
    const fontBefore = a11y.fontFamily;
    const headingBefore = a11y.headingFont || HOUSE_HEADING_DEFAULT_ID;
    const hadColours = !!(customColors && (customColors.light || customColors.dark));
    try {
      await write({ ui_pixel: clear, wave_color_custom: null });
      // The colours are kept as a preset ("Unsaved colours (auto-kept)"),
      // never thrown away.
      if (hadColours) stashAndClearCustomColors();
      setAccessibilityFontFamily(APP_FONT_OPTIONS[0].value);
      setAccessibilityHeadingFont(HOUSE_HEADING_DEFAULT_ID);
      setA11y(getAccessibilitySettings());
      showToast({
        message: "The look is back to the house's own.",
        detail: hadColours ? "Your colours are kept under Styles as “Unsaved colours (auto-kept)”." : undefined,
        action: {
          label: "Undo",
          onClick: async () => {
            await write({ ui_pixel: undo, wave_color_custom: waveBefore });
            if (hadColours) updateCustomColorsFull(customColors.light || {}, customColors.dark || {});
            if (fontBefore) setAccessibilityFontFamily(fontBefore);
            setAccessibilityHeadingFont(headingBefore);
            setA11y(getAccessibilitySettings());
          },
        },
      });
    } catch (e) {
      showToast({ tone: "failed", message: e?.message || "Couldn't reset the look" });
    }
  };

  const homeField = useBoardField();
  const lookChoice = waveChoice(paint);

  return (
    <div className="hlk-tab" role="tabpanel" aria-labelledby="inspector-tab-look" data-tour="settings-look">
      <LookRow label="Look">
        <Segmented label="Look" value={look} onChange={(v) => { if (v !== look) write({ ui_look: v }); }}
          options={[{ value: "pixel", label: "Pixel" }, { value: "smooth", label: "Smooth" }]} />
      </LookRow>

      <LookRow label="Colours" top>
        <div className="hlk-colours">
          <div className="hlk-grid">
            {LOOK_SWATCHES.map((s) => {
              const shown = swatchShown(s.key, paint, roles) || "#888888";
              const own = swatchIsOwn(s.key, px, row);
              return (
                <div key={s.key} className="hlk-sw" data-picking={picking === s.key || undefined}
                  onPointerDownCapture={() => setPicking(s.key)} onFocusCapture={() => setPicking(s.key)}>
                  <HousePopups>
                    <ColorPicker compact caption={false} label={`Colour: ${s.label}`} value={shown}
                      onChange={(hex) => setSwatch(s.key, hex)}
                      onClear={own ? () => clearSwatch(s.key) : undefined} />
                  </HousePopups>
                  <span className="hlk-swname" aria-hidden="true">{s.label}</span>
                </div>
              );
            })}
          </div>
          <p className="hlk-note">
            {alterChips.map((c, i) => <span key={i} className="hlk-chip" style={{ background: c }} aria-hidden="true" />)}
            {`Each ${terms.alter} keeps the colour from their own profile. The look never changes it.`}
          </p>
          <div className="hlk-btns">
            <Button onClick={() => onTab("styles")}>Presets</Button>
          </div>
        </div>
      </LookRow>

      <LookRow label="Heading font">
        <div className="hlk-font">
          <NestedPicker label="Heading font" value={headingValue} onChange={pickHeading} options={headingOptions}
            placeholder="Heading font" searchPlaceholder="Find a font…" />
        </div>
      </LookRow>
      <LookRow label="Body font">
        <div className="hlk-font">
          <NestedPicker label="Body font" value={bodyValue} onChange={pickBody} options={bodyOptions}
            placeholder="Body font" searchPlaceholder="Find a font…" />
        </div>
        <span className="hlk-hint">OpenDyslexic, Lexend and your own fonts are in the list</span>
      </LookRow>

      {LOOK_SLIDERS.map((sl) => (
        <div key={sl.id} className="hlk-slider">
          <SliderRow label={sl.label} value={px[sl.id]} fallback={sl.fallback} min={sl.min} max={sl.max} unit="px"
            onChange={(v) => writePixel({ [sl.id]: Math.round(v) })}
            onClear={() => writePixel({ [sl.id]: "" })} />
        </div>
      ))}

      <LookRow label="Icons">
        <Segmented label="Icons" value={px.icons === "classic" ? "classic" : "pixel"}
          onChange={(v) => writePixel({ icons: v === "classic" ? "classic" : "" })}
          options={[{ value: "pixel", label: "Pixel" }, { value: "classic", label: "Classic" }]} />
        <Button onClick={() => onTab("bars")}>My icon pack</Button>
      </LookRow>

      <LookRow label="Header wave">
        <Segmented label="Header wave" value={lookChoice} onChange={(v) => writePixel({ wave: v })}
          options={[{ value: "off", label: "Off" }, { value: "stepped", label: "Stepped" }, { value: "smooth", label: "Smooth" }]} />
        <span className="hlk-sw hlk-sw--one">
          <HousePopups>
            <ColorPicker compact caption={false} label="Wave colour" value={swatchShown("wave", paint, roles) || "#6D73B0"}
              onChange={(hex) => setSwatch("wave", hex)}
              onClear={swatchIsOwn("wave", px, row) ? () => clearSwatch("wave") : undefined} />
          </HousePopups>
        </span>
        <span className="hlk-hint">wave colour, still when Reduce motion is on</span>
      </LookRow>

      <LookRow label="Penumblob">
        <Segmented label="Penumblob" value={px.guide || "shown"} onChange={(v) => writePixel({ guide: v === "shown" ? "" : v })}
          options={[{ value: "shown", label: "Shown" }, { value: "small", label: "Small" }, { value: "hidden", label: "Hidden" }]} />
      </LookRow>

      <div className="hlk-foot">
        <Button onClick={() => setResetOpen(true)}>Reset the look</Button>
        <span className="hlk-grow" />
        <Button onClick={() => setPack("import")}>Import a look</Button>
        <Button onClick={() => setPack("export")}>Share this look</Button>
      </div>

      <Sheet open={resetOpen} onClose={() => setResetOpen(false)} title="Reset the look?" size="half" modal
        footer={(
          <div className="hlk-btns">
            <Button rank="primary" onClick={reset}>Reset the look</Button>
            <Button onClick={() => setResetOpen(false)}>Keep it</Button>
          </div>
        )}>
        <p className="hlk-sheet-p">
          Colours, fonts, border, bevel, corners, icons and the header wave go back to the house&apos;s own.
          Your colours are kept under Styles as a preset, and Undo brings everything back.
          The Look choice and Penumblob stay as they are.
        </p>
      </Sheet>

      {pack ? (
        <Suspense fallback={null}>
          <HousePopups>
            <SetupPackSheet open onClose={() => setPack(null)} initialTab={pack}
              home={row?.[homeField] || null} uiV2Raw={row?.ui_v2 || {}} userStyles={resolveUserStyles(row?.ui_v2_styles)}
              settingsRow={row} homeField={homeField} />
          </HousePopups>
        </Suspense>
      ) : null}
    </div>
  );
}

function LookRow({ label, top = false, children }) {
  return (
    <div className="hlk-row" data-top={top || undefined}>
      <span className="hlk-lab">{label}</span>
      <div className="hlk-ctl">{children}</div>
    </div>
  );
}
