// Per-widget advanced config for the experimental homescreen — a bottom
// sheet (vaul Drawer) hosted ONCE at ExperimentalDashboard level and keyed
// by the widget instanceId being configured. The caller derives the live
// widget from home state each render, so persisted changes flow straight
// back into the open sheet.
//
// Config: display name (settings.label), display mode (widget.mode), style
// override (settings.style — "inherit" clears it), and for app shortcuts a
// custom icon image (settings.iconUrl, picked via the shared asset picker).

import React from "react";
import { Image as ImageIcon, X } from "lucide-react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { HOME_MODES, effectiveMode } from "@/lib/experimentalHome";
import { HOME_STYLES } from "@/lib/homeStyles";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useTerms } from "@/lib/useTerms";
import { widgetLabel } from "@/lib/widgetRegistry";

const MODE_LABEL = { minimal: "Minimal", normal: "Normal", expanded: "Expanded", detailed: "Detailed" };

export default function WidgetConfigSheet({
  widget,            // live widget object or null (sheet closed)
  def,               // registry entry for widget.widgetId
  pageStyleId,       // the page's style (shown as the "inherit" hint)
  onClose,
  onMode,            // (instanceId, mode)
  onSettings,        // (instanceId, patch)
  onPickIcon,        // (instanceId) → opens the shared AssetPickerModal
}) {
  const open = !!widget && !!def;
  const settings = widget?.settings || {};
  const iconPreview = useResolvedAvatarUrl(settings.iconUrl || "");
  const t = useTerms();
  if (!open) return null;

  const defLabel = widgetLabel(def, t);
  const mode = effectiveMode(widget.mode, def.supportsModes);
  const styleOverride = HOME_STYLES.some((s) => s.id === settings.style) ? settings.style : "";
  const pageStyleLabel = HOME_STYLES.find((s) => s.id === pageStyleId)?.label || "Current";

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-1">
          <DrawerTitle className="text-base">{settings.label || defLabel}</DrawerTitle>
          <DrawerDescription className="text-xs">Widget options</DrawerDescription>
        </DrawerHeader>
        <div
          className="px-4 pb-6 space-y-4 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
        >
          {/* Rename */}
          <div>
            <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
              Display name
            </label>
            <input
              key={widget.instanceId}
              defaultValue={settings.label || ""}
              placeholder={defLabel}
              maxLength={60}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (settings.label || "")) onSettings(widget.instanceId, { label: v });
              }}
              className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Display mode */}
          {def.supportsModes.length > 1 && (
            <div>
              <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                Display mode
              </label>
              <div className="flex flex-wrap gap-1.5">
                {HOME_MODES.filter((m) => def.supportsModes.includes(m)).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onMode(widget.instanceId, m)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                      m === mode
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/50 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Style override */}
          <div>
            <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
              Style
            </label>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => onSettings(widget.instanceId, { style: "" })}
                className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                  !styleOverride
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/40 hover:border-border"
                }`}
              >
                <span className="font-medium">Inherit page style</span>
                <span className="text-xs text-muted-foreground block">Currently “{pageStyleLabel}”</span>
              </button>
              {HOME_STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSettings(widget.instanceId, { style: s.id })}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${
                    styleOverride === s.id
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/40 hover:border-border"
                  }`}
                >
                  <span className="font-medium">{s.label}</span>
                  <span className="text-xs text-muted-foreground block">{s.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Icon override — app shortcuts only */}
          {widget.widgetId === "app_shortcut" && (
            <div>
              <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                Icon
              </label>
              <div className="flex items-center gap-2">
                {iconPreview ? (
                  <img src={iconPreview} alt="" className="w-11 h-11 rounded-2xl object-cover border border-border/40" />
                ) : (
                  <span className="w-11 h-11 rounded-2xl border border-dashed border-border/50 flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="w-4 h-4" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onPickIcon(widget.instanceId)}
                  className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground"
                >
                  Choose image…
                </button>
                {settings.iconUrl && (
                  <button
                    type="button"
                    onClick={() => onSettings(widget.instanceId, { iconUrl: "" })}
                    aria-label="Remove custom icon"
                    className="min-w-[28px] min-h-[28px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
