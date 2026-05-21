// "Get to know me" answer-write helpers.
//
// When the user answers a question on the Get to know me page,
// we try to persist their answer back to the selected alters so
// that the same question in Help me unblend will narrow towards
// those alters next time. Each question kind maps to a different
// alter field / entity:
//
//   - color           → alter.color
//   - pronouns        → alter.pronouns
//   - role            → alter.role
//   - custom_field    → alter.custom_fields[fieldId] (the same
//                       map InfoTab already renders, so a
//                       writeback shows up immediately as a
//                       filled-in custom field on the profile)
//                       (appends + dedupes for list-type fields)
//   - multiple_choice → option.alterIds on the stored
//                       UnblendQuestion record itself
//
// Historical note: writeback used to target alter_custom_fields,
// which conflicted with InfoTab's per-alter ad-hoc list. Existing
// rows are migrated lazily via migrateAlterCustomFieldsObject()
// the first time the affected alter passes through here.
//
// Anything else (age range, energy/body/feeling tag matchers,
// dominant-feeling derived from EmotionCheckIn) returns
// { saved: false, reason } so the page can show a friendly "this
// question type doesn't save data yet" hint.
import { base44, localEntities } from "@/api/base44Client";
import { migrateAlterCustomFieldsObject } from "@/lib/alterCustomFieldsMigration";

function isListField(fieldDef) {
  return fieldDef?.field_type === "list";
}

