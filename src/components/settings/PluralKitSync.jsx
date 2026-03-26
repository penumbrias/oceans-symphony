import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, Upload, Loader2, CheckCircle2, AlertCircle, Copy } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isLocalMode } from "@/lib/storageMode";
import { getFullDbDump, loadDbDump } from "@/lib/localDb";

const ENTITY_NAMES = [
  "Alter", "Group", "FrontingSession", "JournalEntry", "DiaryCard",
  "Activity", "SystemSettings", "CustomField", "AlterNote",
];

// Convert Symphony alters to PluralKit format
function toPluralKitMember(alter, systemFields = []) {
  const pkMember = {
    id: alter.sp_id || alter.id.slice(0, 5),
    name: alter.name || "",
    displayname: alter.name || "",
    pronouns: alter.pronouns || "",
    description: alter.description || "",
    color: alter.color ? alter.color.replace("#", "") : "",
    avatar_url: alter.avatar_url || null,
    banner: null,
    created: alter.created_date || new Date().toISOString(),
  };

  // Add proxy tag if alias exists (format: text-[alias})
  if (alter.alias) {
    pkMember.proxy_tags = [
      {
        prefix: "",
        suffix: "-[" + alter.alias + "}",
      },
    ];
  }

  // Add custom fields to description
  const customFieldTexts = [];
  if (alter.custom_fields) {
    for (const fieldId in alter.custom_fields) {
      const field = systemFields.find(f => f.id === fieldId);
      if (field) {
        const value = alter.custom_fields[fieldId];
        customFieldTexts.push(`${field.name}: ${value}`);
      }
    }
  }
  if (alter.alter_custom_fields && Array.isArray(alter.alter_custom_fields)) {
    for (const field of alter.alter_custom_fields) {
      customFieldTexts.push(`${field.name}: ${field.value}`);
    }
  }
  if (customFieldTexts.length > 0) {
    pkMember.description = pkMember.description
      ? `${pkMember.description}\n\n${customFieldTexts.join("\n")}`
      : customFieldTexts.join("\n");
  }

  return pkMember;
}

// Convert PluralKit member to Symphony alter
function fromPluralKitMember(pkMember) {
  return {
    name: pkMember.name || pkMember.displayname || "Unknown",
    pronouns: pkMember.pronouns || "",
    description: pkMember.description || "",
    color: pkMember.color ? `#${pkMember.color}` : "",
    avatar_url: pkMember.avatar_url || "",
    sp_id: pkMember.id || "",
  };
}

