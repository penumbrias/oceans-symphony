import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, Info, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { readNotificationPrefs } from "@/lib/notificationPrefs";

// User-facing settings for the in-app toast surface. Persists to
// SystemSettings.notification_prefs which Sonner's Toaster wrapper
// reads on every render.

const DURATIONS = [
  { value: 2000,  label: "2 seconds",  hint: "Quick — flashes by." },
  { value: 4000,  label: "4 seconds",  hint: "Default." },
  { value: 6000,  label: "6 seconds",  hint: "Lingering. Easier to read." },
  { value: 10000, label: "10 seconds", hint: "Sticks around." },
];

const POSITIONS = [
  { value: "top-center",    label: "Top center" },
  { value: "top-right",     label: "Top right" },
  { value: "top-left",      label: "Top left" },
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right",  label: "Bottom right" },
  { value: "bottom-left",   label: "Bottom left" },
];

const TYPE_ROWS = [
  {
    key: "showSuccess",
    icon: CheckCircle2,
    iconClass: "text-emerald-500",
    label: "Success messages",
    description: "Green confirmation toasts — \"Saved!\", \"Plan updated!\", \"Bulletin posted!\", etc.",
  },
  {
    key: "showInfo",
    icon: Info,
    iconClass: "text-sky-500",
    label: "Info messages",
    description: "Neutral notices, like background sync results or non-critical hints.",
  },
  {
    key: "showWarning",
    icon: AlertTriangle,
    iconClass: "text-amber-500",
    label: "Warnings",
    description: "Yellow heads-up notices about partial saves, things needing review, etc.",
  },
  {
    key: "showError",
    icon: XCircle,
    iconClass: "text-destructive",
    label: "Errors",
    description: "Errors stay on — if something fails, the app needs to tell you.",
    locked: true,
  },
];

export default function NotificationSettings() {
  const qc = useQueryClient();
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = list?.[0];
  const prefs = readNotificationPrefs(settings);

  const save = async (patch) => {
    const next = { ...prefs, ...patch };
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, { notification_prefs: next });
      } else {
        await base44.entities.SystemSettings.create({ notification_prefs: next });
      }
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    } catch (e) {
      toast.error(e?.message || "Couldn't save notification prefs");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Bell className="w-4 h-4" />
          In-app notifications
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          The small banners that pop up at the edge of the screen to confirm an action or report a problem. Errors always show; the rest you can turn on or off.
        </p>
      </div>

      <div className="space-y-2">
        {TYPE_ROWS.map((row) => {
          const Icon = row.icon;
          const checked = row.locked ? true : !!prefs[row.key];
          return (
            <div
              key={row.key}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5"
            >
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${row.iconClass}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{row.description}</p>
              </div>
              <Switch
                checked={checked}
                disabled={!!row.locked}
                onCheckedChange={(v) => save({ [row.key]: v })}
                aria-label={`${row.label}: ${checked ? "on" : "off"}`}
              />
            </div>
          );
        })}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">How long they stick around</p>
        <div className="grid gap-1.5">
          {DURATIONS.map((opt) => {
            const isCurrent = prefs.durationMs === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => save({ durationMs: opt.value })}
                className={`text-left rounded-xl border px-3 py-2 transition-all ${
                  isCurrent
                    ? "border-primary/50 bg-primary/10"
                    : "border-border/60 bg-card hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${isCurrent ? "text-primary" : "text-foreground"}`}>{opt.label}</span>
                  {isCurrent && <span className="text-[0.625rem] uppercase tracking-wider text-primary">Selected</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.hint}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Where they appear</p>
        <div className="grid grid-cols-2 gap-1.5">
          {POSITIONS.map((opt) => {
            const isCurrent = prefs.position === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => save({ position: opt.value })}
                className={`text-center rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                  isCurrent
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/60 bg-card text-foreground hover:bg-muted/30"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-2 border-t border-border/40">
        <p className="text-xs text-muted-foreground mb-2">Test it:</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => toast.success("Success preview")}
            className="text-xs px-2.5 py-1 rounded-full border border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10"
          >Success</button>
          <button
            type="button"
            onClick={() => toast.info?.("Info preview")}
            className="text-xs px-2.5 py-1 rounded-full border border-sky-500/40 text-sky-500 hover:bg-sky-500/10"
          >Info</button>
          <button
            type="button"
            onClick={() => toast.warning?.("Warning preview")}
            className="text-xs px-2.5 py-1 rounded-full border border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
          >Warning</button>
          <button
            type="button"
            onClick={() => toast.error("Error preview")}
            className="text-xs px-2.5 py-1 rounded-full border border-destructive/40 text-destructive hover:bg-destructive/10"
          >Error</button>
        </div>
      </div>
    </div>
  );
}
