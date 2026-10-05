// Runs one saved Quick Action (the press-and-hold "Shortcuts" menu, and the
// OS launcher shortcuts that deep-link to /?quickAction=<id>).
//
// It used to live inside Dashboard.jsx, which meant the menu could only
// open on the home screen — holding a bar key on any other page navigated
// home first. Pulled out so the menu can open in place wherever you are;
// the few actions that need a home-hosted sheet (check-in, Set fronters)
// ask the caller to open it through `ctx`.
//
// Fronting/alters/categories are read FRESH on every run (refetch before
// write) instead of trusting whatever a page had cached.

import { format } from "date-fns";
import { toast } from "sonner";
import { base44, localEntities } from "@/api/base44Client";
import { LOCATION_CATEGORIES } from "@/lib/locationCategories";
import { toggleTemplateDone } from "@/lib/dailyTaskSystem";
import { addActiveActivity } from "@/lib/activitySession";
import { startEncounter, endEncounterForContact } from "@/lib/contactEncounters";
import { contactDisplayName } from "@/lib/contacts";
import { ALL_PAGES } from "@/utils/navigationConfig";
import { startSymptomSession } from "@/lib/symptomSessions";

const safe = (p) => Promise.resolve(p).then((v) => (Array.isArray(v) ? v : [])).catch(() => []);

// Same derivation the dashboard uses: the individual model (alter_id +
// is_primary per row) and the legacy grouped model (primary_alter_id +
// co_fronter_ids).
function frontingFrom(activeSessions) {
  let frontingAlterIds = [];
  let currentAlterId = null;
  if (activeSessions.length > 0) {
    if (activeSessions.some((s) => s.alter_id)) {
      frontingAlterIds = [...new Set(activeSessions.map((s) => s.alter_id).filter(Boolean))];
      const primarySess = activeSessions.find((s) => s.alter_id && s.is_primary);
      currentAlterId = primarySess?.alter_id || frontingAlterIds[0] || null;
    } else {
      const firstSession = activeSessions[0];
      currentAlterId = firstSession.primary_alter_id || null;
      frontingAlterIds = [firstSession.primary_alter_id, ...(firstSession.co_fronter_ids || [])].filter(Boolean);
    }
  }
  return { frontingAlterIds, currentAlterId };
}

