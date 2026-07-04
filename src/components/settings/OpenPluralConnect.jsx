import React, { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Loader2, CheckCircle2, FileArchive, ArrowDownLeft, Clock, FileText,
  Users, Layers, ImageOff, Link2, Upload, UserCircle, MessageSquare, AlertTriangle, Trash2,
} from "lucide-react";
import { localEntities } from "@/api/base44Client";
import {
  parseOpenPluralFile,
  buildMemberGroups,
  buildMemberCustomFields,
  buildMemberTaxonomy,
  buildSystemIdentityPatch,
  resolveAssetUri,
  opFieldType,
  mapMemberToAlter,
  mapGroupToLocalGroup,
  mapFrontAssignment,
  noteKind,
  mapNoteToJournalEntry,
  mapNoteToAlterNote,
  mapRelationshipEdge,
  mapChatCategory,
  mapChatConversation,
  mapChatMessage,
} from "@/lib/openPlural";
import {
  processUploadedImage,
  saveLocalImage,
  createLocalImageUrl,
} from "@/lib/localImageStorage";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { runAutoBackupNow } from "@/lib/autoBackup";

// ── Front-history range presets (mirror SimplyPluralConnect) ──────────────────
// Each period is bounded by its started_at; we filter assignments whose period
// started within the chosen window. Default to 1 year, not All, since real
// exports carry hundreds of periods.
const RANGE_PRESETS = [
  { id: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "3mo", label: "Last 3 months", ms: 90 * 24 * 60 * 60 * 1000 },
  { id: "1yr", label: "Last year", ms: 365 * 24 * 60 * 60 * 1000 },
  { id: "all", label: "All time", ms: null },
];

// Pull a member's avatar (or system avatar) out of the parsed media map and
// store it as a local image. Returns a local-image:// URL, or "" if there's no
// avatar / no media (raw-JSON import) / the bytes can't be processed.
async function storeAssetAsLocalImage(assetId, assetsById, media, localIdPrefix) {
  const uri = resolveAssetUri(assetId, assetsById);
  if (!uri) return "";
  const entry = media.get(uri);
  if (!entry || !entry.bytes) return "";
  try {
    const blob = new Blob([entry.bytes], { type: entry.mime || "image/png" });
    const fileName = uri.split("/").pop() || "avatar.png";
    const file = new File([blob], fileName, { type: entry.mime || "image/png" });
    const { dataUrl } = await processUploadedImage(file);
    const imageId = `op-${localIdPrefix}-${assetId}`;
    await saveLocalImage(imageId, dataUrl);
    return createLocalImageUrl(imageId);
  } catch (e) {
    console.warn("[OpenPlural import] avatar store failed", assetId, e);
    return "";
  }
}

// Delete every row of a local entity — used ONLY by the destructive "Replace
// everything" import mode, and ONLY after a full backup has been saved to the
// device. There's no bulk-delete API, so list-then-delete per id. Returns the
// count removed.
async function deleteAllOf(entityName) {
  const rows = await localEntities[entityName].list();
  let n = 0;
  for (const r of rows) {
    if (r?.id) { await localEntities[entityName].delete(r.id); n++; }
  }
  return n;
}

