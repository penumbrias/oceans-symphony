import React, { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Loader2, CheckCircle2, FileJson, ArrowDownLeft, Clock, FileText,
  Users, Layers, ImageOff, Link2, Upload, UserCircle, AlertTriangle, Trash2, BarChart3,
} from "lucide-react";
import { localEntities } from "@/api/base44Client";
import {
  parseOctoconFile,
  looksLikeOctocon,
  buildMemberGroupsFromTags,
  buildMemberCustomFields,
  collectOrphanFieldDefs,
  buildSystemIdentityPatch,
  octoFieldType,
  mapAlterToLocal,
  mapTagToGroup,
  mapFrontToSession,
  mapPollToLocal,
  buildAlterNameByOctoId,
} from "@/lib/octocon";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { runAutoBackupNow } from "@/lib/autoBackup";

// Front-history range presets — mirror OpenPluralConnect. Real exports carry
// hundreds of sessions, so default to a year rather than all-time.
const RANGE_PRESETS = [
  { id: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "3mo", label: "Last 3 months", ms: 90 * 24 * 60 * 60 * 1000 },
  { id: "1yr", label: "Last year", ms: 365 * 24 * 60 * 60 * 1000 },
  { id: "all", label: "All time", ms: null },
];

// Bulk delete one local entity — used ONLY by "Replace everything", and ONLY
// after a full backup. No bulk API, so list-then-delete per id.
async function deleteAllOf(entityName) {
  const rows = await localEntities[entityName].list();
  let n = 0;
  for (const r of rows) {
    if (r?.id) { await localEntities[entityName].delete(r.id); n++; }
  }
  return n;
}

