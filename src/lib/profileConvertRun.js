// Converting an alter's profile to the garden layout, and undoing it
// (v0.297.0). The plan is pure (profileConvert.js); this file reads and
// writes.
//
// Data safety:
//   • Nothing is deleted. The original bio is copied to
//     `bio_before_conversion` before the bio field changes, and every write
//     goes through the entity layer, so Recent changes keeps the previous
//     alter and layout too.
//   • Undo puts back the layout the profile had and the original bio. Text
//     changed since the conversion is never thrown away: an entry edited
//     since stays, and a bio edited since stays as a "Bio (after
//     conversion)" entry.
//   • An alter whose own fields are still in the older id-keyed shape can't
//     take new entries, so their whole bio stays one Bio entry and only the
//     pictures become widgets beside it.

import { base44 } from "@/api/base44Client";
import { htmlToBlocks } from "@/components/shared/BlockEditor";
import { listProfileBoardRows, profileBoardStore, profileBoardQueryKey } from "@/lib/boardStore";
import { pickProfileBoardRows, layoutForCopy, DEFAULT_OWNER_ID, isGardenProfile } from "@/lib/profileBoard";
import { planFromBlocks, picturesOfParts, entryNamesFor, widgetsForParts, convertBoard } from "@/lib/profileConvert";
import { addAlterPicture } from "@/lib/alterImageUpload";
import { refreshAlter } from "@/lib/alterEntry";

const legacyShape = (alter) => !!alter?.alter_custom_fields && !Array.isArray(alter.alter_custom_fields);

// What converting would do, for the preview.
export function previewConversion(alter) {
  const parts = planFromBlocks(htmlToBlocks(alter?.description || ""));
  const texts = parts.filter((p) => p.kind === "text" || p.kind === "side").length;
  const pictures = picturesOfParts(parts).length;
  return {
    parts,
    texts,
    pictures,
    splitsText: texts > 1 && !legacyShape(alter),
    converted: isGardenProfile(alter),
    canUndo: !!alter?.profile_conversion && !alter.profile_conversion.undone_at,
  };
}

export async function convertAlterProfile(alterId, { qc = null } = {}) {
  const alter = await base44.entities.Alter.get(alterId);
  if (!alter) throw new Error("That profile isn't here any more");
  if (isGardenProfile(alter)) return { already: true };
  const original = alter.description || "";
  let parts = planFromBlocks(htmlToBlocks(original));
  const legacy = legacyShape(alter);
  const textParts = parts.filter((p) => p.kind === "text" || p.kind === "side");

  // Texts → the bio and new entries of their own.
  const patch = {};
  let entryIds = ["bio"];
  let newEntries = [];
  if (legacy || textParts.length <= 1) {
    if (legacy && textParts.length > 1) {
      // One Bio holds everything; pictures beside text stay inside it.
      parts = [{ kind: "text", html: original }];
    } else if (textParts.length === 1) {
      const only = textParts[0].html;
      if (only !== original) patch.description = only;
    }
  } else {
    const own = Array.isArray(alter.alter_custom_fields) ? alter.alter_custom_fields : [];
    const names = entryNamesFor(textParts.length - 1, own.map((f) => f?.name));
    // from_bio: shown where the layout puts it, so the Info fields list
    // doesn't show it a second time.
    newEntries = names.map((name, i) => ({ name, value: textParts[i + 1].html, field_type: "richtext", from_bio: true }));
    patch.description = textParts[0].html;
    patch.alter_custom_fields = [...own, ...newEntries];
    entryIds = ["bio", ...names.map((n) => `own:${n}`)];
  }

  // The layout the profile shows now: its own, the type's default, or the seed.
  const ownRows = await listProfileBoardRows("alter", alterId);
  const own = pickProfileBoardRows(ownRows);
  const def = own.board ? null : layoutForCopy(pickProfileBoardRows(await listProfileBoardRows("alter", DEFAULT_OWNER_ID)).board);
  const base = own.board || def || null;
  const { widgets } = widgetsForParts(parts, entryIds);
  const next = convertBoard(base, alter, widgets);

  await base44.entities.Alter.update(alterId, {
    ...patch,
    bio_before_conversion: original,
    profile_layout: "garden",
    profile_conversion: {
      at: new Date().toISOString(),
      prev_layout: alter.profile_layout || null,
      had_layout: !!own.board,
      prev_board: own.board ? layoutForCopy(own.board) : null,
      wrote_description: "description" in patch ? patch.description : original,
      entries: newEntries.map((e) => ({ name: e.name, value: e.value })),
    },
  });
  for (const src of picturesOfParts(parts)) {
    try { await addAlterPicture({ alterId, url: src }); } catch { /* the picture still shows from its link */ }
  }
  const store = profileBoardStore({ ownerType: "alter", ownerId: alterId, rows: ownRows, qc });
  await store.update(() => next);
  if (qc) {
    qc.invalidateQueries({ queryKey: profileBoardQueryKey("alter", alterId) });
    qc.invalidateQueries({ queryKey: ["imageAssets"] });
    refreshAlter(qc, alterId);
  }
  return { converted: true, entries: newEntries.length, pictures: picturesOfParts(parts).length };
}

export async function undoAlterConversion(alterId, { qc = null } = {}) {
  const alter = await base44.entities.Alter.get(alterId);
  const conv = alter?.profile_conversion;
  if (!conv || conv.undone_at) throw new Error("There's no conversion to undo");
  const patch = {
    profile_layout: conv.prev_layout || null,
    profile_conversion: { ...conv, undone_at: new Date().toISOString() },
  };
  const original = alter.bio_before_conversion ?? "";
  const current = alter.description || "";
  let own = Array.isArray(alter.alter_custom_fields) ? [...alter.alter_custom_fields] : null;
  // Entries the conversion made: gone again unless edited since.
  if (own && Array.isArray(conv.entries) && conv.entries.length) {
    own = own.filter((f) => !conv.entries.some((e) => e.name === f?.name && e.value === f?.value));
  }
  if (current !== original) {
    const editedSince = current !== (conv.wrote_description ?? original);
    if (!editedSince) patch.description = original;
    else if (own) {
      // Edited since: that text stays, as an entry of its own.
      own.push({ name: "Bio (after conversion)", value: current, field_type: "richtext" });
      patch.description = original;
    }
    // (Edited since, with nowhere to keep it: the bio stays as it is now;
    // the original is still in bio_before_conversion.)
  }
  if (own) patch.alter_custom_fields = own;
  await base44.entities.Alter.update(alterId, patch);

  const rows = await listProfileBoardRows("alter", alterId);
  if (conv.had_layout && conv.prev_board) {
    await profileBoardStore({ ownerType: "alter", ownerId: alterId, rows, qc }).update(() => conv.prev_board);
  } else {
    // It showed the default or the seed: its own layout goes to the trash
    // (restorable), and it shows those again.
    for (const r of rows) {
      try { await base44.entities.ProfileBoard.delete(r.id); } catch { /* best-effort */ }
    }
  }
  if (qc) {
    qc.invalidateQueries({ queryKey: profileBoardQueryKey("alter", alterId) });
    refreshAlter(qc, alterId);
  }
  return { undone: true };
}

