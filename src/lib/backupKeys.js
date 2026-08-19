// Single source of truth for the localStorage keys that should round-
// trip through a backup (manual export + auto-backup + on-device raw
// snapshot). Duplicating this list across files is exactly how keys
// get silently dropped — see the changelog around 0.11.7 for the
// 8 keys (os_journal_folders, etc.) that were missing for months.
//
// CLAUDE.md rule: when you reach for localStorage.setItem to persist
// user data or a user-set preference, decide once whether it belongs
// in a backup, and add it HERE if so. Skip:
//   - onboarding flags (tour_seen, terms_setup_done)
//   - UI dismissal state (*_dismissed, *_hint_seen, iw_panel_open)
//   - runtime caches (preview_open, friends_front_snapshots)
//   - per-device encryption config (KEYS.encEnabled / encSalt / mode)
//   - per-device push registration metadata

export const BACKUP_LS_KEYS = [
  "symphony_newui_banner_dismissed_v1",
  "symphony_themeMode",
  "symphony_selectedTheme",
  "symphony_customColors",
  "symphony_selectedFont",
  "symphony_userCustomPresets",
  "symphony_alterThemeLinks",
  "symphony_a11y_fontSize",
  "symphony_a11y_fontFamily",
  "symphony_a11y_headingFont",
  "symphony_a11y_reduceMotion",
  "symphony_a11y_highContrast",
  "symphony_a11y_largeTouch",
  "symphony_a11y_navHeight",
  "alter_hide_grouped",
  "alter_grid_cols",
  "alter_display_mode",
  "nav_grid_layout",
  "nav_grid_cols",
  "nav_display_mode",
  "os_journal_folders",
  "symphony_checkin_log_display",
  "symphony_act_view_mode",
  "symphony_polls_default_tally_mode",
  "symphony_grounding_step_mode",
  "symphony_autobackup_interval_days",
  // Auto-backup mode / destination / last-success + the health log: a
  // localStorage wipe used to silently turn auto-backup OFF and erase the
  // record of the last backup. Durable via the settings mirror now.
  "symphony_autobackup_mode",
  "symphony_autobackup_destination",
  "symphony_autobackup_last_at",
  "symphony_backup_health_v1",
  "grocery_lock_on_close_v1",
  // View / mode preferences — small but user-set, so they should ride
  // along to a new device with the rest of the backup.
  "alter_show_folders",
  "alter_show_subsystems",
  "getknow_hide_custom_fields_v1",
  "symphony_bulletin_rich_mode",
  "symphony_bulletin_comment_rich_mode",
  "symphony_pk_use_display_name",
  // Activity-grid display settings (row height, column width, time steps,
  // week start, clock format, tick style, quick-plans toggle) — the user
  // tuned these by hand; a new device should look the same.
  "symphony_act_row_h",
  "symphony_act_col_w",
  "symphony_act_interval",
  "symphony_act_week_start",
  "symphony_act_time_fmt",
  "symphony_act_tick_mode",
  "symphony_act_quick_plans",
  // v2 chrome state the user set deliberately.
  "symphony_v2_quickactions_open",
  "symphony_v2_dock_open",
  // Alters-page view preferences.
  "alter_groups_display_mode",
  // v0.180.0 audit sweep — user-set preferences that were silently
  // resetting on a localStorage wipe (each is the same tier as keys
  // already listed; see the audit notes in that release's commit).
  "symphony_a11y_mode",
  "symphony_locale",
  "symphony_plan_reminders_enabled",
  "symphony_plan_reminders_default_offset",
  "symphony_persist_notif_fronters_v1",
  "symphony_persist_notif_symptoms_v1",
  "symphony_persist_notif_activity_v1",
  "symphony_pinned_daily_tasks_prefs_v1",
  "symphony_grounding_button_enabled_v1",
  "symphony_grounding_btn_pos",
  "symphony_insights_muted_kinds_v1",
  "symphony_infer_presence_from_authorship",
  "symphony_infer_presence_window_min",
  "symphony_timeline_row_h",
  "symphony_planner_alter_sort",
  "symphony_planner_who_grouped",
  "symphony_planner_overlays_v1",
  "symphony_dailytasks_hide_completed_v1",
  "symphony_emotion_picker_mode",
  "symphony_analyticsGrouping",
  "symphony_anonymize_mode",
  "symphony_display_options_dock",
  "symphony_page_tutorials_enabled_v1",
  // Unlocked-grocery lists are REAL user content that lived only in
  // localStorage. Mirrored so a wipe can't take them; kept out of portable
  // exports (see MIRROR_ONLY_KEYS) per the panic-cover design.
  "grocery_unlocked_store_v1",
];

// Keys that are mirrored on-device (survive a localStorage wipe) but are
// deliberately NOT written into portable backup files.
export const MIRROR_ONLY_KEYS = new Set([
  "grocery_unlocked_store_v1",
]);

export function readBackupLocalSettings() {
  const out = {};
  for (const key of BACKUP_LS_KEYS) {
    if (MIRROR_ONLY_KEYS.has(key)) continue;
    try {
      const val = localStorage.getItem(key);
      if (val !== null) out[key] = val;
    } catch { /* localStorage disabled — skip key */ }
  }
  return out;
}

export function writeBackupLocalSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  // Iterate the FILE's keys, not this build's allow-list (v0.95.2): a
  // backup from a newer app version can carry preference keys this build
  // doesn't know yet — dropping them silently meant "import the same file
  // again after updating found more settings". The allow-list still gates
  // what gets EXPORTED; on import the file is trusted (its keys were
  // allow-listed by the exporting build). Matches RecoveryScreen /
  // StorageModeSetup, which already restore all keys.
  for (const [key, value] of Object.entries(settings)) {
    if (value != null) {
      try { localStorage.setItem(key, value); }
      catch { /* quota / disabled — skip */ }
    }
  }
}