function dedupePreserveOrder(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/**
 * Apply an answer to a set of alters. `answer` shape depends on
 * the question kind:
 *   - color           → "#RRGGBB" string
 *   - choice          → the option object that was picked
 *   - multiple_choice → the picked option (must include id; we
 *                       update the stored UnblendQuestion record).
 */
export async function applyGetToKnowMeAnswer({ question, answer, alterIds, customFields = [] }) {
  if (!question || !Array.isArray(alterIds) || alterIds.length === 0) {
    return { saved: false, reason: "Pick at least one alter first." };
  }

  // Most-recent alter records — we need the current values to
  // merge into rather than overwrite blindly.
  const allAlters = await base44.entities.Alter.list();
  const byId = Object.fromEntries(allAlters.map((a) => [a.id, a]));

  switch (question.kind) {
    case "field_input": {
      const fieldId = question.fieldId;
      if (!fieldId) return { saved: false, reason: "Question has no field id." };
      const fieldDef = customFields.find((f) => f.id === fieldId) || { field_type: question.fieldType };
      const raw = typeof answer === "string" ? answer.trim() : String(answer?.label || answer?.value || "").trim();
      if (!raw) return { saved: false, reason: "Type or pick an answer first." };
      // User-data invariant: never silently overwrite. For both list
      // AND text fields, fold the new value into a comma-separated
      // sequence so prior answers are preserved. Dedupes case-
      // insensitively. A boolean / yes-no field still replaces (the
      // value is the entire field).
      for (const id of alterIds) {
        let alter = byId[id];
        if (!alter) continue;
        // Lazy migrate any pre-existing object-shape data on
        // alter_custom_fields into alter.custom_fields so the
        // writeback below merges cleanly.
        alter = await migrateAlterCustomFieldsObject(alter);
        const map = { ...(alter.custom_fields || {}) };
        const prev = typeof map[fieldId] === "string" ? map[fieldId] : "";
        let next;
        const fieldType = fieldDef?.field_type;
        if (fieldType === "boolean") {
          next = raw;
        } else {
          const items = prev ? prev.split(/[,;|]/).map((s) => s.trim()).filter(Boolean) : [];
          items.push(raw);
          next = dedupePreserveOrder(items).join(", ");
        }
        map[fieldId] = next;
        await base44.entities.Alter.update(id, { custom_fields: map });
      }
      return { saved: true, count: alterIds.length, field: question.fieldName || "custom field" };
    }

    case "color": {
      if (typeof answer !== "string" || !/^#[0-9a-f]{6}$/i.test(answer)) {
        return { saved: false, reason: "Invalid color value." };
      }
      for (const id of alterIds) {
        if (!byId[id]) continue;
        await base44.entities.Alter.update(id, { color: answer });
      }
      return { saved: true, count: alterIds.length, field: "color" };
    }

    case "choice": {
      if (!answer) return { saved: false, reason: "No answer picked." };

      // Dynamic / user pronouns / role / age questions and the
      // dynamic custom_field question all expose `value` on the
      // option. The dynamic id encodes which alter field to write:
      //   dyn_pronouns / user_<id> with kind=pronouns
      //   dyn_role / user_<id> with kind=role
      //   dyn_age (range-based) — defer, no clean write
      //   dyn_field_<fieldId> / user_<id> with kind=custom_field
      const writeValue = String(answer.value || answer.id || "").trim();
      if (!writeValue) return { saved: false, reason: "Option has no writable value." };

      // 1) Custom-field questions
      const fieldIdMatch =
        (question.id && question.id.startsWith("dyn_field_") && question.id.slice("dyn_field_".length)) ||
        (question.field) ||
        null;
      if (fieldIdMatch) {
        const fieldDef = customFields.find((f) => f.id === fieldIdMatch);
        for (const id of alterIds) {
          let alter = byId[id];
          if (!alter) continue;
          alter = await migrateAlterCustomFieldsObject(alter);
          const map = { ...(alter.custom_fields || {}) };
          const prev = typeof map[fieldIdMatch] === "string" ? map[fieldIdMatch] : "";
          let next;
          if (isListField(fieldDef)) {
            const items = prev
              ? prev.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
              : [];
            items.push(answer.label || writeValue);
            next = dedupePreserveOrder(items).join(", ");
          } else {
            next = answer.label || writeValue;
          }
          map[fieldIdMatch] = next;
          await base44.entities.Alter.update(id, { custom_fields: map });
        }
        return { saved: true, count: alterIds.length, field: fieldDef?.name || "custom field" };
      }

      // 2) Pronouns / role
      if (question.id === "dyn_pronouns" || question.id?.startsWith("user_") && /pronoun/i.test(question.prompt || "")) {
        for (const id of alterIds) {
          if (!byId[id]) continue;
          await base44.entities.Alter.update(id, { pronouns: answer.label || writeValue });
        }
        return { saved: true, count: alterIds.length, field: "pronouns" };
      }
      if (question.id === "dyn_role" || question.id?.startsWith("user_") && /role/i.test(question.prompt || "")) {
        for (const id of alterIds) {
          if (!byId[id]) continue;
          await base44.entities.Alter.update(id, { role: answer.label || writeValue });
        }
        return { saved: true, count: alterIds.length, field: "role" };
      }

      // 3) Multiple-choice user question — write back via
      //    option.alterIds on the stored UnblendQuestion record.
      if (question.userId && Array.isArray(question.options)) {
        const rec = await localEntities.UnblendQuestion.get(question.userId).catch(() => null);
        if (!rec) return { saved: false, reason: "Question record not found." };
        const nextOptions = (rec.options || []).map((o) => {
          if (o.id !== (answer.id || answer.value)) return o;
          const merged = new Set([...(o.alterIds || []), ...alterIds]);
          return { ...o, alterIds: [...merged] };
        });
        await localEntities.UnblendQuestion.update(question.userId, { options: nextOptions });
        return { saved: true, count: alterIds.length, field: "multiple-choice option" };
      }

      // 4) Preset tag-based questions (energy / body / role_lean /
      //    dyn_dominant_feeling). Store answers as a custom-field-
      //    style list on alter.preset_answers[question.id] —
      //    multi-value, comma-separated, deduped. InfoTab renders
      //    these as a row of pills under a section labelled "From
      //    Get to know me" so the user can see (and remove
      //    individual) entries directly. NO writes to alter.tags
      //    anymore — that surface felt intrusive when it was
      //    bundling inferences the user hadn't typed.
      const literalAnswer = (answer.tagLabel || answer.label || answer.value || "").trim();
      const dominantFeelingValue = question.id === "dyn_dominant_feeling"
        ? (answer.value || answer.label || null)
        : null;
      const roleHints = Array.isArray(answer.roles) ? answer.roles.filter(Boolean) : [];

      const presetKey = question.id === "dyn_dominant_feeling"
        ? "dominant_feeling"
        : question.id;
      const presetValue = literalAnswer || dominantFeelingValue;

      if (presetValue || roleHints.length > 0) {
        for (const id of alterIds) {
          const alter = byId[id];
          if (!alter) continue;
          const updates = {};

          if (presetValue) {
            const prevPresetAll = (alter.preset_answers && typeof alter.preset_answers === "object" && !Array.isArray(alter.preset_answers))
              ? alter.preset_answers
              : {};
            const prevStr = typeof prevPresetAll[presetKey] === "string" ? prevPresetAll[presetKey] : "";
            const items = prevStr ? prevStr.split(/[,;|]/).map((s) => s.trim()).filter(Boolean) : [];
            items.push(presetValue);
            const next = dedupePreserveOrder(items).join(", ");
            updates.preset_answers = { ...prevPresetAll, [presetKey]: next };
          }

          // Only set role if it's currently blank — don't overwrite
          // an explicit role the user already typed.
          if (roleHints.length > 0 && !(typeof alter.role === "string" && alter.role.trim())) {
            updates.role = roleHints[0];
          }
          if (Object.keys(updates).length > 0) {
            await base44.entities.Alter.update(id, updates);
          }
        }
        return {
          saved: true,
          count: alterIds.length,
          field: presetValue ? (question.fieldName || question.prompt?.split(/[?]/)[0] || "answer") : "role",
        };
      }

      return {
        saved: false,
        reason: "This question type doesn't save data yet — answer it here for instant context, but it won't seed the unblend ranker.",
      };
    }

    default:
      return { saved: false, reason: "Unknown question kind." };
  }
}
