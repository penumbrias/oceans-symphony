import React, { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Loader2, CheckCircle2, FileJson, ArrowDownLeft, Clock, FileText,
  Users, Layers, ImageOff, Link2, Upload, UserCircle, MessageSquare,
} from "lucide-react";
import { localEntities } from "@/api/base44Client";
import {
  parseSimplyPluralFile,
  spFileFieldId,
  spFieldType,
  normalizeColor,
  mapMemberToAlter,
  mapGroupToLocalGroup,
  mapFrontHistoryEntry,
  mapSPChatCategory,
  mapSPChatChannel,
  mapSPChatMessage,
} from "@/lib/simplyPlural";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";

// ── Simply Plural FILE importer ───────────────────────────────────────────────
//
// Imports a Simply Plural *export file* (.json). The SP API connector
// (SimplyPluralConnect) can't return chat — SP chat is end-to-end-encrypted, so
// the API never serves plaintext messages. The export file, by contrast, has
// EVERYTHING in plaintext, including chat, so this is the way to bring a user's
// full SP data (especially their chat history) into Oceans Symphony.
//
// Reuses the pure mappers in src/lib/simplyPlural.js verbatim (mapMemberToAlter,
// mapGroupToLocalGroup, mapFrontHistoryEntry, spFieldType, normalizeColor) —
// they already read flat docs, which is exactly what the export file contains.
// Mirrors OpenPluralConnect's create/dedup/merge-safe loop and SimplyPlural
// Connect's date-range presets + toggle UI.

// Front-history range presets (mirror SimplyPluralConnect / OpenPluralConnect).
// SP exports carry hundreds-to-thousands of history entries, so default to 1
// year rather than All.
const RANGE_PRESETS = [
  { id: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "3mo", label: "Last 3 months", ms: 90 * 24 * 60 * 60 * 1000 },
  { id: "1yr", label: "Last year", ms: 365 * 24 * 60 * 60 * 1000 },
  { id: "all", label: "All time", ms: null },
];

// Build a merge-safe system-identity patch from SP's users[0] record. Fills only
// EMPTY fields on the existing SystemSettings singleton; never clobbers a name /
// bio / avatar / colour the user has already set. SP avatars are remote URLs
// (often a Discord CDN URL) — stored directly, same as the SP API connector.
function buildSpSystemPatch(spUser, existing = {}) {
  if (!spUser || typeof spUser !== "object") return {};
  const patch = {};
  const isEmpty = (v) => v == null || String(v).trim() === "";

  const name = (spUser.username || spUser.name || "").toString().trim();
  if (name && isEmpty(existing.system_name)) patch.system_name = name;

  const bio = (spUser.desc || spUser.description || "").toString().trim();
  if (bio && isEmpty(existing.system_bio) && isEmpty(existing.system_description)) {
    patch.system_bio = bio;
  }

  const color = normalizeColor(spUser.color);
  if (color && isEmpty(existing.system_color)) patch.system_color = color;

  let avatarUrl = "";
  if (spUser.avatarUrl) avatarUrl = spUser.avatarUrl;
  else if (spUser.avatar_url) avatarUrl = spUser.avatar_url;
  else if (spUser.avatarUuid) {
    const owner = spUser.uid || spUser._id || "";
    if (owner) avatarUrl = `https://spaces.apparyllis.com/avatars/${owner}/${spUser.avatarUuid}`;
  }
  if (avatarUrl && isEmpty(existing.system_avatar_url)) patch.system_avatar_url = avatarUrl;

  return patch;
}

