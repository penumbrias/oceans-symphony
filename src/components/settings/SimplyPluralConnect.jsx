import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle2, Link2, RefreshCw, Unlink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getSystemId, getSystemUser, getMembers, mapMemberToAlter } from "@/lib/simplyPlural";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function SimplyPluralConnect({ settings, onSettingsChange }) {
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();

  const isConnected = !!settings?.sp_token;

  const syncMembers = async (spToken, systemId) => {
    const members = await getMembers(spToken, systemId);
    if (!members || members.length === 0) {
      throw new Error("No members returned from Simply Plural. Check your token and system ID.");
    }
    const existingAlters = await base44.entities.Alter.list();
    const existingBySpId = {};
    existingAlters.forEach((a) => {
      if (a.sp_id) existingBySpId[a.sp_id] = a;
    });
    for (const member of members) {
      const alterData = mapMemberToAlter(member);
      if (!alterData.sp_id) continue;
      const existing = existingBySpId[alterData.sp_id];
      if (existing) {
        await base44.entities.Alter.update(existing.id, alterData);
      } else {
        await base44.entities.Alter.create(alterData);
      }
    }
    return members.length;
  };

  const handleConnect = async () => {
    if (!token.trim()) return;
    setConnecting(true);
    try {
      const systemId = await getSystemId(token.trim());
      const systemUser = await getSystemUser(token.trim(), systemId);
      const systemName = systemUser?.username || systemUser?.name || "";
      if (settings?.id) {
        await base44.entities.SystemSettings.update(settings.id, {
          sp_token: token.trim(),
          sp_system_id: systemId,
          system_name: systemName,
        });
      } else {
        await base44.entities.SystemSettings.create({
          sp_token: token.trim(),
          sp_system_id: systemId,
          system_name: systemName,
        });
      }
      const count = await syncMembers(token.trim(), systemId);
      setToken("");
      onSettingsChange();
      toast.success(`Connected! Imported ${count} member${count !== 1 ? "s" : ""}.`);
    } catch (e) {
      toast.error(e.message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    if (!settings?.sp_token || !settings?.sp_system_id) return;
    setSyncing(true);
    try {
      const count = await syncMembers(settings.sp_token, settings.sp_system_id);
      await base44.entities.SystemSettings.update(settings.id, {
        last_sync: new Date().toISOString(),
      });
      onSettingsChange();
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      toast.success(`Synced ${count} member${count !== 1 ? "s" : ""} successfully!`);
    } catch (e) {
      toast.error(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!settings?.id) return;
    await base44.entities.SystemSettings.update(settings.id, {
      sp_token: "",
      sp_system_id: "",
    });
    onSettingsChange();
    toast.success("Disconnected from Simply Plural");
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
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm flex-wrap">
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
            <div className="flex gap-2">
              <Button
                onClick={handleSync}
                disabled={syncing}
                size="sm"
                className="bg-primary hover:bg-primary/90"
              >
                {syncing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                {syncing ? "Syncing..." : "Sync Now"}
              </Button>
              <Button
                onClick={handleDisconnect}
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
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