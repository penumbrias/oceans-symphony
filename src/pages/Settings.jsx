import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Textarea } from "@/components/ui/textarea";
import { useTheme } from "@/lib/ThemeContext";
import { useTerms } from "@/lib/useTerms";
import TermsSettings from "@/components/settings/TermsSettings";

import CustomFieldsManager from "@/components/settings/CustomFieldsManager";
import ArchivedAltersManager from "@/components/settings/ArchivedAltersManager";
import DiaryTemplateManager from "@/components/settings/DiaryTemplateManager";
import SimplyPluralConnect from "@/components/settings/SimplyPluralConnect";
import StorageModeSettings from "@/components/settings/StorageModeSettings";
import DataBackupRestore from "@/components/settings/DataBackupRestore";
import AdvancedAppearance from "@/components/settings/AdvancedAppearanceNew";
import { isLocalMode } from "@/lib/storageMode";
import { Palette, Save, Loader2, LogOut, Trash2, ChevronDown } from "lucide-react";

export default function Settings() {
  const queryClient = useQueryClient();
  const terms = useTerms();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);

  const handleSignOut = () => {
    base44.auth.logout("/");
  };

  const handleDeleteAccount = async () => {
    if (deleteInput.trim().toLowerCase() !== "delete my account") return;
    const entities = [
      "Alter", "FrontingSession", "Bulletin", "BulletinComment", "JournalEntry",
      "DiaryCard", "DailyProgress", "CustomField", "AlterNote", "AlterMessage",
      "Symptom", "SystemSettings", "SystemCheckIn", "EmotionCheckIn",
      "Activity", "Sleep", "Task", "CustomEmotion", "ActivityCategory",
      "MentionLog", "ActivityGoal", "Group",
    ];
    for (const name of entities) {
      try {
        const records = await base44.entities[name].list();
        for (const r of records) {
          await base44.entities[name].delete(r.id);
        }
      } catch {}
    }
    setDeleted(true);
  };

  const { data: settingsList = [], isLoading, refetch } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });

  const settings = settingsList[0] || null;

  const [systemName, setSystemName] = useState("");
  const [systemDescription, setSystemDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings?.system_name) setSystemName(settings.system_name);
    if (settings?.system_description !== undefined) setSystemDescription(settings.system_description || "");
  }, [settings]);

  const handleSaveName = async () => {
    setSaving(true);
    const data = { system_name: systemName, system_description: systemDescription };
    if (settings?.id) {
      await base44.entities.SystemSettings.update(settings.id, data);
    } else {
      await base44.entities.SystemSettings.create(data);
    }
    setSaving(false);
    refetch();
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
      <h1 className="font-display text-3xl font-semibold text-foreground mb-2">Settings</h1>
      <p className="text-muted-foreground mb-8">Customize {terms.system} and manage your account</p>

      <div className="space-y-6 max-w-2xl">

        {/* Privacy & Security Notice */}
        <Card className="border-amber-500/30 bg-amber-500/5">
  <CardHeader
    className="cursor-pointer select-none"
    onClick={() => setNoticeOpen(p => !p)}
  >
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
        <span className="text-lg">🔐</span>
      </div>
      <div className="flex-1">
        <CardTitle className="text-lg">Privacy & Data Notice</CardTitle>
        <CardDescription>Please read before entering sensitive information</CardDescription>
      </div>
      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${noticeOpen ? "rotate-180" : ""}`} />
    </div>
  </CardHeader>
  {noticeOpen && (
    <CardContent className="space-y-3 text-sm text-muted-foreground">
      <div className="space-y-1">
        <p className="font-semibold text-foreground">☁️ Cloud Mode</p>
        <p>
          Oceans Symphony is built on the Base44 platform. Your data is stored on Base44's servers
          with row-level security — no other user can access your data, and data cannot be accessed
          without being logged into your account. However, cloud data is{" "}
          <strong className="text-foreground">not end-to-end encrypted</strong>, meaning I as the
          developer technically have server access. I am committed to never accessing your data, but
          please be mindful of what you enter if this concerns you.
        </p>
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">🔒 Local Mode (Recommended)</p>
        <p>
          Local mode stores all data exclusively on your device. When encryption is enabled, your
          data is protected with <strong className="text-foreground">AES-256-GCM encryption</strong> —
          the same standard used by banks and governments. Your password never leaves your device.
          Even I cannot access your encrypted local data. <strong>This is the recommended mode for sensitive
          information.</strong>
        </p>
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">💾 Backups</p>
        <p>
          Use Settings → Backup & Export to save your data as a JSON file. Copy/paste exists as an alternative if download fails. Keep backups somewhere
          safe — local data is tied to this device and will be lost if you clear app data or
          uninstall without a backup. Copy/paste exists as an alternative if download fails.
        </p>
      </div>
      <p className="text-amber-600 dark:text-amber-400 font-medium pt-1">
        🌊 Oceans Symphony is free and shared in good faith with the community by a DID system.
        It was built to fill a void and has no intention of being gatekept. If you're a developer,
        feel free to copy it. This app is a work in progress — thank you for your
        patience and trust. 
      </p>
    </CardContent>
  )}
</Card>

        {/* System Name */}
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
                <Palette className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <CardTitle className="text-lg">{terms.System} Info</CardTitle>
                <CardDescription>Set your {terms.system} name and details</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="system-name" className="text-sm font-medium">{terms.System} Name</Label>
                <Input
                  id="system-name"
                  placeholder={`Enter your ${terms.system} name...`}
                  value={systemName}
                  onChange={(e) => setSystemName(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="system-description" className="text-sm font-medium">{terms.System} Description</Label>
                <Textarea
                  id="system-description"
                  placeholder={`Describe your ${terms.system}...`}
                  value={systemDescription}
                  onChange={(e) => setSystemDescription(e.target.value)}
                  className="mt-2 min-h-[100px]"
                />
              </div>
              <Button onClick={handleSaveName} disabled={saving} size="sm" className="bg-primary hover:bg-primary/90">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Advanced Appearance */}
        <AdvancedAppearance />

        {/* Terminology */}
        <TermsSettings />

        {/* Account (cloud only) */}
        {!isLocalMode() && (
          <Card className="border-border/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                  <LogOut className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <CardTitle className="text-lg">Account</CardTitle>
                  <CardDescription>Manage your account and data</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={handleSignOut} variant="outline" className="w-full gap-2">
                <LogOut className="w-4 h-4" /> Sign Out
              </Button>
              {!showDeleteConfirm && !deleted && (
                <Button
                  onClick={() => setShowDeleteConfirm(true)}
                  variant="ghost"
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Delete My Account
                </Button>
              )}
              {showDeleteConfirm && !deleted && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                  <p className="text-sm font-semibold text-destructive">⚠️ This is permanent</p>
                  <p className="text-xs text-muted-foreground">All your system data will be permanently deleted. This cannot be undone.</p>
                  <p className="text-xs font-medium">Type <span className="font-mono bg-muted px-1 rounded">delete my account</span> to confirm:</p>
                  <Input
                    value={deleteInput}
                    onChange={(e) => setDeleteInput(e.target.value)}
                    placeholder="delete my account"
                    className="h-8 text-sm border-destructive/40"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); }} className="flex-1">Cancel</Button>
                    <Button
                      size="sm"
                      onClick={handleDeleteAccount}
                      disabled={deleteInput.trim().toLowerCase() !== "delete my account"}
                      className="flex-1 bg-destructive hover:bg-destructive/90 text-white"
                    >
                      Delete Everything
                    </Button>
                  </div>
                </div>
              )}
              {deleted && (
                <div className="rounded-xl border border-green-500/40 bg-green-500/5 p-4 text-center space-y-2">
                  <p className="text-sm font-semibold text-green-600">✅ Account data deleted</p>
                  <p className="text-xs text-muted-foreground">All your data has been removed. You can close the app or sign out.</p>
                  <Button size="sm" onClick={handleSignOut} variant="outline" className="w-full">Sign Out Now</Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Data Management */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Data Management</p>
          <StorageModeSettings />
          <DataBackupRestore />
        </div>

        {/* Integrations */}
        <div className="space-y-2">

          <SimplyPluralConnect
            settings={settings}
            onSettingsChange={() => {
              refetch();
              queryClient.invalidateQueries({ queryKey: ["alters"] });
            }}
          />
        </div>

        {/* Diary Template */}
        <DiaryTemplateManager settings={settings} />

        {/* Custom Fields */}
        <CustomFieldsManager />

        {/* Archived Alters */}
        <ArchivedAltersManager />

      </div>
    </motion.div>
  );
}