export default function SimplyPluralFileImport({ settings, onSettingsChange, presetFile = null }) {
  const queryClient = useQueryClient();
  const t = useTerms();
  const fileInputRef = useRef(null);

  // Parsed-file state
  const [parsing, setParsing] = useState(false);
  const [data, setData] = useState(null); // parsed SP export object
  const [fileName, setFileName] = useState("");

  // Toggles
  const [includeAlters, setIncludeAlters] = useState(true);
  const [includeGroups, setIncludeGroups] = useState(true);
  const [includeCustomFields, setIncludeCustomFields] = useState(true);
  const [includeAvatars, setIncludeAvatars] = useState(true);
  const [includeFrontHistory, setIncludeFrontHistory] = useState(true);
  const [historyRange, setHistoryRange] = useState("1yr");
  const [includeChat, setIncludeChat] = useState(true);
  const [includeSystemProfile, setIncludeSystemProfile] = useState(true);

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");

  // ── File selection / parse ─────────────────────────────────────────────────
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setData(null);
    setFileName(file.name);
    try {
      const parsed = await parseSimplyPluralFile(file);
      setData(parsed);
    } catch (err) {
      toast.error(err.message || "Couldn't read that file");
      setFileName("");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; // allow re-selecting same file
    }
  };

  useEffect(() => {
    if (presetFile) handleFile({ target: { files: [presetFile] } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetFile]);

  // Counts for the preview card.
  const counts = data ? {
    members: (data.members || []).length,
    groups: (data.groups || []).length,
    customFields: (data.customFields || []).length,
    frontHistory: (data.frontHistory || []).length,
    chatChannels: (data.channels || []).length,
    chatMessages: (data.chatMessages || []).length,
    system: data.users?.[0]?.username || "",
  } : null;

  // ── Import ───────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!data) return;
    setImporting(true);
    setProgress("");
    try {
      const members = data.members || [];
      const groups = data.groups || [];
      // SP `uid` (the system id) is needed to reconstruct avatarUuid URLs.
      const systemId = data.users?.[0]?.uid || data.users?.[0]?._id || members[0]?.uid || "";

      // alter id keyed by SP member id — built up as alters are created /
      // matched, then reused by front history + chat author resolution.
      const alterIdBySpId = {};

      // ── Step 1: Custom fields (dedup by sp_id, then by name) ──
      // member.info is keyed by customFields[]._id; the local CustomField id map
      // must therefore be keyed by that _id too.
      const fieldIdMap = {}; // SP field _id → local CustomField id
      let fieldsCreated = 0;
      {
        const existingFields = await localEntities.CustomField.list();
        const existingBySpId = {};
        const existingByName = {};
        for (const f of existingFields) {
          if (f.sp_id) existingBySpId[f.sp_id] = f;
          if (f.name) existingByName[f.name.toLowerCase().trim()] = f;
        }
        if (includeCustomFields) {
          setProgress("Importing custom fields…");
          let order = existingFields.length;
          for (const spField of data.customFields || []) {
            const spId = spFileFieldId(spField);
            if (!spId) continue;
            const existing = existingBySpId[spId] || existingByName[(spField.name || "").toLowerCase().trim()];
            const fieldData = {
              sp_id: spId,
              name: spField.name || "Unnamed Field",
              field_type: spFieldType(spField.valueType || spField.type),
            };
            if (existing) {
              fieldIdMap[spId] = existing.id;
              // Backfill sp_id on a name-matched field so future imports are exact.
              if (!existing.sp_id) await localEntities.CustomField.update(existing.id, { sp_id: spId });
            } else {
              const created = await localEntities.CustomField.create({ ...fieldData, order: order++ });
              fieldIdMap[spId] = created.id;
              fieldsCreated++;
            }
          }
        } else {
          // Still build the map so alter custom_field refs resolve to existing fields.
          for (const f of existingFields) { if (f.sp_id) fieldIdMap[f.sp_id] = f.id; }
        }
      }

      // groupsById drives mapMemberToAlter's per-member group derivation.
      const groupsById = {};
      for (const g of groups) {
        const gid = g._id || g.id || "";
        if (gid) groupsById[gid] = g;
      }
      const effectiveGroupsById = includeGroups ? groupsById : {};

      // ── Step 2: Alters ──
      let altersCreated = 0, altersUpdated = 0;
      const alterFailures = [];
      if (includeAlters) {
        const existingAlters = await localEntities.Alter.list();
        const existingBySpId = {};
        const existingByName = {};
        for (const a of existingAlters) {
          if (a.sp_id) existingBySpId[a.sp_id] = a;
          const key = (a.name || "").toLowerCase().trim();
          if (key && !existingByName[key]) existingByName[key] = a;
        }
        let idx = 0;
        for (const member of members) {
          idx++;
          setProgress(`Importing ${t.alters}… (${idx}/${members.length})`);
          const mapped = mapMemberToAlter(member, effectiveGroupsById, fieldIdMap, systemId);
          const existing = existingBySpId[mapped.sp_id] || existingByName[(mapped.name || "").toLowerCase().trim()];
          try {
            if (existing) {
              // ALLOWLIST — write ONLY the fields SP owns; never touch local
              // organisation (archive flag, pins, friends visibility, …). Merge
              // custom_fields so local-only `_*` profile keys survive;
              // `_header_image` follows includeAvatars. name/pronouns/desc/color
              // overwrite (SP is source of truth); role/birthday FILL-IF-EMPTY;
              // tags UNIONED; groups only refreshed when groups are being imported.
              const localOnly = Object.fromEntries(
                Object.entries(existing.custom_fields || {}).filter(([k]) => k.startsWith("_"))
              );
              const incomingFields = { ...(mapped.custom_fields || {}) };
              if (!includeAvatars) delete incomingFields._header_image;

              const isBlank = (v) => v == null || String(v).trim() === "";
              const existingTags = Array.isArray(existing.tags) ? existing.tags : [];
              const mergedTags = [...existingTags];
              const tagSeen = new Set(existingTags.map((tg) => String(tg).toLowerCase()));
              for (const tg of (mapped.tags || [])) {
                const key = String(tg).toLowerCase();
                if (!tagSeen.has(key)) { tagSeen.add(key); mergedTags.push(tg); }
              }

              const updatePayload = {
                sp_id: mapped.sp_id,
                name: mapped.name,
                pronouns: mapped.pronouns,
                description: mapped.description,
                color: mapped.color,
                custom_fields: { ...localOnly, ...incomingFields },
                tags: mergedTags,
                groups: includeGroups ? mapped.groups : (existing.groups || []),
              };
              if (isBlank(existing.role) && mapped.role) updatePayload.role = mapped.role;
              if (isBlank(existing.birthday) && mapped.birthday) updatePayload.birthday = mapped.birthday;
              if (includeAvatars) {
                updatePayload.avatar_url = mapped.avatar_url;
                updatePayload.banner_url = mapped.banner_url;
              }
              await localEntities.Alter.update(existing.id, updatePayload);
              alterIdBySpId[mapped.sp_id] = existing.id;
              altersUpdated++;
            } else {
              const created = await localEntities.Alter.create(mapped);
              alterIdBySpId[mapped.sp_id] = created.id;
              altersCreated++;
            }
          } catch (err) {
            console.error("[SP file import] Alter write failed", mapped?.name, mapped?.sp_id, err);
            alterFailures.push({ name: mapped?.name || "(unnamed)", reason: err?.message || String(err) });
          }
        }
      } else {
        // Alters skipped — still build alterIdBySpId so fronts/chat resolve.
        const existingAlters = await localEntities.Alter.list();
        for (const a of existingAlters) { if (a.sp_id) alterIdBySpId[a.sp_id] = a.id; }
      }

      // ── Step 3: Groups + nesting (SP `parent` is "root" or a group id) ──
      let groupsCreated = 0, groupsUpdated = 0;
      if (includeGroups) {
        setProgress("Importing groups…");
        const existingGroups = await localEntities.Group.list();
        const existingBySpId = {};
        for (const g of existingGroups) { if (g.sp_id) existingBySpId[g.sp_id] = g; }
        const groupIdBySpId = {};
        for (const spGroup of groups) {
          const mapped = mapGroupToLocalGroup(spGroup);
          if (!mapped.sp_id) continue;
          mapped.parent = "";
          const existing = existingBySpId[mapped.sp_id];
          if (existing) {
            // Preserve LOCAL membership + nesting on re-sync (mirror the SP API
            // connector): refresh display metadata only; keep member_sp_ids +
            // parent local so manual organisation isn't wiped each import.
            await localEntities.Group.update(existing.id, {
              ...mapped,
              parent: existing.parent,
              member_sp_ids: existing.member_sp_ids || [],
            });
            groupIdBySpId[mapped.sp_id] = existing.id;
            groupsUpdated++;
          } else {
            const created = await localEntities.Group.create(mapped);
            groupIdBySpId[mapped.sp_id] = created.id;
            groupsCreated++;
          }
        }
        // Second pass: resolve parent ("root"/"" → no parent, else local id).
        setProgress("Resolving group nesting…");
        for (const spGroup of groups) {
          const spId = spGroup._id || spGroup.id || "";
          const localId = groupIdBySpId[spId];
          if (!localId) continue;
          const spParent = spGroup.parent || "";
          const localParent = (spParent && spParent !== "root") ? (groupIdBySpId[spParent] || "") : "";
          await localEntities.Group.update(localId, { parent: localParent });
        }
      }

      // ── Step 4: Front history (optional) ──
      let frontsCreated = 0, frontsSkipped = 0, frontsNoAlter = 0;
      if (includeFrontHistory) {
        setProgress("Importing front history…");
        const preset = RANGE_PRESETS.find((p) => p.id === historyRange);
        const cutoffMs = preset?.ms ? Date.now() - preset.ms : null;

        const existingSessions = await localEntities.FrontingSession.list();
        const existingSpFrontIds = new Set(
          existingSessions.filter((s) => s.sp_front_id).map((s) => s.sp_front_id)
        );
        const toCreate = [];
        for (const entry of data.frontHistory || []) {
          const startedMs = entry.startTime ? Number(entry.startTime) : null;
          if (cutoffMs && startedMs && startedMs < cutoffMs) continue;
          const spFrontId = entry._id || entry.id || "";
          if (spFrontId && existingSpFrontIds.has(spFrontId)) { frontsSkipped++; continue; }
          const session = mapFrontHistoryEntry(entry, alterIdBySpId);
          if (!session) { frontsNoAlter++; continue; } // no matching local alter (e.g. custom-front history)
          existingSpFrontIds.add(spFrontId);
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

      // ── Step 5: Chat — the point of the file importer (optional) ──
      // channels → SystemChatChannel, channelCategories → SystemChatCategory
      // (with channels[] → channel.category_id), chatMessages → SystemChatMessage
      // (author ← alterIdBySpId[writer], null ok). Dedup by sp_chat_id.
      let chatCategoriesCreated = 0, chatChannelsCreated = 0, chatMessagesCreated = 0;
      if (includeChat) {
        setProgress("Importing chat…");

        // 5a: Categories (dedup by sp_chat_id). SP has no category nesting.
        const categoryIdBySpId = {}; // SP category id → local SystemChatCategory id
        {
          const existingCats = await localEntities.SystemChatCategory.list();
          const existingBySpId = {};
          for (const c of existingCats) { if (c.sp_chat_id) existingBySpId[c.sp_chat_id] = c; }
          let order = 0;
          for (const spCat of data.channelCategories || []) {
            const mapped = mapSPChatCategory(spCat, order++);
            if (!mapped.sp_chat_id) continue;
            const existing = existingBySpId[mapped.sp_chat_id];
            if (existing) {
              await localEntities.SystemChatCategory.update(existing.id, {
                sp_chat_id: mapped.sp_chat_id,
                name: mapped.name,
                color: mapped.color,
                sort_order: mapped.sort_order,
              });
              categoryIdBySpId[mapped.sp_chat_id] = existing.id;
            } else {
              const created = await localEntities.SystemChatCategory.create({
                sp_chat_id: mapped.sp_chat_id,
                name: mapped.name,
                color: mapped.color,
                sort_order: mapped.sort_order,
                parent_category_id: null,
                collapsed: false,
                created_date: new Date().toISOString(),
              });
              categoryIdBySpId[mapped.sp_chat_id] = created.id;
              chatCategoriesCreated++;
            }
          }
        }

        // Build SP channel id → SP category id from channelCategories[].channels.
        const spCategoryByChannel = {};
        for (const spCat of data.channelCategories || []) {
          const catSpId = spCat._id || spCat.id || "";
          for (const chId of (spCat.channels || [])) spCategoryByChannel[chId] = catSpId;
        }

        // 5b: Channels (dedup by sp_chat_id), resolving category_id.
        const channelIdBySpId = {}; // SP channel id → local SystemChatChannel id
        {
          const existingChannels = await localEntities.SystemChatChannel.list();
          const existingBySpId = {};
          for (const c of existingChannels) { if (c.sp_chat_id) existingBySpId[c.sp_chat_id] = c; }
          let order = 0;
          for (const spChannel of data.channels || []) {
            const mapped = mapSPChatChannel(spChannel, order++);
            if (!mapped.sp_chat_id) continue;
            const spCatId = spCategoryByChannel[mapped.sp_chat_id] || "";
            const localCategoryId = spCatId ? (categoryIdBySpId[spCatId] || null) : null;
            const payload = {
              sp_chat_id: mapped.sp_chat_id,
              name: mapped.name,
              description: mapped.description,
              color: mapped.color,
              sort_order: mapped.sort_order,
              is_archived: mapped.is_archived,
              is_private: mapped.is_private,
              category_id: localCategoryId,
              member_alter_ids: [],
            };
            const existing = existingBySpId[mapped.sp_chat_id];
            if (existing) {
              await localEntities.SystemChatChannel.update(existing.id, payload);
              channelIdBySpId[mapped.sp_chat_id] = existing.id;
            } else {
              const created = await localEntities.SystemChatChannel.create({
                ...payload,
                created_date: new Date().toISOString(),
              });
              channelIdBySpId[mapped.sp_chat_id] = created.id;
              chatChannelsCreated++;
            }
          }
        }

        // 5c: Messages (dedup by sp_chat_id). SP chat has no replies → no second
        // pass needed. Null author (writer not matched / system) is allowed.
        {
          const existingMsgs = await localEntities.SystemChatMessage.list();
          const existingSpIds = new Set(existingMsgs.filter((m) => m.sp_chat_id).map((m) => m.sp_chat_id));
          const toCreate = [];
          for (const spMsg of data.chatMessages || []) {
            const spId = spMsg._id || spMsg.id || "";
            if (spId && existingSpIds.has(spId)) continue;
            const mapped = mapSPChatMessage(spMsg, channelIdBySpId, alterIdBySpId);
            if (!mapped) continue; // channel didn't import
            existingSpIds.add(spId);
            toCreate.push(mapped);
          }
          for (const m of toCreate) {
            await localEntities.SystemChatMessage.create(m);
            chatMessagesCreated++;
          }
        }
      }

      // ── Step 6: System profile (optional, MERGE-SAFE) ──
      let systemProfileUpdated = false;
      if (includeSystemProfile && data.users?.[0]) {
        setProgress("Importing system profile…");
        try {
          const settingsList = await localEntities.SystemSettings.list();
          const existingSettings = settingsList[0] || null;
          const patch = buildSpSystemPatch(data.users[0], existingSettings || {});
          if (Object.keys(patch).length > 0) {
            if (existingSettings?.id) {
              await localEntities.SystemSettings.update(existingSettings.id, patch);
            } else {
              await localEntities.SystemSettings.create(patch);
            }
            systemProfileUpdated = true;
          }
        } catch (err) {
          console.warn("[SP file import] system profile import failed", err);
        }
      }

      // ── Finish ──
      onSettingsChange?.();
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["customFields"] });
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      queryClient.invalidateQueries({ queryKey: ["systemChatChannels"] });
      queryClient.invalidateQueries({ queryKey: ["systemChatCategories"] });
      queryClient.invalidateQueries({ queryKey: ["systemChatMessages"] });
      setProgress("");

      const parts = [
        includeAlters && `${t.Alters}: ${altersCreated} new, ${altersUpdated} updated${alterFailures.length ? `, ${alterFailures.length} failed` : ""}`,
        includeGroups && `Groups: ${groupsCreated} new, ${groupsUpdated} updated`,
        includeCustomFields && fieldsCreated > 0 && `Fields: ${fieldsCreated} new`,
        includeFrontHistory && `${t.Fronting}: ${frontsCreated} new${frontsSkipped ? `, ${frontsSkipped} existed` : ""}`,
        includeChat && (chatChannelsCreated > 0 || chatMessagesCreated > 0) && `Chat: ${chatChannelsCreated} channel${chatChannelsCreated === 1 ? "" : "s"}, ${chatMessagesCreated} message${chatMessagesCreated === 1 ? "" : "s"}`,
        includeSystemProfile && systemProfileUpdated && `${t.System} profile updated`,
      ].filter(Boolean).join(" · ");

      if (alterFailures.length > 0) {
        console.warn("[SP file import] Some alters failed to import:", alterFailures);
        const sample = alterFailures.slice(0, 3).map((f) => f.name).join(", ");
        toast.error(
          `Import partial — ${alterFailures.length} ${alterFailures.length === 1 ? t.alter : t.alters} failed (${sample}${alterFailures.length > 3 ? ", …" : ""}). See devtools console.`,
          { duration: 12000 },
        );
      }
      toast.success(`Import complete! ${parts}`);
    } catch (e) {
      setProgress("");
      console.error("[SP file import] failed", e);
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileJson className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Simply Plural (export file)</CardTitle>
            <CardDescription>
              Import {t.alters}, front history, and chat from a Simply Plural export file — the only way to bring your chat across (the API can't return it).
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {/* File picker */}
          {!presetFile && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Export file</Label>
              <p className="text-xs text-muted-foreground">
                In Simply Plural: <span className="font-medium">Settings → Export your data → JSON</span>. Choose the downloaded <code className="font-mono bg-muted px-1 rounded">.json</code> file here.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFile}
                className="hidden"
                id="sp-file-input"
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

          {/* Preview */}
          {counts && (
            <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="font-medium">{counts.system || "Simply Plural export"}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Found {counts.members} {counts.members === 1 ? t.alter : t.alters}, {counts.groups} group{counts.groups === 1 ? "" : "s"}, {counts.customFields} custom field{counts.customFields === 1 ? "" : "s"}, {counts.frontHistory} front history entr{counts.frontHistory === 1 ? "y" : "ies"}{counts.chatMessages > 0 ? `, ${counts.chatMessages} chat message${counts.chatMessages === 1 ? "" : "s"} across ${counts.chatChannels} channel${counts.chatChannels === 1 ? "" : "s"}` : ""}.
              </p>
            </div>
          )}

          {/* Options */}
          {counts && (
            <div className="border-t pt-4 space-y-3">
              <p className="text-xs text-muted-foreground font-medium">Include:</p>
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
                    <span>
                      Avatars &amp; banners
                      <span className="text-muted-foreground/60 text-xs ml-1">(uncheck to keep locally-customised images)</span>
                    </span>
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={includeGroups} onChange={(e) => setIncludeGroups(e.target.checked)} className="rounded" />
                  <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                  Groups
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
                    <Label htmlFor="sp-file-history-range" className="text-xs">Range:</Label>
                    <select
                      id="sp-file-history-range"
                      value={historyRange}
                      onChange={(e) => setHistoryRange(e.target.value)}
                      className="text-xs border rounded-md px-2 py-1 bg-card"
                    >
                      {RANGE_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={includeChat} onChange={(e) => setIncludeChat(e.target.checked)} className="rounded" />
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                  {t.System} chat <span className="text-muted-foreground/60 text-xs">(channels &amp; messages — API can't do this)</span>
                </label>
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
                className="bg-blue-600 hover:bg-blue-700 w-full"
              >
                {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowDownLeft className="w-4 h-4 mr-2" />}
                {importing ? "Importing…" : "Import Now"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Re-importing the same export updates existing records instead of duplicating them. Nothing is ever deleted.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