export default function PluralKitSync() {
  const fileInputRef = useRef(null);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState(null); // { type, message }
  const [tokenSaved, setTokenSaved] = useState(false);
  const [syncMode, setSyncMode] = useState("new-only"); // 'new-only', 'update-existing', 'replace-all'

  const showStatus = (type, message) => {
    setStatus({ type, message });
    setTimeout(() => setStatus(null), 5000);
  };

  const handleTokenSave = async () => {
    if (!token.trim()) {
      showStatus("error", "Token cannot be empty.");
      return;
    }
    setSyncing(true);
    try {
      if (isLocalMode()) {
        const dump = getFullDbDump();
        const settings = Object.values(dump["SystemSettings"] || {})[0] || {};
        await base44.entities.SystemSettings.update(settings.id || "1", { pk_token: token });
      } else {
        const settingsList = await base44.entities.SystemSettings.list();
        const settings = settingsList[0];
        if (settings) {
          await base44.entities.SystemSettings.update(settings.id, { pk_token: token });
        }
      }
      setTokenSaved(true);
      showStatus("success", "PluralKit token saved!");
    } catch (e) {
      showStatus("error", `Failed to save token: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleExportToPluralKit = async () => {
   if (!token.trim()) {
     showStatus("error", "Please save your PluralKit token first.");
     return;
   }
   setSyncing(true);
   try {
     let alters, systemFields;
     if (isLocalMode()) {
       const dump = getFullDbDump();
       alters = Object.values(dump["Alter"] || {});
       systemFields = Object.values(dump["CustomField"] || {});
     } else {
       alters = await base44.entities.Alter.list();
       systemFields = await base44.entities.CustomField.list();
     }

     const members = alters
       .filter(a => !a.is_archived)
       .map(alter => toPluralKitMember(alter, systemFields));

     if (members.length === 0) {
       showStatus("error", "No alters to export.");
       setSyncing(false);
       return;
     }

     // Fetch existing members from PluralKit
     let existingMembers = [];
     if (syncMode !== "replace-all") {
       try {
         const existingResponse = await fetch("https://api.pluralkit.me/v2/members", {
           headers: { "Authorization": token },
         });
         if (existingResponse.ok) {
           existingMembers = await existingResponse.json();
         }
       } catch {}
     }

     // Process each member based on sync mode
     let successCount = 0;
     for (const member of members) {
       try {
         const existing = existingMembers.find(m => m.id === member.id);

         if (syncMode === "replace-all" || !existing) {
           // Create new
           const response = await fetch("https://api.pluralkit.me/v2/members", {
             method: "POST",
             headers: {
               "Content-Type": "application/json",
               "Authorization": token,
             },
             body: JSON.stringify(member),
           });
           if (response.ok) successCount++;
         } else if (syncMode === "update-existing" && existing) {
           // Update existing
           const response = await fetch(`https://api.pluralkit.me/v2/members/${member.id}`, {
             method: "PATCH",
             headers: {
               "Content-Type": "application/json",
               "Authorization": token,
             },
             body: JSON.stringify(member),
           });
           if (response.ok) successCount++;
         } else if (syncMode === "new-only" && !existing) {
           // Only sync new
           const response = await fetch("https://api.pluralkit.me/v2/members", {
             method: "POST",
             headers: {
               "Content-Type": "application/json",
               "Authorization": token,
             },
             body: JSON.stringify(member),
           });
           if (response.ok) successCount++;
         }
       } catch {}
     }

     const modeLabel = syncMode === "replace-all" ? "replaced" : syncMode === "update-existing" ? "synced" : "synced (new only)";
     showStatus("success", `${modeLabel} ${successCount} members with PluralKit!`);
   } catch (e) {
     showStatus("error", `Export failed: ${e.message}`);
   } finally {
     setSyncing(false);
   }
  };

  const handleImportFromPluralKit = async () => {
    if (!token.trim()) {
      showStatus("error", "Please save your PluralKit token first.");
      return;
    }
    setSyncing(true);
    try {
      // Fetch members from PluralKit
      const response = await fetch("https://api.pluralkit.me/v2/members", {
        headers: { "Authorization": token },
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`PluralKit API error: ${response.status} - ${err}`);
      }

      const pkMembers = await response.json();
      let count = 0;

      for (const pkMember of pkMembers) {
        const alterData = fromPluralKitMember(pkMember);
        try {
          await base44.entities.Alter.create(alterData);
          count++;
        } catch {}
      }

      showStatus("success", `Imported ${count} members from PluralKit!`);
    } catch (e) {
      showStatus("error", `Import failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };



  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Send className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <CardTitle className="text-lg">PluralKit Sync</CardTitle>
            <CardDescription>Sync with your PluralKit system using API token</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {status && (
          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
              status.type === "success"
                ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                : "bg-destructive/5 text-destructive"
            }`}
          >
            {status.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            {status.message}
          </div>
        )}

        <div className="space-y-2">
          <Label>PluralKit API Token</Label>
          <div className="relative">
            <Input
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="pk_..."
              className="pr-10"
            />
            <button
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? "✕" : "○"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Get your token at{" "}
            <a href="https://pluralkit.me/account" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              pluralkit.me/account
            </a>
          </p>
          <Button
            variant="outline"
            onClick={handleTokenSave}
            disabled={syncing || !token.trim()}
            className="w-full gap-2"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            Save Token
          </Button>
        </div>

        {tokenSaved && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Sync Mode</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="syncMode"
                    value="new-only"
                    checked={syncMode === "new-only"}
                    onChange={(e) => setSyncMode(e.target.value)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-foreground">Add New Only (skip existing)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="syncMode"
                    value="update-existing"
                    checked={syncMode === "update-existing"}
                    onChange={(e) => setSyncMode(e.target.value)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-foreground">Create & Update (new + existing)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="syncMode"
                    value="replace-all"
                    checked={syncMode === "replace-all"}
                    onChange={(e) => setSyncMode(e.target.value)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-foreground">Replace All (overwrite PluralKit)</span>
                </label>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleExportToPluralKit}
              disabled={syncing}
              className="w-full gap-2 justify-start"
            >
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <div className="text-left">
                <p className="font-medium text-sm">Sync to PluralKit</p>
                <p className="text-xs text-muted-foreground">Push Symphony alters to your PluralKit system</p>
              </div>
            </Button>
           <Button
             variant="outline"
             onClick={handleImportFromPluralKit}
             disabled={syncing}
             className="w-full gap-2 justify-start"
           >
             {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
             <div className="text-left">
               <p className="font-medium text-sm">Import from PluralKit</p>
               <p className="text-xs text-muted-foreground">Pull members from your PluralKit system</p>
             </div>
           </Button>
         </div>
        )}
      </CardContent>
    </Card>
  );
}