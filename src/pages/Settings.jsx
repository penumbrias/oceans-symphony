import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import CustomEmotionsManager from "@/components/settings/CustomEmotionsManager";
import CustomTriggerTypesManager from "@/components/settings/CustomTriggerTypesManager";
import { useTerms } from "@/lib/useTerms";
import TermsSettings from "@/components/settings/TermsSettings";
import CustomFieldsManager from "@/components/settings/CustomFieldsManager";
import ArchivedAltersManager from "@/components/settings/ArchivedAltersManager";
import RelationshipTypesManager from "@/components/settings/RelationshipTypesManager";
import SimplyPluralConnect from "@/components/settings/SimplyPluralConnect";
import StorageModeSettings from "@/components/settings/StorageModeSettings";
import DataBackupRestore from "@/components/settings/DataBackupRestore";
import AdvancedAppearance from "@/components/settings/AdvancedAppearanceNew";
import NavigationSettings from "@/components/settings/NavigationSettings";
import RemindersSettings from "@/components/settings/RemindersSettings";
import AccessibilitySettings from "@/components/settings/AccessibilitySettings";
import { Palette, Save, Loader2, ChevronDown, Zap, Check, BarChart2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAnalyticsGrouping } from "@/lib/useAnalyticsGrouping";

const SECTIONS = [
  { id: "system", label: "System", icon: "⚙️" },
  { id: "appearance", label: "Appearance", icon: "🎨" },
  { id: "accessibility", label: "Accessibility", icon: "♿" },
  { id: "alters", label: "Alters & Fields", icon: "👥" },
  { id: "checkin", label: "Check-In & Tracking", icon: "⚡" },
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "reminders", label: "Reminders", icon: "🔔" },
  { id: "data", label: "Data & Privacy", icon: "💾" },
  { id: "account", label: "Account", icon: "🔑" },
];

