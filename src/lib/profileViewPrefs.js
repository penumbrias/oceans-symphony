// How profile pages behave while someone is just reading them (v0.361.0).
//
// People coming from the old profile found the widget board jumpy: holding
// anywhere started a layout edit, the old pencil form was buried, and
// nothing said which mode they were in. These three answers live on
// SystemSettings, so they sync between devices and travel in backups.
//
//   profile_hold_to_edit     true = holding a widget on a profile starts a
//                            layout edit (off by default; the pencil always does)
//   alter_classic_edit_form  true = the profile's Info button opens the older
//                            single-page form instead of the Info sheet
//   profile_welcome_seen     true = the one-time "how this page works" card
//                            has been answered
//
// Every write reads the settings row fresh and sends only its own field.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

export const PROFILE_VIEW_FIELDS = {
  holdToEdit: "profile_hold_to_edit",
  classicForm: "alter_classic_edit_form",
  welcomeSeen: "profile_welcome_seen",
};

export function readProfileViewPrefs(settings) {
  return {
    holdToEdit: settings?.[PROFILE_VIEW_FIELDS.holdToEdit] === true,
    classicForm: settings?.[PROFILE_VIEW_FIELDS.classicForm] === true,
    welcomeSeen: settings?.[PROFILE_VIEW_FIELDS.welcomeSeen] === true,
  };
}

export async function setProfileViewPref(key, value) {
  const field = PROFILE_VIEW_FIELDS[key];
  if (!field) throw new Error(`Unknown profile view setting: ${key}`);
  const fresh = pickPrimarySystemSettings(await base44.entities.SystemSettings.list());
  if (fresh?.id) return base44.entities.SystemSettings.update(fresh.id, { [field]: !!value });
  return base44.entities.SystemSettings.create({ [field]: !!value });
}

// The prefs plus a setter that refreshes the shared settings query.
export function useProfileViewPrefs() {
  const qc = useQueryClient();
  const { data: rows = [], isFetched } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const prefs = readProfileViewPrefs(pickPrimarySystemSettings(rows));
  const set = async (key, value) => {
    await setProfileViewPref(key, value);
    await qc.invalidateQueries({ queryKey: ["systemSettings"] });
  };
  return { ...prefs, loaded: isFetched, set };
}
