import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle2, Link2, RefreshCw, Unlink, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getSystemId, getSystemUser, getMembers, getGroups, mapMemberToAlter } from "@/lib/simplyPlural";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { isLocalMode } from "@/lib/storageMode";

// --- Local mode storage helpers ---
const LOCAL_SP_KEY = "oceans_sp_settings";

function getLocalSpSettings() {
  try {
    const raw = localStorage.getItem(LOCAL_SP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocalSpSettings(data) {
  const existing = getLocalSpSettings() || {};
  localStorage.setItem(LOCAL_SP_KEY, JSON.stringify({ ...existing, ...data }));
}

function clearLocalSpSettings() {
  localStorage.removeItem(LOCAL_SP_KEY);
}

export default function SimplyPluralConnect({ settings, onSettingsChange }) {
  const localMode = isLocalMode();

  // In local mode, read from localStorage instead of the settings prop
  const localSettings = localMode ? getLocalSpSettings() : null;
  const effectiveSettings = localMode ? localSettings : settings;

  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importMode, setImportMode] = useState("standard");
  const queryClient = useQueryClient();

  const isConnected = !!effectiveSettings?.sp_token;

  const handleConnect = async () => {
    if (!token.trim()) return;
    setConnecting(true);
    try {
      const systemId = await getSystemId(token.trim());
      const systemUser = await getSystemUser(token.trim(), systemId);
      const systemName = systemUser?.username || systemUser?.name || "";
      const systemDescription = systemUser?.desc || systemUser?.description || "";

      const spData = {
        sp_token: token.trim(),
        sp_system_id: systemId,
        system_name: systemName,
        system_description: systemDescription,
      };

      if (localMode) {
        saveLocalSpSettings(spData);
        onSettingsChange();
      } else {
        if (settings?.id) {
          await base44.entities.SystemSettings.update(settings.id, spData);
        } else {
          await base44.entities.SystemSettings.create(spData);
        }
        onSettingsChange();
      }

      setToken("");
      toast.success("Connected to Simply Plural");
    } catch (e) {
      toast.error(e.message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const handleImport = async () => {
    if (!effectiveSettings?.sp_token || !effectiveSettings?.sp_system_id) return;
    setSyncing(true);
    try {
      if (localMode) {
        // In local mode, import directly without base44 functions
        const members = await getMembers(effectiveSettings.sp_token, effectiveSettings.sp_system_id);
        const groups = await getGroups(effectiveSettings.sp_token, effectiveSettings.sp_system_id);

        // Load existing local alters
        const existingRaw = localStorage.getItem("oceans_alters");
        const existingAlters = existingRaw ? JSON.parse(existingRaw) : [];

        const mapped = members.map((m) => mapMemberToAlter(m));
        let created = 0;
        let updated = 0;

        if (importMode === "replace_all") {
          localStorage.setItem("oceans_alters", JSON.stringify(mapped));
          created = mapped.length;
        } else {
          const merged = [...existingAlters];
          for (const incoming of mapped) {
            const existingIdx = merged.findIndex((a) => a.sp_id === incoming.sp_id);
            if (existingIdx !== -1) {
              if (importMode !== "new_only") {
                merged[existingIdx] = { ...merged[existingIdx], ...incoming };
                updated++;
              }
            } else {
              merged.push({ ...incoming, id: `local_${Date.now()}_${Math.random()}` });
              created++;
            }
          }
          localStorage.setItem("oceans_alters", JSON.stringify(merged));
        }

        saveLocalSpSettings({ last_sync: new Date().toISOString() });
        onSettingsChange();
        queryClient.invalidateQueries({ queryKey: ["alters"] });
        queryClient.invalidateQueries({ queryKey: ["groups"] });
        toast.success(`Imported: ${created} new, ${updated} updated alters`);
      } else {
        // Cloud mode — use base44 function as before
        const res = await base44.functions.invoke("importFromSimplyPlural", {
          sp_token: effectiveSettings.sp_token,
          sp_system_id: effectiveSettings.sp_system_id,
          mode: importMode,
        });
        await base44.entities.SystemSettings.update(settings.id, {
          last_sync: new Date().toISOString(),
        });
        onSettingsChange();
        queryClient.invalidateQueries({ queryKey: ["alters"] });
        queryClient.invalidateQueries({ queryKey: ["groups"] });
        toast.success(`Imported: ${res.alters.created} new, ${res.alters.updated} updated alters`);
      }
    } catch (e) {
      toast.error(e.message || "Import failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (localMode) {
        clearLocalSpSettings();
        onSettingsChange();
      } else {
        if (!settings?.id) return;
        await base44.entities.SystemSettings.update(settings.id, {
          sp_token: "",
          sp_system_id: "",
        });
        onSettingsChange();
      }
      toast.success("Disconnected from Simply Plural");
    } catch (e) {
      toast.error(e.message || "Disconnect failed");
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Simply Plural</CardTitle>
            <CardDescription>
              Connect your Simply Plural account to import alter data
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isConnected ? (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 text-sm flex-wrap mb-4">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-foreground font-medium">Connected</span>
                {effectiveSettings.system_name && (
                  <span className="text-muted-foreground">· {effectiveSettings.system_name}</span>
                )}
                <span className="text-muted-foreground/60 text-xs font-mono">
                  {effectiveSettings.sp_system_id?.slice(0, 8)}...
                </span>
              </div>
              {effectiveSettings.last_sync && (
                <p className="text-xs text-muted-foreground">
                  Last synced: {new Date(effectiveSettings.last_sync).toLocaleString()}
                </p>
              )}
              {localMode && (
                <p className="text-xs text-amber-500 mt-1">
                  🔒 Token stored locally on this device only
                </p>
              )}
            </div>

            {/* Import Section */}
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <ArrowDownLeft className="w-4 h-4 text-blue-500" />
                <h4 className="font-medium text-sm">Import from Simply Plural</h4>
              </div>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="import-mode" className="text-xs">Import Mode</Label>
                  <select
                    id="import-mode"
                    value={importMode}
                    onChange={(e) => setImportMode(e.target.value)}
                    className="w-full text-sm border rounded-md px-2 py-2 bg-card mt-1"
                  >
                    <option value="standard">Standard (Update & Add New)</option>
                    <option value="new_only">New Only</option>
                    <option value="replace_all">Replace All (⚠️ Destructive)</option>
                  </select>
                </div>
                <Button
                  onClick={handleImport}
                  disabled={syncing}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 w-full"
                >
                  {syncing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowDownLeft className="w-4 h-4 mr-2" />
                  )}
                  {syncing ? "Importing..." : "Import Now"}
                </Button>
              </div>
            </div>

            {/* Disconnect Button */}
            <div className="border-t pt-4 flex gap-2">
              <Button
                onClick={handleDisconnect}
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive flex-1"
              >
                <Unlink className="w-4 h-4 mr-2" />
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="sp-token" className="text-sm font-medium">
                API Token
              </Label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Find your token in Simply Plural → Settings → Tokens
              </p>
              {localMode && (
                <p className="text-xs text-amber-500 mb-2">
                  🔒 In local mode, your token is stored only on this device
                </p>
              )}
              <Input
                id="sp-token"
                type="password"
                placeholder="Paste your Simply Plural token..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="bg-card/50"
              />
            </div>
            <Button
              onClick={handleConnect}
              disabled={connecting || !token.trim()}
              className="bg-primary hover:bg-primary/90"
            >
              {connecting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4 mr-2" />
              )}
              {connecting ? "Connecting..." : "Connect"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}