// ctx: { queryClient, terms, navigate(path), openCheckin(section|null),
//        openSetFront(), reopenMenu() }
export async function runQuickAction(action, extraData = {}, ctx) {
  const { queryClient, terms } = ctx;
  const now = new Date().toISOString();
  const [alters, activityCategories, activeSessions] = await Promise.all([
    safe(base44.entities.Alter.list()),
    safe(base44.entities.ActivityCategory.list()),
    safe(base44.entities.FrontingSession.filter({ is_active: true })),
  ]);
  const { frontingAlterIds, currentAlterId } = frontingFrom(activeSessions);

  if (action.type === "open_checkin_section") {
    ctx.openCheckin(action.config?.section || null);
  } else if (action.type === "open_set_front") {
    ctx.openSetFront();
  } else if (action.type === "set_front_alter") {
    const alterId = action.config?.alter_id;
    if (!alterId) return;
    const active = await base44.entities.FrontingSession.filter({ is_active: true });
    await Promise.all(active.map((s) =>
      base44.entities.FrontingSession.update(s.id, { is_active: false, end_time: now })
    ));
    await base44.entities.FrontingSession.create({ alter_id: alterId, is_primary: true, start_time: now, is_active: true });
    queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    queryClient.invalidateQueries({ queryKey: ["activeFront"] });
    const alterObj = alters.find((a) => a.id === alterId);
    toast.success(`${alterObj?.name || "Alter"} set as ${terms.fronting}`);
  } else if (action.type === "add_to_front_alter") {
    const alterId = action.config?.alter_id;
    if (!alterId) return;
    // Refetch-before-write: creating unconditionally gave an already-
    // fronting alter a SECOND active row — and the next boot sweep would
    // end the original (older) row, silently dropping their primary flag
    // and resetting "fronting since".
    const activeNow = await base44.entities.FrontingSession.filter({ is_active: true });
    const already = activeNow.find((s) => (s.alter_id || s.primary_alter_id) === alterId);
    if (already) {
      const alterObj = alters.find((a) => a.id === alterId);
      toast.info(`${alterObj?.name || "Alter"} is already ${terms.fronting}`);
      return;
    }
    await base44.entities.FrontingSession.create({ alter_id: alterId, is_primary: false, start_time: now, is_active: true });
    queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
    queryClient.invalidateQueries({ queryKey: ["activeFront"] });
    const alterObj = alters.find((a) => a.id === alterId);
    toast.success(`${alterObj?.name || "Alter"} added as co-${terms.fronter}`);
  } else if (action.type === "log_activity") {
    const { category_id, duration_minutes } = action.config || {};
    if (!category_id) return;
    const cat = activityCategories.find((c) => c.id === category_id);
    await base44.entities.Activity.create({
      activity_name: cat?.name || "",
      activity_category_ids: [category_id],
      duration_minutes: duration_minutes || null,
      fronting_alter_ids: frontingAlterIds,
      emotions: [],
      notes: null,
      timestamp: now,
    });
    queryClient.invalidateQueries({ queryKey: ["activities"] });
    toast.success(`${cat?.name || "Activity"} logged`);
  } else if (action.type === "log_symptom") {
    const { symptom_id } = action.config || {};
    if (!symptom_id) return;
    const severity = extraData.severity ?? null;

    // ONE session write path (lib/symptomSessions) — reuses an active
    // session and folds any pre-fix duplicates instead of stacking more.
    await startSymptomSession(symptom_id, { startTime: now, severity });
    queryClient.invalidateQueries({ queryKey: ["symptomSessions"] });

    // Create a parent check-in to tie the symptom to fronting alters (mirrors QuickCheckInModal)
    let checkInId = null;
    if (frontingAlterIds.length > 0) {
      const parent = await base44.entities.EmotionCheckIn.create({
        timestamp: now,
        emotions: [],
        fronting_alter_ids: frontingAlterIds,
      }).catch(() => null);
      checkInId = parent?.id || null;
      if (checkInId) queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
    }
    await base44.entities.SymptomCheckIn.create({ symptom_id, severity, timestamp: now, check_in_id: checkInId });
    queryClient.invalidateQueries({ queryKey: ["symptomCheckIns"] });
    toast.success("Logged");
  } else if (action.type === "log_emotion") {
    const { emotion_label } = action.config || {};
    if (!emotion_label) return;
    await base44.entities.EmotionCheckIn.create({
      timestamp: now,
      emotions: [emotion_label],
      fronting_alter_ids: frontingAlterIds,
    });
    queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
    toast.success(`${emotion_label} logged`);
  } else if (action.type === "log_diary") {
    const { value } = extraData;
    const { group_id, field_data_key, field_label } = action.config || {};
    if (!group_id || !field_data_key || value === undefined || value === null) return;
    const cardData = {};
    if (group_id === "urges") {
      cardData.urges = { [field_data_key]: value };
    } else if (group_id === "body_mind") {
      cardData.body_mind = { [field_data_key]: value };
    } else if (group_id === "skills") {
      if (field_data_key === "skills_practiced") {
        cardData.skills_practiced = value;
      } else {
        cardData.medication_safety = { [field_data_key]: value };
      }
    }
    await base44.entities.DiaryCard.create({
      card_type: "daily",
      date: format(new Date(), "yyyy-MM-dd"),
      name: `Daily — ${format(new Date(), "MMM d, yyyy")}`,
      fronting_alter_ids: frontingAlterIds,
      emotions: [],
      ...cardData,
    });
    queryClient.invalidateQueries({ queryKey: ["diaryCards"] });
    toast.success(`${field_label || "Diary"} logged`);
  } else if (action.type === "log_location") {
    // OS-launcher shortcut path: executeQuickAction(qa) was called
    // with no extraData. The in-app LocationRow normally collects
    // category/name/coords first, but the OS shortcut bypasses it,
    // which previously produced a record literally named "Location"
    // with no GPS data. Pop the in-app quick actions sheet so the
    // user gets the pills + Get-GPS button before we save.
    if (!extraData || (extraData.category === undefined && extraData.name === undefined && extraData.coords === undefined)) {
      ctx.reopenMenu?.();
      return;
    }
    const { category, name, coords } = extraData;
    const catMeta = LOCATION_CATEGORIES.find(c => c.id === category);
    await localEntities.Location.create({
      timestamp: now,
      name: name?.trim() || catMeta?.label || "Location",
      category: category || "other",
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      source: coords ? "gps" : "manual",
    });
    queryClient.invalidateQueries({ queryKey: ["locations"] });
    toast.success("Location logged");
  } else if (action.type === "view_grocery_list") {
    window.dispatchEvent(new CustomEvent("open-grocery-list"));
  } else if (action.type === "add_grocery_item") {
    window.dispatchEvent(new CustomEvent("open-grocery-list", { detail: { focusInput: true } }));
  } else if (action.type === "toggle_daily_task") {
    // Mirrors handleToggle in DailyTaskRow (components/dashboard/QuickActionsMenu.jsx)
    // — the in-app quick-actions menu renders DailyTaskRow with its
    // own toggle button, but the OS-launcher shortcut path goes
    // through executeQuickAction directly and needs to do the same
    // work here. Without this case the shortcut tap appeared to do
    // nothing.
    const taskId = action.config?.task_id;
    if (!taskId) return;
    const templates = await base44.entities.DailyTaskTemplate.list("sort_order", 200);
    const tpl = templates.find(t => t.id === taskId);
    if (!tpl || tpl.mode !== "MANUAL") {
      toast.error("That daily task can't be toggled from a shortcut");
      return;
    }
    // The task's OWN period and reset rule — a weekly task used to be
    // filed under today's daily record here.
    const nowCompleted = await toggleTemplateDone(tpl, { templates });
    queryClient.invalidateQueries({ queryKey: ["dailyProgress"] });
    toast.success(
      nowCompleted
        ? (tpl.points > 0 ? `+${tpl.points} XP — ${tpl.title} done! 🎉` : `${tpl.title} done!`)
        : `${tpl.title} unchecked`
    );
  } else if (action.type === "start_activity") {
    // Minimal "start now" flow — no fronting/contact picker, mirrors
    // StartActivityModal's own minimal path via the same primitive.
    const { category_id } = action.config || {};
    if (!category_id) return;
    const cat = activityCategories.find((c) => c.id === category_id);
    addActiveActivity({
      categoryId: category_id,
      name: cat?.name || "Activity",
      color: cat?.color || null,
      startTime: now,
      alterIds: [],
      contactIds: [],
      notes: "",
    });
    toast.success(`▶ Started ${cat?.name || "activity"}`);
  } else if (action.type === "mark_contact_with") {
    const { contact_id } = action.config || {};
    if (!contact_id) return;
    const [activeEncounters, contacts] = await Promise.all([
      base44.entities.ContactEncounter.filter({ is_active: true }),
      base44.entities.Contact.list(),
    ]);
    const contact = contacts.find((c) => c.id === contact_id);
    const name = contact ? contactDisplayName(contact) : "contact";
    const existing = activeEncounters.find((e) => e.contact_id === contact_id);
    if (existing) {
      await endEncounterForContact(contact_id);
      toast.success(`Ended time with ${name}`);
    } else {
      await startEncounter(contact_id);
      toast.success(`Marked with ${name}`);
    }
    queryClient.invalidateQueries({ queryKey: ["contactEncounters"] });
  } else if (action.type === "toggle_sleep") {
    const sleepRecords = await base44.entities.Sleep.list();
    const inProgress = [...sleepRecords]
      .filter((s) => s.bedtime && !s.wake_time)
      .sort((a, b) => new Date(b.bedtime) - new Date(a.bedtime))[0] || null;
    if (inProgress) {
      // Minimal end — no quality/notes prompt (that's what SleepEndModal
      // is for). Matches the "no picker, one tap" spirit of quick actions.
      await base44.entities.Sleep.update(inProgress.id, { wake_time: now });
      toast.success("😴 Sleep ended");
    } else {
      await base44.entities.Sleep.create({
        date: format(new Date(), "yyyy-MM-dd"),
        bedtime: now,
      });
      toast.success("💤 Sleep started");
    }
    queryClient.invalidateQueries({ queryKey: ["sleep"] });
  } else if (action.type === "set_status_note") {
    // OS-launcher shortcut path has no extraData to prompt with — pop the
    // in-app sheet instead, same fallback log_location already uses.
    if (!extraData || extraData.text === undefined) {
      ctx.reopenMenu?.();
      return;
    }
    const text = (extraData.text || "").trim();
    if (!text) return;
    // StatusNote is an immutable log — always create, never update.
    const createdStatus = await localEntities.StatusNote.create({ timestamp: now, note: text });
    // @mentions notify like every other surface.
    const { saveStatusMentions } = await import("@/lib/mentionUtils");
    await saveStatusMentions({ note: text, alters, sourceId: createdStatus?.id, authorAlterId: currentAlterId });
    queryClient.invalidateQueries({ queryKey: ["mentionLogs"] });
    queryClient.invalidateQueries({ queryKey: ["statusNotes"] });
    toast.success("Status posted");
  } else if (action.type === "add_task") {
    if (!extraData || extraData.title === undefined) {
      ctx.reopenMenu?.();
      return;
    }
    const title = (extraData.title || "").trim();
    if (!title) return;
    await base44.entities.Task.create({ title, completed: false, priority: "medium" });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    toast.success("To-do added");
  } else if (action.type === "navigate_to_page") {
    const page = ALL_PAGES.find((p) => p.id === action.config?.page_id);
    if (page) ctx.navigate(page.path);
  }
}
