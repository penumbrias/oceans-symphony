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
import { createLocalDbEntities } from "@/lib/localDb";

export default function SimplyPluralConnect({ settings, onSettingsChange }) {
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importMode, setImportMode] = useState("standard");
  const queryClient = useQueryClient();

  const isConnected = !!settings?.sp_token;

  const handleConnect = async () => {
    if (!token.trim()) return;
    setConnecting(true);
    try {
      const systemId = await getSystemId(token.trim());
      const systemUser = await getSystemUser(token.trim(), systemId);
      const systemName = systemUser?.username || systemUser?.name || "";
      const systemDescription = systemUser?.desc || systemUser?.description || "";
      const spData = { sp_token: token.trim(), sp_system_id: systemId, system_name: systemName, system_description: systemDescription };

      if (isLocalMode()) {
        const localEntities = createLocalDbEntities();
        const existing = await localEntities.SystemSettings.list();
        if (existing.length > 0) {
          await localEntities.SystemSettings.update(existing[0].id, spData);
        } else {
          await localEntities.SystemSettings.create(spData);
        }
      } else {
        if (settings?.id) {
          await base44.entities.SystemSettings.update(settings.id, spData);
        } else {
          await base44.entities.SystemSettings.create(spData);
        }
      }

      setToken("");
      onSettingsChange();
      toast.success("Connected to Simply Plural");
    } catch (e) {
      toast.error(e.message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!settings?.id) return;
    try {
      if (isLocalMode()) {
        const localEntities = createLocalDbEntities();
        await localEntities.SystemSettings.update(settings.id, { sp_token: "", sp_system_id: "" });
      } else {
        await base44.entities.SystemSettings.update(settings.id, { sp_token: "", sp_system_id: "" });
      }
      onSettingsChange();
      toast.success("Disconnected from Simply Plural");
    } catch (e) {
      toast.error(e.message || "Disconnect failed");
    }
  };

  const handleImport = async () => {
    if (!settings?.sp_token || !settings?.sp_system_id) return;
    setSyncing(true);
    try {
      if (isLocalMode()) {
        await handleLocalImport();
      } else {
        await handleCloudImport();
      }
    } catch (e) {
      toast.error(e.message || "Import failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleCloudImport = async () => {
    const res = await base44.functions.invoke('importFromSimplyPlural', {
      sp_token: settings.sp_token,
      sp_system_id: settings.sp_system_id,
      mode: importMode,
    });
    await base44.entities.SystemSettings.update(settings.id, {
      last_sync: new Date().toISOString(),
    });
    onSettingsChange();
    queryClient.invalidateQueries({ queryKey: ["alters"] });
    queryClient.invalidateQueries({ queryKey: ["groups"] });
    toast.success(`Imported: ${res.alters.created} new, ${res.alters.updated} updated alters`);
  };

  const handleLocalImport = async () => {
    const localEntities = createLocalDbEntities();

    // Fetch from SP directly in browser
    const [members, groupsRaw] = await Promise.all([
      getMembers(settings.sp_token, settings.sp_system_id),
      getGroups(settings.sp_token, settings.sp_system_id),
    ]);

    if (!members || members.length === 0) {
      throw new Error("No members returned from Simply Plural. Check your token.");
    }

    // Build groups lookup
    const groupsById = {};
    groupsRaw.forEach((g) => {
      const gid = g.id || g._id;
      const gc = g.content || g;
      groupsById[gid] = {
        id: gid,
        name: gc.name || "",
        color: gc.color ? (gc.color.startsWith("#") ? gc.color : `#${gc.color}`) : "",
        parent: gc.parent || null,
        members: gc.members || [],
      };
    });

    // Load existing local records
    const existingGroups = await localEntities.Group.list();
    const existingAlters = await localEntities.Alter.list();
    const existingGroupsBySpId = Object.fromEntries(existingGroups.filter(g => g.sp_id).map(g => [g.sp_id, g]));
    const existingBySpId = Object.fromEntries(existingAlters.filter(a => a.sp_id).map(a => [a.sp_id, a]));

    // Replace all — delete existing first
    if (importMode === "replace_all") {
      for (const g of existingGroups) await localEntities.Group.delete(g.id);
      for (const a of existingAlters) await localEntities.Alter.delete(a.id);
    }

    // Sync groups
    let groupsCreated = 0;
    let groupsUpdated = 0;
    for (const g of Object.values(groupsById)) {
      const groupData = {
        sp_id: g.id,
        name: g.name,
        color: g.color,
        parent: g.parent || "",
        member_sp_ids: g.members,
      };
      const existing = existingGroupsBySpId[g.id];
      if (existing) {
        if (importMode !== "new_only") {
          await localEntities.Group.update(existing.id, groupData);
          groupsUpdated++;
        }
      } else {
        await localEntities.Group.create(groupData);
        groupsCreated++;
      }
    }

    // Sync members
    let altersCreated = 0;
    let altersUpdated = 0;
    for (const member of members) {
      const alterData = mapMemberToAlter(member, groupsById);
      if (!alterData.sp_id) continue;
      const existing = existingBySpId[alterData.sp_id];
      if (existing) {
        if (importMode !== "new_only") {
          // Protect rich text description from being overwritten by plain text
          const updateData = { ...alterData };
          if (existing.description && existing.description.includes('<')) {
            delete updateData.description;
          }
          await localEntities.Alter.update(existing.id, updateData);
          altersUpdated++;
        }
      } else {
        await localEntities.Alter.create(alterData);
        altersCreated++;
      }
    }

    // Update last sync in SystemSettings
    const settingsList = await localEntities.SystemSettings.list();
    if (settingsList.length > 0) {
      await localEntities.SystemSettings.update(settingsList[0].id, {
        last_sync: new Date().toISOString(),
      });
    }

    onSettingsChange();
    queryClient.invalidateQueries({ queryKey: ["alters"] });
    queryClient.invalidateQueries({ queryKey: ["groups"] });
    toast.success(`Imported: ${altersCreated} new, ${altersUpdated} updated alters · ${groupsCreated} new, ${groupsUpdated} updated groups`);
  };

  const handleDisconnect = async () => {
    if (!settings?.id) return;
    try {
      await base44.entities.SystemSettings.update(settings.id, {
        sp_token: "",
        sp_system_id: "",
      });
      onSettingsChange();
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
                {settings.system_name && (
                  <span className="text-muted-foreground">· {settings.system_name}</span>
                )}
                <span className="text-muted-foreground/60 text-xs font-mono">
                  {settings.sp_system_id?.slice(0, 8)}...
                </span>
              </div>
              {settings.last_sync && (
                <p className="text-xs text-muted-foreground">
                  Last synced: {new Date(settings.last_sync).toLocaleString()}
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