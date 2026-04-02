import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle2, Link2, Unlink, ArrowDownLeft } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  getSystemId,
  getSystemUser,
  getMembers,
  getGroups,
  getNotes,
  mapMemberToAlter,
  mapGroupToLocalGroup,
  mapNoteToAlterNote,
} from "@/lib/simplyPlural";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { isLocalMode } from "@/lib/storageMode";
import { localEntities } from "@/api/base44Client";

export default function SimplyPluralConnect({ settings, onSettingsChange }) {
  const localMode = isLocalMode();

  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importMode, setImportMode] = useState("standard");
  const [importProgress, setImportProgress] = useState("");
  const queryClient = useQueryClient();

  const effectiveSettings = settings;
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

      // base44.entities proxy routes to localDb automatically in local mode
      if (effectiveSettings?.id) {
        await base44.entities.SystemSettings.update(effectiveSettings.id, spData);
      } else {
        await base44.entities.SystemSettings.create(spData);
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

  const handleImport = async () => {
    if (!effectiveSettings?.sp_token || !effectiveSettings?.sp_system_id) return;
    setSyncing(true);
    setImportProgress("");

    try {
      if (localMode) {
        const { sp_token: tok, sp_system_id: sysId } = effectiveSettings;
        const entities = getLocalEntities();

        // --- Step 1: Fetch everything from SP ---
        setImportProgress("Fetching members...");
        const members = await getMembers(tok, sysId);

        setImportProgress("Fetching groups...");
        const groups = await getGroups(tok, sysId);

        setImportProgress("Fetching notes...");
        const notes = await getNotes(tok, sysId);

        // Build a groupsById map keyed by SP group ID for mapMemberToAlter
        const groupsById = {};
        for (const g of groups) {
          const gid = g.id || g._id || "";
          if (gid) groupsById[gid] = g;
        }

        // Map members with group info embedded
        const mappedAlters = members.map((m) => mapMemberToAlter(m, groupsById));

        // --- Step 2: Import alters ---
        setImportProgress("Importing alters...");
        const existingAlters = await entities.Alter.list();
        let altersCreated = 0;
        let altersUpdated = 0;

        // Track sp_id -> local id for notes/groups resolution
        const alterIdBySpId = {};

        if (importMode === "replace_all") {
          for (const a of existingAlters) await entities.Alter.delete(a.id);
          for (const a of mappedAlters) {
            const created = await entities.Alter.create(a);
            alterIdBySpId[a.sp_id] = created.id;
            altersCreated++;
          }
        } else {
          // Index existing by sp_id for fast lookup
          const existingBySpId = {};
          for (const a of existingAlters) {
            if (a.sp_id) existingBySpId[a.sp_id] = a;
            alterIdBySpId[a.sp_id] = a.id;
          }

          for (const incoming of mappedAlters) {
            const existing = existingBySpId[incoming.sp_id];
            if (existing) {
              if (importMode !== "new_only") {
                await entities.Alter.update(existing.id, incoming);
                alterIdBySpId[incoming.sp_id] = existing.id;
                altersUpdated++;
              } else {
                alterIdBySpId[incoming.sp_id] = existing.id;
              }
            } else {
              const created = await entities.Alter.create(incoming);
              alterIdBySpId[incoming.sp_id] = created.id;
              altersCreated++;
            }
          }
        }

        // --- Step 3: Import groups ---
        setImportProgress("Importing groups...");
        const existingGroups = await entities.Group.list();
        let groupsCreated = 0;
        let groupsUpdated = 0;

        const existingGroupsBySpId = {};
        for (const g of existingGroups) {
          if (g.sp_id) existingGroupsBySpId[g.sp_id] = g;
        }

        for (const spGroup of groups) {
          const mapped = mapGroupToLocalGroup(spGroup);

          // Resolve SP member IDs -> local alter IDs
          mapped.alter_ids = mapped.sp_member_ids
            .map((spId) => alterIdBySpId[spId])
            .filter(Boolean);

          const existing = existingGroupsBySpId[mapped.sp_id];

          if (importMode === "replace_all" || !existing) {
            if (importMode === "replace_all" && existing) {
              await entities.Group.update(existing.id, mapped);
              groupsUpdated++;
            } else {
              await entities.Group.create(mapped);
              groupsCreated++;
            }
          } else if (importMode !== "new_only") {
            await entities.Group.update(existing.id, mapped);
            groupsUpdated++;
          }
        }

        // --- Step 4: Import notes ---
        setImportProgress("Importing notes...");
        const existingNotes = await entities.AlterNote.list();
        let notesCreated = 0;
        let notesUpdated = 0;

        const existingNotesBySpId = {};
        for (const n of existingNotes) {
          if (n.sp_id) existingNotesBySpId[n.sp_id] = n;
        }

        for (const spNote of notes) {
          const mapped = mapNoteToAlterNote(spNote, alterIdBySpId);

          // Skip notes that couldn't be linked to a local alter
          if (!mapped.alter_id) continue;

          const existing = existingNotesBySpId[mapped.sp_id];

          if (importMode === "replace_all" || !existing) {
            if (importMode === "replace_all" && existing) {
              await entities.AlterNote.update(existing.id, mapped);
              notesUpdated++;
            } else {
              await entities.AlterNote.create(mapped);
              notesCreated++;
            }
          } else if (importMode !== "new_only") {
            await entities.AlterNote.update(existing.id, mapped);
            notesUpdated++;
          }
        }

        // --- Step 5: Update last_sync ---
        if (effectiveSettings?.id) {
          await entities.SystemSettings.update(effectiveSettings.id, {
            last_sync: new Date().toISOString(),
          });
        }

        onSettingsChange();
        queryClient.invalidateQueries({ queryKey: ["alters"] });
        queryClient.invalidateQueries({ queryKey: ["groups"] });
        queryClient.invalidateQueries({ queryKey: ["alterNotes"] });

        setImportProgress("");
        toast.success(
          `Import complete! Alters: ${altersCreated} new, ${altersUpdated} updated · Groups: ${groupsCreated} new, ${groupsUpdated} updated · Notes: ${notesCreated} new, ${notesUpdated} updated`
        );
      } else {
        // Cloud mode — use base44 serverless function
        const res = await base44.functions.invoke("importFromSimplyPlural", {
          sp_token: effectiveSettings.sp_token,
          sp_system_id: effectiveSettings.sp_system_id,
          mode: importMode,
        });
        await base44.entities.SystemSettings.update(effectiveSettings.id, {
          last_sync: new Date().toISOString(),
        });
        onSettingsChange();
        queryClient.invalidateQueries({ queryKey: ["alters"] });
        queryClient.invalidateQueries({ queryKey: ["groups"] });
        toast.success(
          `Imported: ${res.alters.created} new, ${res.alters.updated} updated alters`
        );
      }
    } catch (e) {
      setImportProgress("");
      toast.error(e.message || "Import failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      if (effectiveSettings?.id) {
        await base44.entities.SystemSettings.update(effectiveSettings.id, {
          sp_token: "",
          sp_system_id: "",
        });
      }
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
              {localMode && (
                <p className="text-xs text-muted-foreground mb-3">
                  Imports alters, groups, and notes directly from Simply Plural.
                </p>
              )}
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
                {importProgress && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {importProgress}
                  </div>
                )}
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

            {/* Disconnect */}
            <div className="border-t pt-4">
              <Button
                onClick={handleDisconnect}
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive w-full"
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