export default function OctoconConnect({ settings, onSettingsChange, presetFile = null }) {
  const queryClient = useQueryClient();
  const t = useTerms();
  const fileInputRef = useRef(null);

  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null); // { data }
  const [fileName, setFileName] = useState("");

  const [includeAlters, setIncludeAlters] = useState(true);
  const [includeAvatars, setIncludeAvatars] = useState(true);
  const [includeGroups, setIncludeGroups] = useState(true);
  const [includeCustomFields, setIncludeCustomFields] = useState(true);
  const [includeFrontHistory, setIncludeFrontHistory] = useState(true);
  const [historyRange, setHistoryRange] = useState("1yr");
  const [includePolls, setIncludePolls] = useState(true);
  const [includeSystemProfile, setIncludeSystemProfile] = useState(true);

  // add — fill-if-empty merge (tags... n/a here). replace — file wins on
  // matched records. wipe — delete ticked categories first (backup taken).
  // None of these ever delete a local record that isn't in the file.
  const [importMode, setImportMode] = useState("add");

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParsed(null);
    setFileName(file.name);
    try {
      const result = await parseOctoconFile(file);
      if (!looksLikeOctocon(result?.data)) {
        throw new Error("This file doesn't look like an Octocon export.");
      }
      setParsed(result);
    } catch (err) {
      toast.error(err.message || "Couldn't read that file");
      setFileName("");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (presetFile) handleFile({ target: { files: [presetFile] } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetFile]);

  const data = parsed?.data;
  const counts = data ? {
    alters: (data.alters || []).length,
    groups: (data.tags || []).length,
    customFields: (data.user?.fields || []).length + collectOrphanFieldDefs(data).length,
    fronts: (data.fronts || []).length,
    polls: (data.polls || []).length,
    system: data.user?.username || data.user?.id || "",
  } : null;

  const handleImport = async () => {
    if (!parsed?.data) return;

    if (importMode === "wipe") {
      const cats = [
        includeAlters && t.alters,
        includeGroups && "groups",
        includeCustomFields && "custom fields",
        includeFrontHistory && `${t.fronting} history`,
        includePolls && "polls",
      ].filter(Boolean);
      if (cats.length === 0) { toast.error("Tick at least one category to replace."); return; }
      const ok = typeof window !== "undefined" && window.confirm(
        `REPLACE EVERYTHING\n\n` +
        `This permanently DELETES all of your existing ${cats.join(", ")} and replaces them with this file.\n\n` +
        `A full backup of ALL your data is saved to your device first. Your ${t.system} settings, terminology and themes are kept.\n\n` +
        `Proceed?`
      );
      if (!ok) return;
    }

    setImporting(true);
    setProgress("");
    try {
      if (importMode === "wipe") {
        setProgress("Saving a safety backup to your device first…");
        try {
          const backupResult = await runAutoBackupNow();
          if (backupResult === "cancelled") {
            toast.error("Backup was canceled — nothing was deleted.");
            setProgress("");
            return;
          }
        } catch (e) {
          toast.error(`Backup failed — nothing was deleted.${e?.message ? ` (${e.message})` : ""}`);
          setProgress("");
          return;
        }
        setProgress("Clearing the selected existing data…");
        if (includeCustomFields) await deleteAllOf("CustomField");
        if (includeAlters) await deleteAllOf("Alter");
        if (includeGroups) await deleteAllOf("Group");
        if (includeFrontHistory) await deleteAllOf("FrontingSession");
        if (includePolls) await deleteAllOf("Poll");
      }

      const d = parsed.data;
      const alterIdByOctoId = {}; // octocon alter id (string) → local Alter id
      const groupIdByOctoId = {}; // octocon tag id → local Group id

      // ── Step 1: Custom fields (defs live on user.fields) ──
      const fieldIdMap = {}; // octo field def id → local CustomField id
      let fieldsCreated = 0;
      {
        const existingFields = await localEntities.CustomField.list();
        const existingByOctoId = {};
        const existingByName = {};
        for (const f of existingFields) {
          if (f.octo_id) existingByOctoId[f.octo_id] = f;
          if (f.name) existingByName[f.name.toLowerCase().trim()] = f;
        }
        if (includeCustomFields) {
          setProgress("Importing custom fields…");
          let order = existingFields.length;
          // Orphan field values (a value on an alter whose def Octocon dropped
          // from user.fields) get a synthetic def so we never lose the value.
          const allFieldDefs = [...(d.user?.fields || []), ...collectOrphanFieldDefs(d)];
          for (const def of allFieldDefs) {
            const octoId = def.id || "";
            if (!octoId) continue;
            const existing = existingByOctoId[octoId] || existingByName[(def.name || "").toLowerCase().trim()];
            const fieldData = {
              octo_id: octoId,
              name: def.name || "Unnamed Field",
              field_type: octoFieldType(def.type),
            };
            if (existing) {
              fieldIdMap[octoId] = existing.id;
              const patch = {};
              if (!existing.octo_id) patch.octo_id = octoId;
              if (importMode === "replace") { patch.name = fieldData.name; patch.field_type = fieldData.field_type; }
              if (Object.keys(patch).length) await localEntities.CustomField.update(existing.id, patch);
            } else {
              const created = await localEntities.CustomField.create({ ...fieldData, order: order++ });
              fieldIdMap[octoId] = created.id;
              fieldsCreated++;
            }
          }
        } else {
          for (const f of existingFields) { if (f.octo_id) fieldIdMap[f.octo_id] = f.id; }
        }
      }

      // Membership lives on the tags; invert to alterId → groups.
      const memberGroupsById = includeGroups ? buildMemberGroupsFromTags(d.tags || []) : {};

      // ── Step 2: Alters ──
      let altersCreated = 0, altersUpdated = 0, avatarsLinked = 0;
      const alterFailures = [];
      if (includeAlters) {
        const existingAlters = await localEntities.Alter.list();
        const existingByOctoId = {};
        const existingByName = {};
        for (const a of existingAlters) {
          if (a.octo_id) existingByOctoId[a.octo_id] = a;
          const key = (a.name || "").toLowerCase().trim();
          if (key && !existingByName[key]) existingByName[key] = a;
        }
        let idx = 0;
        for (const alter of d.alters || []) {
          idx++;
          setProgress(`Importing ${t.alters}… (${idx}/${(d.alters || []).length})`);
          // Octocon avatars are remote URLs — link them directly (no blobs).
          const avatarUrl = includeAvatars && alter.avatar_url ? alter.avatar_url : "";
          if (avatarUrl) avatarsLinked++;
          const mapped = mapAlterToLocal(alter, {
            memberGroups: memberGroupsById[String(alter.id)] || [],
            customFields: includeCustomFields ? buildMemberCustomFields(alter, fieldIdMap) : {},
            avatarUrl,
          });
          const existing = existingByOctoId[mapped.octo_id] || existingByName[(alter.name || "").toLowerCase().trim()];
          try {
            if (existing) {
              // ALLOWLIST — write only the fields Octocon owns; never touch local
              // organisation (archive flag, pins, friends visibility). Merge
              // custom_fields so local-only `_*` profile keys survive.
              const localOnly = Object.fromEntries(
                Object.entries(existing.custom_fields || {}).filter(([k]) => k.startsWith("_"))
              );
              const updatePayload = {
                octo_id: mapped.octo_id,
                name: mapped.name,
                pronouns: mapped.pronouns,
                description: mapped.description,
                color: mapped.color,
                groups: includeGroups ? mapped.groups : (existing.groups || []),
                custom_fields: { ...localOnly, ...mapped.custom_fields },
              };
              if (includeAvatars && avatarUrl) updatePayload.avatar_url = avatarUrl;
              await localEntities.Alter.update(existing.id, updatePayload);
              alterIdByOctoId[mapped.octo_id] = existing.id;
              altersUpdated++;
            } else {
              const created = await localEntities.Alter.create(mapped);
              alterIdByOctoId[mapped.octo_id] = created.id;
              altersCreated++;
            }
          } catch (err) {
            console.error("[Octocon import] Alter write failed", mapped?.name, alter.id, err);
            alterFailures.push({ name: mapped?.name || "(unnamed)", reason: err?.message || String(err) });
          }
        }
      } else {
        const existingAlters = await localEntities.Alter.list();
        for (const a of existingAlters) { if (a.octo_id) alterIdByOctoId[a.octo_id] = a.id; }
      }

      // ── Step 3: Groups (tags) + nesting + membership ──
      let groupsCreated = 0, groupsUpdated = 0;
      if (includeGroups) {
        setProgress("Importing groups…");
        const existingGroups = await localEntities.Group.list();
        const existingByOctoId = {};
        for (const g of existingGroups) { if (g.octo_id) existingByOctoId[g.octo_id] = g; }
        for (const tag of d.tags || []) {
          const mapped = mapTagToGroup(tag);
          if (!mapped.octo_id) continue;
          const existing = existingByOctoId[mapped.octo_id];
          if (existing) {
            await localEntities.Group.update(existing.id, {
              octo_id: mapped.octo_id,
              name: mapped.name,
              color: mapped.color,
              description: mapped.description,
            });
            groupIdByOctoId[mapped.octo_id] = existing.id;
            groupsUpdated++;
          } else {
            const created = await localEntities.Group.create({
              octo_id: mapped.octo_id,
              name: mapped.name,
              color: mapped.color,
              description: mapped.description,
              parent: "",
            });
            groupIdByOctoId[mapped.octo_id] = created.id;
            groupsCreated++;
          }
        }
        // Second pass: resolve parent_tag_id → local parent id.
        setProgress("Resolving group nesting…");
        for (const tag of d.tags || []) {
          const localId = groupIdByOctoId[tag.id || ""];
          if (!localId) continue;
          const localParent = tag.parent_tag_id ? (groupIdByOctoId[tag.parent_tag_id] || "") : "";
          await localEntities.Group.update(localId, { parent: localParent });
        }
        // Third pass: rewrite each imported alter's groups[].id from the Octocon
        // tag id to the LOCAL Group id (the groups didn't exist when alters were
        // created). Membership only resolves when a.groups[].id === group.id.
        if (includeAlters) {
          setProgress("Linking members to groups…");
          for (const alter of d.alters || []) {
            const localAlterId = alterIdByOctoId[String(alter.id)];
            const octoGroups = memberGroupsById[String(alter.id)] || [];
            if (!localAlterId || octoGroups.length === 0) continue;
            const remapped = octoGroups
              .map((g) => ({ ...g, id: groupIdByOctoId[g.id] || g.id }))
              .filter((g) => g.id);
            await localEntities.Alter.update(localAlterId, { groups: remapped });
          }
        }
      }

      // ── Step 4: Front history ──
      let frontsCreated = 0, frontsSkipped = 0;
      if (includeFrontHistory) {
        setProgress("Importing front history…");
        const preset = RANGE_PRESETS.find((p) => p.id === historyRange);
        const cutoff = preset?.ms ? Date.now() - preset.ms : null;
        const existingSessions = await localEntities.FrontingSession.list();
        const existingOpFrontIds = new Set(
          existingSessions.filter((s) => s.octo_front_id).map((s) => s.octo_front_id)
        );
        const toCreate = [];
        for (const front of d.fronts || []) {
          const startedMs = front.time_start ? new Date(front.time_start).getTime() : null;
          if (cutoff && startedMs && startedMs < cutoff) continue;
          const session = mapFrontToSession(front, alterIdByOctoId);
          if (!session) continue;
          if (session.octo_front_id && existingOpFrontIds.has(session.octo_front_id)) { frontsSkipped++; continue; }
          existingOpFrontIds.add(session.octo_front_id);
          toCreate.push(session);
        }
        if (toCreate.length > 0) {
          setProgress(`Creating ${toCreate.length} fronting sessions…`);
          if (typeof localEntities.FrontingSession.bulkCreate === "function") {
            await localEntities.FrontingSession.bulkCreate(toCreate);
          } else {
            for (const s of toCreate) await localEntities.FrontingSession.create(s);
          }
        }
        frontsCreated = toCreate.length;
      }

      // ── Step 5: Polls (choice + yes/no/veto), dedup by octo_id ──
      let pollsCreated = 0, pollsSkipped = 0;
      if (includePolls && (d.polls || []).length) {
        setProgress("Importing polls…");
        const alterNameByOctoId = buildAlterNameByOctoId(d.alters || []);
        const existingPolls = await localEntities.Poll.list();
        const existingByOctoId = {};
        for (const p of existingPolls) { if (p.octo_id) existingByOctoId[p.octo_id] = p; }
        for (const poll of d.polls || []) {
          const mapped = mapPollToLocal(poll, { alterIdByOctoId, alterNameByOctoId });
          if (!mapped) continue;
          const existing = existingByOctoId[mapped.octo_id];
          if (existing) {
            if (importMode === "replace") {
              await localEntities.Poll.update(existing.id, {
                question: mapped.question,
                options: mapped.options,
                votes: mapped.votes,
                is_closed: mapped.is_closed,
              });
            }
            pollsSkipped++;
          } else {
            await localEntities.Poll.create(mapped);
            pollsCreated++;
          }
        }
      }

      // ── Step 6: System profile (merge-safe) ──
      let systemProfileUpdated = false;
      if (includeSystemProfile && d.user) {
        setProgress("Importing system profile…");
        try {
          const sysAvatarUrl = includeAvatars && d.user.avatar_url ? d.user.avatar_url : "";
          const settingsList = await localEntities.SystemSettings.list();
          const existingSettings = settingsList[0] || null;
          const patch = buildSystemIdentityPatch(d.user, existingSettings || {}, { systemAvatarUrl: sysAvatarUrl });
          if (Object.keys(patch).length > 0) {
            if (existingSettings?.id) {
              await localEntities.SystemSettings.update(existingSettings.id, patch);
            } else {
              await localEntities.SystemSettings.create(patch);
            }
            systemProfileUpdated = true;
          }
        } catch (err) {
          console.warn("[Octocon import] system profile import failed", err);
        }
      }

      // ── Finish ──
      onSettingsChange?.();
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["customFields"] });
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      queryClient.invalidateQueries({ queryKey: ["polls"] });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      setProgress("");

      const parts = [
        includeAlters && `${t.Alters}: ${altersCreated} new, ${altersUpdated} updated${alterFailures.length ? `, ${alterFailures.length} failed` : ""}`,
        includeAvatars && avatarsLinked > 0 && `Avatars linked: ${avatarsLinked}`,
        includeGroups && `Groups: ${groupsCreated} new, ${groupsUpdated} updated`,
        includeCustomFields && fieldsCreated > 0 && `Fields: ${fieldsCreated} new`,
        includeFrontHistory && `${t.Fronting}: ${frontsCreated} new${frontsSkipped ? `, ${frontsSkipped} existed` : ""}`,
        includePolls && (pollsCreated || pollsSkipped) && `Polls: ${pollsCreated} new${pollsSkipped ? `, ${pollsSkipped} existed` : ""}`,
        includeSystemProfile && systemProfileUpdated && `${t.System} profile updated`,
      ].filter(Boolean).join(" · ");

      if (alterFailures.length > 0) {
        const sample = alterFailures.slice(0, 3).map((f) => f.name).join(", ");
        toast.error(
          `Import partial — ${alterFailures.length} ${alterFailures.length === 1 ? t.alter : t.alters} failed (${sample}${alterFailures.length > 3 ? ", …" : ""}). See devtools console.`,
          { duration: 12000 },
        );
      }
      toast.success(`Import complete! ${parts}`);
    } catch (e) {
      setProgress("");
      console.error("[Octocon import] failed", e);
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileJson className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Octocon</CardTitle>
            <CardDescription>
              Import {t.alters}, groups, custom fields, front history and polls from an Octocon export (.json).
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {!presetFile && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Export file</Label>
              <p className="text-xs text-muted-foreground">
                In Octocon, export your data, then choose the <code className="font-mono bg-muted px-1 rounded">.json</code> file here. Avatars are linked from Octocon (they load while you're online).
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFile}
                className="hidden"
                id="octo-file-input"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing || importing}
                className="w-full"
              >
                {parsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {parsing ? "Reading…" : (fileName ? "Choose a different file" : "Choose export file")}
              </Button>
              {fileName && !parsing && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Link2 className="w-3 h-3" /> {fileName}
                </p>
              )}
            </div>
          )}

          {counts && (
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="font-medium">Octocon export{counts.system ? ` · ${counts.system}` : ""}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Found {counts.alters} {counts.alters === 1 ? t.alter : t.alters}, {counts.groups} group{counts.groups === 1 ? "" : "s"}, {counts.customFields} custom field{counts.customFields === 1 ? "" : "s"}, {counts.fronts} front session{counts.fronts === 1 ? "" : "s"}{counts.polls ? `, ${counts.polls} poll${counts.polls === 1 ? "" : "s"}` : ""}.
              </p>
            </div>
          )}

          {counts && (
            <div className="border-t pt-4 space-y-3">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">How should this import treat your existing data?</p>
                <div className="space-y-1.5">
                  <button type="button" onClick={() => setImportMode("add")}
                    className={`w-full text-xs rounded-lg border px-3 py-2 text-left transition-colors ${importMode === "add" ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-muted/40"}`}>
                    <span className="font-medium block">Add &amp; update</span>
                    <span className="text-[11px] opacity-80">Adds new records, fills blanks, keeps your edits.</span>
                  </button>
                  <button type="button" onClick={() => setImportMode("replace")}
                    className={`w-full text-xs rounded-lg border px-3 py-2 text-left transition-colors ${importMode === "replace" ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-muted/40"}`}>
                    <span className="font-medium block">Replace from file</span>
                    <span className="text-[11px] opacity-80">This file wins on conflicts. Nothing is deleted.</span>
                  </button>
                  <button type="button" onClick={() => setImportMode("wipe")}
                    className={`w-full text-xs rounded-lg border px-3 py-2 text-left transition-colors ${importMode === "wipe" ? "border-destructive bg-destructive/10 text-foreground" : "border-destructive/40 text-muted-foreground hover:bg-destructive/5"}`}>
                    <span className="font-medium flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" /> Replace everything</span>
                    <span className="text-[11px] opacity-80">Deletes the ticked categories, then imports. Backs up first.</span>
                  </button>
                </div>
                <p className={`text-[11px] ${importMode === "wipe" ? "text-destructive" : "text-muted-foreground"}`}>
                  {importMode === "add"
                    ? `Adds new records and fills in empty fields — anything you've already set in OS is kept.`
                    : importMode === "replace"
                    ? `Matching ${t.alters} are overwritten with this file's values. New records are still added, and ${t.alters} not in the file are never deleted.`
                    : `⚠️ Permanently deletes your existing data in the categories ticked below, then imports this file fresh. A full backup is saved to your device first; ${t.system} settings, terminology and themes are always kept.`}
                </p>
              </div>

              <p className="text-xs text-muted-foreground font-medium pt-1">Include:</p>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={includeAlters} onChange={(e) => setIncludeAlters(e.target.checked)} className="rounded" />
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  {t.Alters}
                </label>
                {includeAlters && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none ml-5">
                    <input type="checkbox" checked={includeAvatars} onChange={(e) => setIncludeAvatars(e.target.checked)} className="rounded" />
                    <ImageOff className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Avatars <span className="text-muted-foreground/60 text-xs">(linked from Octocon)</span></span>
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={includeGroups} onChange={(e) => setIncludeGroups(e.target.checked)} className="rounded" />
                  <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                  Groups <span className="text-muted-foreground/60 text-xs">(tags)</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={includeCustomFields} onChange={(e) => setIncludeCustomFields(e.target.checked)} className="rounded" />
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  Custom Fields
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={includeFrontHistory} onChange={(e) => setIncludeFrontHistory(e.target.checked)} className="rounded" />
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  Front history
                </label>
                {includeFrontHistory && (
                  <div className="ml-5 flex items-center gap-2 flex-wrap">
                    <Label htmlFor="octo-history-range" className="text-xs">Range:</Label>
                    <select id="octo-history-range" value={historyRange} onChange={(e) => setHistoryRange(e.target.value)}
                      className="text-xs border rounded-md px-2 py-1 bg-card">
                      {RANGE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                )}
                {counts.polls > 0 && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input type="checkbox" checked={includePolls} onChange={(e) => setIncludePolls(e.target.checked)} className="rounded" />
                    <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
                    Polls <span className="text-muted-foreground/60 text-xs">(votes &amp; comments kept)</span>
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={includeSystemProfile} onChange={(e) => setIncludeSystemProfile(e.target.checked)} className="rounded" />
                  <UserCircle className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{t.System} profile <span className="text-muted-foreground/60 text-xs">(fills empty fields only)</span></span>
                </label>
              </div>

              {progress && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {progress}
                </div>
              )}
              <Button
                onClick={handleImport}
                disabled={importing}
                size="sm"
                className={importMode === "wipe" ? "bg-destructive hover:bg-destructive/90 w-full" : "bg-blue-600 hover:bg-blue-700 w-full"}
              >
                {importing
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : importMode === "wipe" ? <Trash2 className="w-4 h-4 mr-2" /> : <ArrowDownLeft className="w-4 h-4 mr-2" />}
                {importing ? "Importing…" : importMode === "wipe" ? "Back up, then replace everything" : "Import Now"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                {importMode === "wipe"
                  ? `Only "Replace everything" deletes data — and it saves a full backup to your device first.`
                  : `Re-importing the same export updates existing records instead of duplicating them. Nothing is ever deleted.`}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
