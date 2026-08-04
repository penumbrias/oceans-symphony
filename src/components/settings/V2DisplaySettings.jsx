// The new UI's display controls, as ordinary Appearance sections — rendered
// INSIDE AdvancedAppearanceNew so there is one settings surface, not two.
// The v2 top bar's "Display options" sheet embeds the same Appearance body,
// so both routes land on identical, integrated controls.
//
// Self-contained on purpose: fetches the settings row itself and writes
// through the same ui_v2 patch shape the top-bar sheet used, so it can live
// in classic Settings → Appearance without any prop plumbing.

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate, useLocation } from "react-router-dom";
import { Pencil } from "lucide-react";
import { SubSection } from "@/components/settings/SettingsUI";
import ColorPicker from "@/components/shared/ColorPicker";
import { AssetButton } from "@/components/shared/AssetPickerModal";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { confirm } from "@/components/shared/ConfirmDialog";
import { resolveUiV2, V2_TOKEN_DEFS } from "@/lib/uiV2";
import { UI_V2_ENABLED } from "@/lib/featureFlags";
import { setAccessibilityFontSize } from "@/lib/useAccessibility";
import { useT, LOCALES, getLocale, setLocale, localeCoverage } from "@/lib/i18n";
import { requestHomeAction } from "@/components/v2/V2Frame";

const LOOK_IDS = ["accent", "density", "radius", "borderW"];