export default function OpenPluralConnect({ settings, onSettingsChange, presetFile = null }) {
  const queryClient = useQueryClient();
  const t = useTerms();
  const fileInputRef = useRef(null);

  // Parsed-file state
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null); // { data, media }
  const [fileName, setFileName] = useState("");

  // Toggles
  const [includeAlters, setIncludeAlters] = useState(true);
  const [includeGroups, setIncludeGroups] = useState(true);
  const [includeCustomFields, setIncludeCustomFields] = useState(true);
  const [includeAvatars, setIncludeAvatars] = useState(true);
  const [includeFrontHistory, setIncludeFrontHistory] = useState(true);
  const [historyRange, setHistoryRange] = useState("1yr");
  const [includeJournals, setIncludeJournals] = useState(true);
  const [includeRelationships, setIncludeRelationships] = useState(true);
  const [includeSystemProfile, setIncludeSystemProfile] = useState(true);
  const [includeChat, setIncludeChat] = useState(true);

  // Import mode for records that ALREADY exist locally (matched by op_id /
  // name):
  //   "add"     — fill-if-empty merge: adds new records, fills blanks, and
  //               keeps any value you've already set (tags are unioned).
  //   "replace" — this file wins: alias/role/age/birthday/tags on a matched
  //               record are overwritten with the file's values.
  // Neither mode ever DELETES a local record that isn't in the file — OS's
  // promise is to never silently lose data. (Front history / journals / chat
  // are immutable logs and always dedup-skip regardless of mode.)
  const [importMode, setImportMode] = useState("add");

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");

  // ── File selection / parse ─────────────────────────────────────────────────
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParsed(null);
    setFileName(file.name);
    try {
      const result = await parseOpenPluralFile(file);
      if (!result?.data || !Array.isArray(result.data.members)) {
        throw new Error("This file doesn't look like an OpenPlural export.");
      }
      setParsed(result);
    } catch (err) {
      toast.error(err.message || "Couldn't read that file");
      setFileName("");
    } finally {
      setParsing(false);
      // Allow re-selecting the same file
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (presetFile) handleFile({ target: { files: [presetFile] } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetFile]);

  // Counts for the preview card. is_custom_front members are NOT real alters.
  const data = parsed?.data;
  const realMembers = (data?.members || []).filter((m) => !m.is_custom_front);
  const counts = data ? {
    members: realMembers.length,
    customFronts: (data.members || []).length - realMembers.length,
    groups: (data.groups || []).length,
    customFields: (data.custom_fields || []).length,
    fronts: (data.front_periods || []).length,
    notes: (data.notes || []).length,
    relationships: (data.relationships?.edges || []).length,
    chatChannels: (data.chat?.conversations || []).length,
    chatMessages: (data.chat?.messages || []).length,
    system: data.systems?.[0]?.name || "",
  } : null;

  // ── Import ───────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!parsed?.data) return;

    // ── Destructive "Replace everything" gate ──────────────────────────────
    // Confirm + force a full backup BEFORE deleting anything. Only the ticked
    // categories are wiped; SystemSettings (terms / themes / privacy levels)
    // is NEVER deleted.
    if (importMode === "wipe") {
      const cats = [
        includeAlters && t.alters,
        includeGroups && "groups",
        includeCustomFields && "custom fields",
        includeFrontHistory && `${t.fronting} history`,
        includeJournals && `journals & ${t.alter} notes`,
        includeRelationships && "relationships",
        includeChat && "chat",
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
      // "Replace everything": force a backup, then clear the ticked categories
      // before the normal import re-creates them from the file. If the backup
      // can't be saved (failed or canceled), abort WITHOUT deleting anything.
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
        if (includeJournals) { await deleteAllOf("JournalEntry"); await deleteAllOf("AlterNote"); }
        if (includeRelationships) await deleteAllOf("AlterRelationship");
        if (includeChat) { await deleteAllOf("SystemChatMessage"); await deleteAllOf("SystemChatCategory"); await deleteAllOf("SystemChatChannel"); }
      }

      const { data: d, media } = parsed;

      const assetsById = {};
      for (const a of d.assets || []) { if (a?.id) assetsById[a.id] = a; }

      // alter_id keyed by OpenPlural member id — built up as alters are created
      // / matched, then reused by fronts / journals / relationships.
      const alterIdByOpId = {};
      // local Group id keyed by OpenPlural group id — populated in the groups
      // step, then used to remap alter.groups[].id from OpenPlural ids to local
      // ids so group membership actually resolves (getMemberAlters matches
      // a.groups[].id === group.id, the LOCAL id).
      const groupIdByOpId = {};

      // ── Step 1: Custom fields (dedup by op_id, then by name) ──
      const fieldIdMap = {}; // opFieldId → local CustomField id
      let fieldsCreated = 0;
      {
        const existingFields = await localEntities.CustomField.list();
        const existingByOpId = {};
        const existingByName = {};
        for (const f of existingFields) {
          if (f.op_id) existingByOpId[f.op_id] = f;
          if (f.name) existingByName[f.name.toLowerCase().trim()] = f;
        }
        if (includeCustomFields) {
          setProgress("Importing custom fields…");
          let order = existingFields.length;
          for (const opField of d.custom_fields || []) {
            const opId = opField.id || "";
            if (!opId) continue;
            const existing = existingByOpId[opId] || existingByName[(opField.name || "").toLowerCase().trim()];
            const fieldData = {
              op_id: opId,
              name: opField.name || "Unnamed Field",
              field_type: opFieldType(opField.field_type),
            };
            if (existing) {
              fieldIdMap[opId] = existing.id;
              // Backfill op_id on a name-matched field so future imports are
              // exact. In replace mode the file also re-asserts name + type.
              const patch = {};
              if (!existing.op_id) patch.op_id = opId;
              if (importMode === "replace") { patch.name = fieldData.name; patch.field_type = fieldData.field_type; }
              if (Object.keys(patch).length) await localEntities.CustomField.update(existing.id, patch);
            } else {
              const created = await localEntities.CustomField.create({ ...fieldData, order: order++ });
              fieldIdMap[opId] = created.id;
              fieldsCreated++;
            }
          }
        } else {
          // Still build the map so alter custom_field refs resolve to existing fields.
          for (const f of existingFields) { if (f.op_id) fieldIdMap[f.op_id] = f.id; }
        }
      }

      // Pre-build per-member group + custom-field + taxonomy lookups.
      const memberGroupsById = includeGroups
        ? buildMemberGroups(d.groups || [], d.group_memberships || [])
        : {};
      const memberCustomFieldsById = includeCustomFields
        ? buildMemberCustomFields(d.custom_field_values || [], fieldIdMap)
        : {};
      // Taxonomy → per-member { role, tags }. Always built (cheap) so roles/tags
      // come over whenever alters are imported. OpenPlural has no member.role
      // field — role is a kind:"role" taxonomy assignment.
      const memberTaxonomyById = buildMemberTaxonomy(
        d.taxonomy_terms || [],
        d.taxonomy_assignments || [],
      );

      // ── Step 2: Alters ──
      let altersCreated = 0, altersUpdated = 0, avatarsStored = 0;
      const alterFailures = [];
      if (includeAlters) {
        const existingAlters = await localEntities.Alter.list();
        const existingByOpId = {};
        const existingByName = {};
        for (const a of existingAlters) {
          if (a.op_id) existingByOpId[a.op_id] = a;
          const key = (a.name || "").toLowerCase().trim();
          if (key && !existingByName[key]) existingByName[key] = a;
        }
        let idx = 0;
        for (const member of realMembers) {
          idx++;
          setProgress(`Importing ${t.alters}… (${idx}/${realMembers.length})`);
          // Resolve avatar/banner from media (optional).
          let avatarUrl = "";
          let bannerUrl = "";
          if (includeAvatars) {
            avatarUrl = await storeAssetAsLocalImage(member.avatar_asset_id, assetsById, media, `member-avatar-${member.id}`);
            bannerUrl = await storeAssetAsLocalImage(member.banner_asset_id, assetsById, media, `member-banner-${member.id}`);
            if (avatarUrl) avatarsStored++;
          }
          const tax = memberTaxonomyById[member.id] || { role: "", tags: [] };
          const mapped = mapMemberToAlter(member, {
            memberGroups: memberGroupsById[member.id] || [],
            customFields: memberCustomFieldsById[member.id] || {},
            avatarUrl,
            bannerUrl,
            role: tax.role,
            tags: tax.tags,
          });
          const existing = existingByOpId[member.id] || existingByName[(member.name || "").toLowerCase().trim()];
          try {
            if (existing) {
              // ALLOWLIST — write ONLY the fields OpenPlural owns; never touch
              // local organisation managed elsewhere (archive flag, pins,
              // friends visibility, etc.). Merge custom_fields so local-only
              // `_*` profile keys survive; `_header_image` follows includeAvatars.
              // name/pronouns/description/color overwrite (source of truth);
              // alias/role/age/birthday FILL-IF-EMPTY; tags are UNIONED below.
              const localOnly = Object.fromEntries(
                Object.entries(existing.custom_fields || {}).filter(([k]) => k.startsWith("_"))
              );
              const incomingFields = { ...(mapped.custom_fields || {}) };
              if (!includeAvatars) delete incomingFields._header_image;

              // Merge-safe extras: alias / role / age / birthday FILL-IF-EMPTY
              // (never clobber a user-set value); tags are UNIONED (append new
              // taxonomy tags without dropping local-only tags).
              const isBlank = (v) => v == null || String(v).trim() === "";
              const existingTags = Array.isArray(existing.tags) ? existing.tags : [];
              const mergedTags = [...existingTags];
              const tagSeen = new Set(existingTags.map((tg) => String(tg).toLowerCase()));
              for (const tg of (mapped.tags || [])) {
                const key = String(tg).toLowerCase();
                if (!tagSeen.has(key)) { tagSeen.add(key); mergedTags.push(tg); }
              }

              const updatePayload = {
                op_id: mapped.op_id,
                name: mapped.name,
                pronouns: mapped.pronouns,
                description: mapped.description,
                color: mapped.color,
                groups: includeGroups ? mapped.groups : (existing.groups || []),
                custom_fields: { ...localOnly, ...incomingFields },
              };
              if (importMode === "replace") {
                // This file wins: overwrite alias/role/age/birthday/tags when
                // the file carries a value, but DON'T clear a local value the
                // file simply doesn't include (so re-import never wipes data
                // the source format can't represent).
                if (mapped.alias) updatePayload.alias = mapped.alias;
                if (mapped.role) updatePayload.role = mapped.role;
                if (mapped.age) updatePayload.age = mapped.age;
                if (mapped.birthday) updatePayload.birthday = mapped.birthday;
                updatePayload.tags = (mapped.tags && mapped.tags.length) ? mapped.tags : existingTags;
              } else {
                // Add & update: fill-if-empty (never clobber your edits); union tags.
                if (isBlank(existing.alias) && mapped.alias) updatePayload.alias = mapped.alias;
                if (isBlank(existing.role) && mapped.role) updatePayload.role = mapped.role;
                if (isBlank(existing.age) && mapped.age) updatePayload.age = mapped.age;
                if (isBlank(existing.birthday) && mapped.birthday) updatePayload.birthday = mapped.birthday;
                updatePayload.tags = mergedTags;
              }
              if (includeAvatars && avatarUrl) updatePayload.avatar_url = avatarUrl;
              if (includeAvatars && bannerUrl) updatePayload.banner_url = bannerUrl;
              await localEntities.Alter.update(existing.id, updatePayload);
              alterIdByOpId[member.id] = existing.id;
              altersUpdated++;
            } else {
              const created = await localEntities.Alter.create(mapped);
              alterIdByOpId[member.id] = created.id;
              altersCreated++;
            }
          } catch (err) {
            console.error("[OpenPlural import] Alter write failed", mapped?.name, member.id, err);
            alterFailures.push({ name: mapped?.name || "(unnamed)", reason: err?.message || String(err) });
          }
        }
      } else {
        // Alters skipped — still build alterIdByOpId so fronts/journals/relationships resolve.
        const existingAlters = await localEntities.Alter.list();
        for (const a of existingAlters) { if (a.op_id) alterIdByOpId[a.op_id] = a.id; }
      }

      // ── Step 3: Groups + nesting ──
      let groupsCreated = 0, groupsUpdated = 0;
      if (includeGroups) {
        setProgress("Importing groups…");
        const existingGroups = await localEntities.Group.list();
        const existingByOpId = {};
        for (const g of existingGroups) { if (g.op_id) existingByOpId[g.op_id] = g; }
        // `order` follows the file's group sequence — order-less groups fall
        // back to the newest-first default and render REVERSED otherwise.
        let groupOrder = existingGroups.length;
        for (const opGroup of d.groups || []) {
          const mapped = mapGroupToLocalGroup(opGroup);
          if (!mapped.op_id) continue;
          const existing = existingByOpId[mapped.op_id];
          if (existing) {
            // Refresh display metadata only; preserve local parent (nesting set
            // in the pass below from the source's parent when present).
            await localEntities.Group.update(existing.id, {
              op_id: mapped.op_id,
              name: mapped.name,
              color: mapped.color,
              description: mapped.description,
              ...(existing.order == null ? { order: groupOrder } : {}),
            });
            groupIdByOpId[mapped.op_id] = existing.id;
            groupsUpdated++;
          } else {
            const created = await localEntities.Group.create({
              op_id: mapped.op_id,
              name: mapped.name,
              color: mapped.color,
              description: mapped.description,
              parent: "",
              order: groupOrder,
            });
            groupIdByOpId[mapped.op_id] = created.id;
            groupsCreated++;
          }
          groupOrder++;
        }
        // Second pass: resolve parent_group_id → local parent id.
        setProgress("Resolving group nesting…");
        for (const opGroup of d.groups || []) {
          const opId = opGroup.id || "";
          const localId = groupIdByOpId[opId];
          if (!localId) continue;
          const opParent = opGroup.parent_group_id || "";
          const localParent = opParent ? (groupIdByOpId[opParent] || "") : "";
          await localEntities.Group.update(localId, { parent: localParent });
        }

        // Third pass: rewrite each imported alter's groups[].id from the
        // OpenPlural group id to the LOCAL Group id. mapMemberToAlter built the
        // groups array from group_memberships using OpenPlural ids (groups
        // didn't exist locally yet when alters were created); group membership
        // only resolves when a.groups[].id === the local group.id.
        if (includeAlters) {
          setProgress("Linking members to groups…");
          for (const member of realMembers) {
            const localAlterId = alterIdByOpId[member.id];
            const opGroups = memberGroupsById[member.id] || [];
            if (!localAlterId || opGroups.length === 0) continue;
            const remapped = opGroups
              .map((g) => ({ ...g, id: groupIdByOpId[g.id] || g.id }))
              .filter((g) => g.id);
            await localEntities.Alter.update(localAlterId, { groups: remapped });
          }
        }
      }

      // ── Step 4: Front history (optional) ──
      let frontsCreated = 0, frontsSkipped = 0;
      if (includeFrontHistory) {
        setProgress("Importing front history…");
        const preset = RANGE_PRESETS.find((p) => p.id === historyRange);
        const cutoff = preset?.ms ? Date.now() - preset.ms : null;

        const existingSessions = await localEntities.FrontingSession.list();
        const existingOpFrontIds = new Set(
          existingSessions.filter((s) => s.op_front_id).map((s) => s.op_front_id)
        );
        const toCreate = [];
        for (const period of d.front_periods || []) {
          const startedMs = period.started_at ? new Date(period.started_at).getTime() : null;
          if (cutoff && startedMs && startedMs < cutoff) continue;
          for (const assignment of period.assignments || []) {
            const session = mapFrontAssignment(period, assignment, alterIdByOpId);
            if (!session) continue;
            if (session.op_front_id && existingOpFrontIds.has(session.op_front_id)) { frontsSkipped++; continue; }
            existingOpFrontIds.add(session.op_front_id);
            toCreate.push(session);
          }
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

      // ── Step 5: Journals / notes (optional) ──
      // Honor extensions.openplural.note_kind: "note" → AlterNote (per-member
      // profile note); "journal"/absent → JournalEntry. Each target dedups on
      // its own op_id set.
      let journalsCreated = 0, alterNotesCreated = 0;
      if (includeJournals) {
        setProgress("Importing journals & notes…");
        const existingJournals = await localEntities.JournalEntry.list();
        const journalOpIds = new Set(existingJournals.filter((j) => j.op_id).map((j) => j.op_id));
        const existingAlterNotes = await localEntities.AlterNote.list();
        const alterNoteOpIds = new Set(existingAlterNotes.filter((n) => n.op_id).map((n) => n.op_id));
        for (const note of d.notes || []) {
          if (noteKind(note) === "note") {
            const mapped = mapNoteToAlterNote(note, alterIdByOpId);
            if (!mapped) continue;
            if (mapped.op_id && alterNoteOpIds.has(mapped.op_id)) continue;
            await localEntities.AlterNote.create(mapped);
            if (mapped.op_id) alterNoteOpIds.add(mapped.op_id);
            alterNotesCreated++;
          } else {
            const mapped = mapNoteToJournalEntry(note, alterIdByOpId);
            if (!mapped) continue;
            if (mapped.op_id && journalOpIds.has(mapped.op_id)) continue;
            await localEntities.JournalEntry.create(mapped);
            if (mapped.op_id) journalOpIds.add(mapped.op_id);
            journalsCreated++;
          }
        }
      }

      // ── Step 6: Relationships (optional) ──
      let relsCreated = 0;
      if (includeRelationships) {
        setProgress("Importing relationships…");
        // Resolve type_id → label. relationships.types may be empty.
        const typeLabelById = {};
        for (const ty of d.relationships?.types || []) {
          if (ty?.id) typeLabelById[ty.id] = ty.name || ty.label || "";
        }
        const existingRels = await localEntities.AlterRelationship.list();
        const existingByOpId = new Set(existingRels.filter((r) => r.op_id).map((r) => r.op_id));
        for (const edge of d.relationships?.edges || []) {
          const label = typeLabelById[edge.type_id] || "Related";
          const mapped = mapRelationshipEdge(edge, alterIdByOpId, label);
          if (!mapped) continue;
          if (mapped.op_id && existingByOpId.has(mapped.op_id)) continue;
          await localEntities.AlterRelationship.create(mapped);
          if (mapped.op_id) existingByOpId.add(mapped.op_id);
          relsCreated++;
        }
      }

      // ── Step 7: System profile (optional, MERGE-SAFE) ──
      // Fill only the EMPTY identity fields on the existing SystemSettings
      // singleton from systems[0]; never clobber a user's name/bio/avatar/terms.
      let systemProfileUpdated = false;
      if (includeSystemProfile && d.systems?.[0]) {
        setProgress("Importing system profile…");
        try {
          const sys = d.systems[0];
          // Resolve system avatar/banner the same way as member avatars.
          let sysAvatarUrl = "";
          let sysBannerUrl = "";
          if (includeAvatars) {
            sysAvatarUrl = await storeAssetAsLocalImage(sys.avatar_asset_id, assetsById, media, `system-avatar-${sys.id || "0"}`);
            sysBannerUrl = await storeAssetAsLocalImage(sys.banner_asset_id, assetsById, media, `system-banner-${sys.id || "0"}`);
          }
          // Read the existing singleton (singleton-merge pattern: read + spread
          // + update, never list()[0]-clobber).
          const settingsList = await localEntities.SystemSettings.list();
          const existingSettings = settingsList[0] || null;
          const patch = buildSystemIdentityPatch(sys, existingSettings || {}, {
            systemAvatarUrl: sysAvatarUrl,
            systemBannerUrl: sysBannerUrl,
          });
          if (Object.keys(patch).length > 0) {
            if (existingSettings?.id) {
              await localEntities.SystemSettings.update(existingSettings.id, patch);
            } else {
              await localEntities.SystemSettings.create(patch);
            }
            systemProfileUpdated = true;
          }
        } catch (err) {
          console.warn("[OpenPlural import] system profile import failed", err);
        }
      }

      // ── Step 8: System chat (optional) ──
      // Channels + categories + messages. Runs AFTER members so author_member_id
      // resolves to a local alter id via alterIdByOpId. Dedups channels /
      // categories / messages by op_id; null author (system message) is allowed.
      let chatChannelsCreated = 0, chatCategoriesCreated = 0, chatMessagesCreated = 0;
      if (includeChat && d.chat) {
        setProgress("Importing chat…");
        const opChat = d.chat;

        // 8a: Categories (dedup by op_id), then resolve nesting.
        const categoryIdByOpId = {}; // op category id → local SystemChatCategory id
        {
          const existingCats = await localEntities.SystemChatCategory.list();
          const existingByOpId = {};
          for (const c of existingCats) { if (c.op_id) existingByOpId[c.op_id] = c; }
          for (const opCat of opChat.categories || []) {
            const mapped = mapChatCategory(opCat);
            if (!mapped.op_id) continue;
            const existing = existingByOpId[mapped.op_id];
            if (existing) {
              await localEntities.SystemChatCategory.update(existing.id, {
                op_id: mapped.op_id,
                name: mapped.name,
                color: mapped.color,
                sort_order: mapped.sort_order,
                collapsed: mapped.collapsed,
              });
              categoryIdByOpId[mapped.op_id] = existing.id;
            } else {
              const created = await localEntities.SystemChatCategory.create({
                op_id: mapped.op_id,
                name: mapped.name,
                color: mapped.color,
                sort_order: mapped.sort_order,
                collapsed: mapped.collapsed,
                parent_category_id: null,
                created_date: new Date().toISOString(),
              });
              categoryIdByOpId[mapped.op_id] = created.id;
              chatCategoriesCreated++;
            }
          }
          // Second pass: resolve parent_category_id (op id → local id).
          for (const opCat of opChat.categories || []) {
            const mapped = mapChatCategory(opCat);
            const localId = categoryIdByOpId[mapped.op_id];
            if (!localId) continue;
            const localParent = mapped.op_parent_id ? (categoryIdByOpId[mapped.op_parent_id] || null) : null;
            await localEntities.SystemChatCategory.update(localId, { parent_category_id: localParent });
          }
        }

        // 8b: Channels (dedup by op_id). Resolve category_id + private members.
        const channelIdByOpId = {}; // op conversation id → local SystemChatChannel id
        {
          const existingChannels = await localEntities.SystemChatChannel.list();
          const existingByOpId = {};
          for (const c of existingChannels) { if (c.op_id) existingByOpId[c.op_id] = c; }
          for (const opConv of opChat.conversations || []) {
            // Only "channel"-kind conversations map to SystemChatChannel.
            if (opConv?.kind && opConv.kind !== "channel") continue;
            const mapped = mapChatConversation(opConv);
            if (!mapped.op_id) continue;
            const localCategoryId = mapped.op_category_id ? (categoryIdByOpId[mapped.op_category_id] || null) : null;
            const localMemberIds = (mapped.op_member_ids || [])
              .map((id) => alterIdByOpId[id])
              .filter(Boolean);
            const payload = {
              op_id: mapped.op_id,
              name: mapped.name,
              description: mapped.description,
              color: mapped.color,
              sort_order: mapped.sort_order,
              is_archived: mapped.is_archived,
              is_private: mapped.is_private,
              category_id: localCategoryId,
              member_alter_ids: localMemberIds,
            };
            const existing = existingByOpId[mapped.op_id];
            if (existing) {
              await localEntities.SystemChatChannel.update(existing.id, payload);
              channelIdByOpId[mapped.op_id] = existing.id;
            } else {
              const created = await localEntities.SystemChatChannel.create({
                ...payload,
                created_date: new Date().toISOString(),
              });
              channelIdByOpId[mapped.op_id] = created.id;
              chatChannelsCreated++;
            }
          }
        }

        // 8c: Messages (dedup by op_id). Two passes so reply_to_id resolves to
        // an imported message even when a reply precedes its parent.
        {
          const existingMsgs = await localEntities.SystemChatMessage.list();
          const msgIdByOpId = {}; // op message id → local SystemChatMessage id
          const existingByOpId = {};
          for (const m of existingMsgs) {
            if (m.op_id) { existingByOpId[m.op_id] = m; msgIdByOpId[m.op_id] = m.id; }
          }
          // Pass 1: create/locate every message without replies, building the id map.
          const opMessages = opChat.messages || [];
          const pending = []; // messages that still need reply_to_id wired up
          for (const opMsg of opMessages) {
            const opId = opMsg?.id || "";
            if (!opId) continue;
            const channelId = channelIdByOpId[opMsg.conversation_id];
            if (!channelId) continue; // channel didn't import
            const existing = existingByOpId[opId];
            if (existing) { msgIdByOpId[opId] = existing.id; continue; }
            const mapped = mapChatMessage(opMsg, { channelIdByOpId, alterIdByOpId, msgIdByOpId });
            if (!mapped) continue;
            // Defer reply linkage to pass 2 (parent may not exist yet).
            const created = await localEntities.SystemChatMessage.create({ ...mapped, reply_to_id: null });
            msgIdByOpId[opId] = created.id;
            chatMessagesCreated++;
            if (opMsg.reply_to_id) pending.push({ localId: created.id, opReplyId: opMsg.reply_to_id });
          }
          // Pass 2: resolve reply_to_id now that every message has a local id.
          for (const { localId, opReplyId } of pending) {
            const localReply = msgIdByOpId[opReplyId];
            if (localReply) await localEntities.SystemChatMessage.update(localId, { reply_to_id: localReply });
          }
        }
      }

      // ── Finish ──
      onSettingsChange?.();
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["customFields"] });
      queryClient.invalidateQueries({ queryKey: ["activeFront"] });
      queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      queryClient.invalidateQueries({ queryKey: ["journalEntries"] });
      queryClient.invalidateQueries({ queryKey: ["alterRelationships"] });
      queryClient.invalidateQueries({ queryKey: ["alterNotes"] });
      queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
      queryClient.invalidateQueries({ queryKey: ["systemChatChannels"] });
      queryClient.invalidateQueries({ queryKey: ["systemChatCategories"] });
      queryClient.invalidateQueries({ queryKey: ["systemChatMessages"] });
      setProgress("");

      const parts = [
        includeAlters && `${t.Alters}: ${altersCreated} new, ${altersUpdated} updated${alterFailures.length ? `, ${alterFailures.length} failed` : ""}`,
        includeAvatars && avatarsStored > 0 && `Avatars: ${avatarsStored}`,
        includeGroups && `Groups: ${groupsCreated} new, ${groupsUpdated} updated`,
        includeCustomFields && fieldsCreated > 0 && `Fields: ${fieldsCreated} new`,
        includeFrontHistory && `${t.Fronting}: ${frontsCreated} new${frontsSkipped ? `, ${frontsSkipped} existed` : ""}`,
        includeJournals && journalsCreated > 0 && `Journals: ${journalsCreated}`,
        includeJournals && alterNotesCreated > 0 && `${t.Alter} notes: ${alterNotesCreated}`,
        includeRelationships && relsCreated > 0 && `Relationships: ${relsCreated}`,
        includeChat && (chatChannelsCreated > 0 || chatMessagesCreated > 0) && `Chat: ${chatChannelsCreated} channel${chatChannelsCreated === 1 ? "" : "s"}, ${chatMessagesCreated} message${chatMessagesCreated === 1 ? "" : "s"}`,
        includeSystemProfile && systemProfileUpdated && `${t.System} profile updated`,
      ].filter(Boolean).join(" · ");

      if (alterFailures.length > 0) {
        console.warn("[OpenPlural import] Some alters failed to import:", alterFailures);
        const sample = alterFailures.slice(0, 3).map((f) => f.name).join(", ");
        toast.error(
          `Import partial — ${alterFailures.length} ${alterFailures.length === 1 ? t.alter : t.alters} failed (${sample}${alterFailures.length > 3 ? ", …" : ""}). See devtools console.`,
          { duration: 12000 },
        );
      }
      toast.success(`Import complete! ${parts}`);
    } catch (e) {
      setProgress("");
      console.error("[OpenPlural import] failed", e);
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
            <FileArchive className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">OpenPlural / PluralSpace</CardTitle>
            <CardDescription>
              Import {t.alters}, front history, and more from an OpenPlural export (.zip from PluralSpace).
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
                Choose your OpenPlural export. A <code className="font-mono bg-muted px-1 rounded">.zip</code> keeps avatars; a raw <code className="font-mono bg-muted px-1 rounded">.json</code> works too (without images).
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.json,application/zip,application/json"
                onChange={handleFile}
                className="hidden"
                id="op-file-input"
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
                <span className="font-medium">{counts.system || "OpenPlural export"}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Found {counts.members} {counts.members === 1 ? t.alter : t.alters}
                {counts.customFronts > 0 && ` (${counts.customFronts} custom front${counts.customFronts === 1 ? "" : "s"} skipped)`}
                , {counts.groups} group{counts.groups === 1 ? "" : "s"}, {counts.customFields} custom field{counts.customFields === 1 ? "" : "s"}, {counts.fronts} front period{counts.fronts === 1 ? "" : "s"}, {counts.notes} note{counts.notes === 1 ? "" : "s"}, {counts.relationships} relationship{counts.relationships === 1 ? "" : "s"}{counts.chatMessages > 0 ? `, ${counts.chatMessages} chat message${counts.chatMessages === 1 ? "" : "s"}` : ""}.
              </p>
            </div>
          )}

          {/* Options */}
          {counts && (
            <div className="border-t pt-4 space-y-3">
              {/* Import mode — how to treat your existing local data. */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground font-medium">How should this import treat your existing data?</p>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setImportMode("add")}
                    className={`w-full text-xs rounded-lg border px-3 py-2 text-left transition-colors ${importMode === "add" ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-muted/40"}`}
                  >
                    <span className="font-medium block">Add &amp; update</span>
                    <span className="text-[11px] opacity-80">Adds new records, fills blanks, keeps your edits.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode("replace")}
                    className={`w-full text-xs rounded-lg border px-3 py-2 text-left transition-colors ${importMode === "replace" ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-muted/40"}`}
                  >
                    <span className="font-medium block">Replace from file</span>
                    <span className="text-[11px] opacity-80">This file wins on conflicts. Nothing is deleted.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode("wipe")}
                    className={`w-full text-xs rounded-lg border px-3 py-2 text-left transition-colors ${importMode === "wipe" ? "border-destructive bg-destructive/10 text-foreground" : "border-destructive/40 text-muted-foreground hover:bg-destructive/5"}`}
                  >
                    <span className="font-medium flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" /> Replace everything</span>
                    <span className="text-[11px] opacity-80">Deletes the ticked categories, then imports. Backs up first.</span>
                  </button>
                </div>
                <p className={`text-[11px] ${importMode === "wipe" ? "text-destructive" : "text-muted-foreground"}`}>
                  {importMode === "add"
                    ? `Adds new records and fills in empty fields — anything you've already set in OS is kept.`
                    : importMode === "replace"
                    ? `Matching ${t.alters} are overwritten with this file's values. New records are still added, and ${t.alters} not in the file are never deleted.`
                    : `⚠️ Permanently deletes your existing data in the categories ticked below, then imports this file fresh. A full backup is saved to your device first, and your ${t.system} settings, terminology and themes are always kept.`}
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
                    <span>Avatars &amp; banners <span className="text-muted-foreground/60 text-xs">(.zip only)</span></span>
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
                    <Label htmlFor="op-history-range" className="text-xs">Range:</Label>
                    <select
                      id="op-history-range"
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
                  <input type="checkbox" checked={includeJournals} onChange={(e) => setIncludeJournals(e.target.checked)} className="rounded" />
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  Journals &amp; {t.alter} notes
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={includeRelationships} onChange={(e) => setIncludeRelationships(e.target.checked)} className="rounded" />
                  <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                  Relationships
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={includeChat} onChange={(e) => setIncludeChat(e.target.checked)} className="rounded" />
                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                  {t.System} chat <span className="text-muted-foreground/60 text-xs">(channels &amp; messages)</span>
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