function Section({ id, icon, label, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div id={id} className="border border-border/50 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-4 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
      >
        <span className="text-xl">{icon}</span>
        <span className="flex-1 font-semibold text-sm">{label}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 py-4 space-y-6 border-t border-border/30">
          {children}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const terms = useTerms();
  const { mode: analyticsGrouping, setMode: setAnalyticsGrouping } = useAnalyticsGrouping();

  const { data: settingsList = [], isLoading, refetch } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });

  const settings = settingsList[0] || null;
  const [systemName, setSystemName] = useState("");
  const [systemDescription, setSystemDescription] = useState("");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (settings?.system_name) setSystemName(settings.system_name);
    if (settings?.system_description !== undefined) setSystemDescription(settings.system_description || "");
  }, [settings]);

  const [saved, setSaved] = useState(false);

  const handleSaveName = async () => {
    setSaving(true);
    const data = { system_name: systemName, system_description: systemDescription };
    try {
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, data);
      } else {
        await base44.entities.SystemSettings.create(data);
      }
      refetch();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };


  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Auto-open the section
    el.querySelector("button")?.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold text-foreground mb-1">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Customize your {terms.system} and manage your account. {" "}
          <span onClick={() => window.open("https://www.notion.so/709a266d2e0f4da7a4aaa02e180ee1ad?v=e950ba087a1d42bea4ee0784dc8307b1", "_blank")}
            className="text-primary underline hover:text-primary/80 cursor-pointer">
            Template gallery →
          </span><p>
          <span onClick={() => window.open("https://github.com/penumbrias/oceans-symphony/releases", "_blank")}
                className="text-primary underline cursor-pointer">Latest releases on GitHub →</span>
        </p></p>
      </div>

      {/* Quick Nav */}
      <div className="flex flex-wrap gap-2 mb-6 p-3 bg-muted/20 border border-border/40 rounded-xl">
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => scrollTo(s.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background border border-border/40 hover:bg-muted/50 hover:border-primary/40 transition-colors text-xs font-medium">
            <span>{s.icon}</span> {s.label}
          </button>
        ))}
      </div>

      <div className="space-y-3 max-w-2xl">

        {/* ── SYSTEM ── */}
        <Section id="system" icon="⚙️" label="System" defaultOpen={true}>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">{terms.System} Name</Label>
              <Input placeholder={`Enter your ${terms.system} name...`} value={systemName}
                onChange={e => setSystemName(e.target.value)} className="mt-2" />
            </div>
            <div>
              <Label className="text-sm font-medium">{terms.System} Description</Label>
              <Textarea placeholder={`Describe your ${terms.system}...`} value={systemDescription}
                onChange={e => setSystemDescription(e.target.value)} className="mt-2 min-h-[100px]" />
            </div>
            <Button onClick={handleSaveName} disabled={saving || saved} size="sm"
              className={saved ? "bg-green-600 hover:bg-green-600 text-white" : "bg-primary hover:bg-primary/90"}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : saved ? <Check className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {saved ? "Saved!" : "Save"}
            </Button>
          </div>
          <TermsSettings />
        </Section>

        {/* ── APPEARANCE ── */}
        <Section id="appearance" icon="🎨" label="Appearance">
          <AdvancedAppearance />
          <NavigationSettings settings={settings} />
        </Section>

        {/* ── ACCESSIBILITY ── */}
        <Section id="accessibility" icon="♿" label="Accessibility">
          <AccessibilitySettings />
        </Section>

        {/* ── ALTERS & FIELDS ── */}
        <Section id="alters" icon="👥" label="Alters & Fields">
          <CustomFieldsManager />
          <div className="border-t border-border/30 pt-4">
            <RelationshipTypesManager />
          </div>
          <div className="border-t border-border/30 pt-4">
            <ArchivedAltersManager />
          </div>
        </Section>

        {/* ── CHECK-IN & TRACKING ── */}
        <Section id="checkin" icon="⚡" label="Check-In & Tracking">
          <div className="flex items-center justify-between p-3 bg-muted/20 rounded-xl border border-border/40">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Check-In Manager</p>
                <p className="text-xs text-muted-foreground">Configure quick check-in fields</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/manage-checkin")}>Open</Button>
          </div>
          <div className="border-t border-border/30 pt-4">
            <CustomEmotionsManager />
          </div>
          <div className="border-t border-border/30 pt-4">
            <CustomTriggerTypesManager />
          </div>
        </Section>

        {/* ── ANALYTICS ── */}
        <Section id="analytics" icon="📊" label="Analytics">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold mb-1">Grouping mode</p>
              <p className="text-xs text-muted-foreground mb-3">
                For large systems, analytics can aggregate data by group instead of by individual member.
                Groups are managed from the {terms.System} Members page.
              </p>
              <div className="flex gap-2">
                {[
                  { id: "individual", label: "By member", desc: "Show each member separately" },
                  { id: "group", label: "By group", desc: "Aggregate members into their groups" },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setAnalyticsGrouping(opt.id)}
                    className={`flex-1 rounded-xl border p-3 text-left transition-all ${
                      analyticsGrouping === opt.id
                        ? "border-primary/60 bg-primary/10"
                        : "border-border/50 bg-card hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <BarChart2 className={`w-3.5 h-3.5 ${analyticsGrouping === opt.id ? "text-primary" : "text-muted-foreground"}`} />
                      <p className={`text-xs font-semibold ${analyticsGrouping === opt.id ? "text-primary" : "text-foreground"}`}>
                        {opt.label}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{opt.desc}</p>
                  </button>
                ))}
              </div>
              {analyticsGrouping === "group" && (
                <p className="text-xs text-muted-foreground mt-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                  Group mode is active. The Patterns & Insights section will show data aggregated by group.
                  Alters without a group appear under "Ungrouped."
                </p>
              )}
            </div>
          </div>
        </Section>

        {/* ── REMINDERS ── */}
        <Section id="reminders" icon="🔔" label="Reminders">
          <RemindersSettings />
        </Section>

        {/* ── DATA & PRIVACY ── */}
        <Section id="data" icon="💾" label="Data & Privacy">
          {/* Privacy notice */}
          <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4 space-y-3 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">🔐 Privacy & Data Notice</p>
            <div className="space-y-1">
              <p className="font-medium text-foreground">🔒 Local Mode</p>
              <p>All data is stored on your device with <strong>AES-256-GCM encryption</strong>. Your password never leaves your device. <strong>If you lose your encryption password, data cannot be retrieved.</strong></p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-foreground">💾 Backups</p>
              <p>Use Backup & Export below to save your data as a JSON file. Keep backups safe — local data is tied to this device.</p>
            </div>
            <p className="text-amber-600 dark:text-amber-400 font-medium">
              🌊 Oceans Symphony is free and shared in good faith by a DID system. Contact: pesturedrawing@gmail.com. {" "}
              <span onClick={() => window.open("https://github.com/penumbrias/oceans-symphony/releases", "_blank")}
                className="text-primary underline cursor-pointer">Latest releases on GitHub →</span>
            </p>
          </div>
          <div className="border-t border-border/30 pt-4">
            <StorageModeSettings />
          </div>
          <div className="border-t border-border/30 pt-4">
            <DataBackupRestore />
          </div>
          <div className="border-t border-border/30 pt-4">
            <SimplyPluralConnect settings={settings} onSettingsChange={() => {
              refetch();
              queryClient.invalidateQueries({ queryKey: ["alters"] });
            }} />
          </div>
        </Section>


      </div>
    </motion.div>
  );
}