// label · − · slider · + · value. Steppers give exact single steps that
// can't be hit while scrolling; the narrow slider covers coarse moves.
function TokenRow({ def, value, onChange }) {
  const t = useT();
  if (def.type === "range") {
    const shown = def.id === "contentW" && !value ? t("options.valueFull") : `${value}${def.unit || ""}`;
    const step = (dir) => {
      const next = Math.min(def.max, Math.max(def.min, (Number(value) || 0) + dir * def.step));
      if (next !== value) onChange(next);
    };
    return (
      <div className="flex items-center gap-2.5 py-1">
        <span className="text-xs font-medium flex-1 min-w-0 truncate">{def.label}</span>
        <button type="button" aria-label={`${def.label} −`} onClick={() => step(-1)}
          className="w-7 h-7 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground flex items-center justify-center text-sm leading-none">−</button>
        <input type="range" min={def.min} max={def.max} step={def.step} value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="w-24 sm:w-36" aria-label={def.label} />
        <button type="button" aria-label={`${def.label} +`} onClick={() => step(1)}
          className="w-7 h-7 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground flex items-center justify-center text-sm leading-none">+</button>
        <span className="text-xs text-muted-foreground tabular-nums w-11 text-right flex-shrink-0">{shown}</span>
      </div>
    );
  }
  if (def.type === "select") {
    return (
      <div className="flex items-center gap-2.5 py-1">
        <span className="text-xs font-medium flex-1 min-w-0 truncate">{def.label}</span>
        <div className="flex gap-1.5 flex-wrap justify-end">
          {def.options.map((o) => (
            <button key={o.v} type="button" onClick={() => onChange(o.v)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                value === o.v ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
              }`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (def.type === "color") {
    return (
      <div className="flex items-center gap-2.5 py-1">
        <span className="text-xs font-medium flex-1 min-w-0 truncate">{def.label}</span>
        <ColorPicker value={value || "#3b82f6"} onChange={onChange} />
        <button type="button" onClick={() => onChange("")}
          className={`text-xs px-2.5 py-1 rounded-full border ${!value ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"}`}>
          {t("options.useTheme")}
        </button>
      </div>
    );
  }
  return null;
}

// Shared plumbing for every piece below. Each piece renders null when the
// new UI is off, so the classic Appearance body can mount them
// unconditionally at the RELEVANT spots (spacing with sizes, accent with
// theme, radius with corner style, bars with layout) instead of stacking a
// separate "new UI" block on top.
function useV2Display() {
  const qc = useQueryClient();
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settingsRow = settingsList[0] || null;
  const uiV2 = resolveUiV2(settingsRow?.ui_v2);
  const enabled = UI_V2_ENABLED && uiV2.enabled === true;
  const write = async (patch) => {
    try {
      if (!settingsRow?.id) return;
      await base44.entities.SystemSettings.update(settingsRow.id, {
        ui_v2: { ...(settingsRow.ui_v2 || {}), enabled: true, ...patch },
      });
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch { /* best-effort live */ }
  };
  return {
    enabled, uiV2, write,
    setToken: (id, value) => write({ tokens: { ...(settingsRow?.ui_v2?.tokens || {}), [id]: value } }),
    setBar: (bar, visible) => write({ bars: { ...(settingsRow?.ui_v2?.bars || {}), [bar]: visible } }),
  };
}

const tokenById = Object.fromEntries(V2_TOKEN_DEFS.map((d) => [d.id, d]));
const row = (v2, id) => {
  const def = tokenById[id];
  return def ? (
    <TokenRow key={id} def={def} value={v2.uiV2.tokens[id] ?? def.default} onChange={(v) => v2.setToken(id, v)} />
  ) : null;
};

// With UI size / Advanced: the spacing scale.
export function V2SpacingRow() {
  const v2 = useV2Display();
  if (!v2.enabled) return null;
  return row(v2, "density");
}

// With Theme: the highlight colour.
export function V2AccentRow() {
  const v2 = useV2Display();
  if (!v2.enabled) return null;
  return row(v2, "accent");
}

// With Corner style: radius + border width.
export function V2ShapeRows() {
  const v2 = useV2Display();
  if (!v2.enabled) return null;
  return <div className="space-y-1">{row(v2, "radius")}{row(v2, "borderW")}</div>;
}

// With Layout: edit-home, bar visibility, bar sizes, apps button, reset.
export function V2LayoutControls() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const v2 = useV2Display();
  const appsIconUrl = useResolvedAvatarUrl(v2.uiV2.appsIcon || "");
  if (!v2.enabled) return null;

  const sizeDefs = V2_TOKEN_DEFS.filter((d) => !LOOK_IDS.includes(d.id));
  const BAR_TOGGLES = [
    { id: "top", label: t("options.topBar") },
    { id: "actions", label: t("options.quickActionRow") },
    { id: "tabs", label: t("options.sectionTabs") },
    { id: "wave", label: t("options.waveHeader") },
    { id: "rail", label: t("options.sideRail") },
  ];

  return (
    <div className="space-y-2">
      <button type="button"
        onClick={() => requestHomeAction(navigate, location.pathname, "edit-home")}
        className="w-full flex items-center gap-2.5 h-10 px-3 rounded-xl border border-primary/50 text-primary text-sm font-medium">
        <Pencil className="w-4 h-4" /> {t("options.editHome")}
      </button>

      <SubSection title={t("options.showHide")}>
        <div className="space-y-1">
          {BAR_TOGGLES.map((b) => (
            <label key={b.id} className="flex items-center justify-between gap-3 py-1 text-xs font-medium cursor-pointer">
              <span>{b.label}</span>
              <input type="checkbox" checked={v2.uiV2.bars[b.id]} onChange={(e) => v2.setBar(b.id, e.target.checked)}
                className="w-4 h-4 rounded accent-primary" aria-label={b.label} />
            </label>
          ))}
          {!v2.uiV2.bars.top && <p className="text-[0.6875rem] text-muted-foreground">{t("options.recoveryHint")}</p>}
        </div>
      </SubSection>

      <SubSection title={t("options.sectionSizes")}>
        <div className="space-y-1">
          {sizeDefs.map((d) => (
            <TokenRow key={d.id} def={d} value={v2.uiV2.tokens[d.id] ?? d.default} onChange={(val) => v2.setToken(d.id, val)} />
          ))}
        </div>
      </SubSection>

      <SubSection title={t("options.sectionApps")}>
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 py-1">
            <span className="text-xs font-medium flex-1 min-w-0 truncate">{t("options.appsView")}</span>
            <div className="flex gap-1.5">
              {[["grid", t("options.appsViewGrid")], ["sidebar", t("options.appsViewSidebar")]].map(([val, label]) => (
                <button key={val} type="button" onClick={() => v2.write({ appsView: val })}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    (v2.uiV2.appsView || "grid") === val ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2.5 py-1">
            <span className="text-xs font-medium flex-1 min-w-0 truncate">{t("options.appsIcon")}</span>
            <span className="w-8 h-8 flex items-center justify-center rounded-lg border border-border">
              {appsIconUrl
                ? <img src={appsIconUrl} alt="" className="w-5 h-5 object-cover rounded" />
                : <img src="/logo.png" alt="" className="w-5 h-5 object-contain rounded" />}
            </span>
            <AssetButton onPick={(url) => v2.write({ appsIcon: url || "" })} title={t("options.appsIconPick")} />
            {v2.uiV2.appsIcon && (
              <button type="button" onClick={() => v2.write({ appsIcon: "" })}
                className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground">
                {t("options.appsIconReset")}
              </button>
            )}
          </div>
        </div>
      </SubSection>

      <button type="button"
        onClick={async () => {
          const ok = await confirm({
            title: t("options.resetTitle"),
            body: t("options.resetBody"),
            confirmLabel: t("options.resetConfirm"),
            destructive: true,
          });
          if (!ok) return;
          setAccessibilityFontSize("default");
          v2.write({ tokens: {}, bars: {}, dockPos: null, appsIcon: "", appsView: "grid" });
        }}
        className="w-full h-10 rounded-xl border border-border/60 text-sm text-muted-foreground hover:text-destructive hover:border-destructive/40">
        {t("options.reset")}
      </button>
    </div>
  );
}

// Language picker — only when a second locale is registered.
export function V2LanguageSection() {
  const t = useT();
  const v2 = useV2Display();
  const [locale, setLocaleState] = React.useState(getLocale());
  const localeCodes = Object.keys(LOCALES);
  if (!v2.enabled || localeCodes.length < 2) return null;
  return (
    <SubSection title={t("options.language")}>
      <div className="flex flex-wrap gap-1.5 py-1">
        {localeCodes.map((code) => {
          const cov = localeCoverage(code);
          return (
            <button key={code} type="button"
              onClick={() => { setLocale(code); setLocaleState(code); }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                locale === code ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground"
              }`}>
              {LOCALES[code].name}
              {cov.pct < 100 && <span className="opacity-60"> · {cov.pct}%</span>}
            </button>
          );
        })}
      </div>
    </SubSection>
  );
}
