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
//   - the backup DECISION (symphony_backup_decision_v1) — re-asking after
//     a wipe is the right outcome
//   - the custom backup-file password (symphony_autobackup_pw_v1) — a
//     mirrored copy would land inside the very file it locks, and inside
//     every plain export

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
  // Backup-file locking mode + file-name prefix (v0.240.0). The password
  // itself is intentionally absent — see the header.
  "symphony_autobackup_encrypt",
  "symphony_autobackup_name_v1",
  "symphony_autobackup_last_at",
  "symphony_backup_health_v1",
  "grocery_lock_on_close_v1",
  "grocery_note_open_mode_v1",
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
  "symphony_quickcheckin_slider_enabled_v1",
  "symphony_quickcheckin_slider_symptom_v1",
  "symphony_analyticsGrouping",
  "symphony_anonymize_mode",
  "symphony_display_options_dock",
  "symphony_page_tutorials_enabled_v1",
  // Unlocked-grocery lists are REAL user content that lived only in
  // localStorage. Mirrored so a wipe can't take them, and in backups too
  // (owner, 2026-10-01: "all need to be in the backups") — merged list by
  // list on import, see writeBackupLocalSettings.
  "grocery_unlocked_store_v1",
  // Self-hosted relay host (src/lib/apiBase.js). A user who points the app
  // at their own Friends/reminder relay should keep pointing there after a
  // restore on a new device — the alternative is silently falling back to
  // the default relay, where their friend codes don't exist.
  "symphony_api_host",
  // Upcoming-plans "how many to show" (src/lib/upcomingPlansLimit.js) and
  // the installed extra font packs (src/lib/fontPacks.js) — user
  // preferences that used to vanish on an Android cache clear.
  "upcoming_plans_limit_mode",
  "upcoming_plans_limit_count",
  "upcoming_plans_limit_window",
  "symphony_extra_fonts_installed_v1",
  // Audit 2026-10-01 (M10): user-set preferences that never reached a
  // backup. asset_folder_order_v1 is the ONLY home of empty asset folders.
  "asset_folder_order_v1",
  "activity_unresolved_nag_v1",
  "bulletin_dashboard_batch_size",
  "alter_card_header_bg",
  "symphony_planner_lane_opacity",
  "symphony_planner_time_mode",
  "symphony_presets_theme_restyles_widgets",
  "symphony_options_peek_h",
  "symphony_alterDropdown_grouped",
  "symphony_alterSearchSelect_grouped",
  "setFrontModal_view",
  "symphony_look_history_v1",
  "symphony_last_bulletin_authors_v1",
  // Sort choices of every alter list/picker (useAlterSorter keys).
  "alterAssignChip_sort", "alterDropdown_sort", "alterSearchSelect_sort",
  "alterTree_sort", "fronterPicker_sort", "groupMembers_sort",
  "pageAudience_sort", "setFrontModal_sort", "setFront_sort",
  "symphony_checkin_alter_sort", "symphony_planner_alter_sort",
  // Running activity timers + their end reminder, and dismissed critical
  // pins / plan banners (audit 2026-10-01, L1) — a restore used to drop the
  // running timers and bring every dismissed banner back.
  "symphony_active_activities_v1", "symphony_active_end_reminder_v1",
  "symphony_critical_pin_dismissals", "symphony_upcoming_plan_acks",
];

// Keys stored once per record (the key ends in an id). Matched by prefix.
export const BACKUP_LS_PREFIXES = [
  "symphony_alter_inherit_history_v1_",
];

const BACKUP_LS_KEY_SET = new Set(BACKUP_LS_KEYS);
export const isBackupLsKey = (key) =>
  typeof key === "string" && (BACKUP_LS_KEY_SET.has(key) || BACKUP_LS_PREFIXES.some((p) => key.startsWith(p)));

// Every backed-up key that exists right now: the fixed list plus any
// prefix-matched keys found in localStorage.
export function presentBackupLsKeys() {
  const keys = [...BACKUP_LS_KEYS];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && !BACKUP_LS_KEY_SET.has(k) && BACKUP_LS_PREFIXES.some((p) => k.startsWith(p))) keys.push(k);
    }
  } catch { /* storage off */ }
  return keys;
}

// Keys that are mirrored on-device (survive a localStorage wipe) but are
// deliberately NOT written into portable backup files. (Empty since
// v0.248.4 — the unlocked grocery lists now travel too.)
export const MIRROR_ONLY_KEYS = new Set([]);

// Keys whose value is a collection the import MERGES into this device's
// copy (union by id, this device's records kept) instead of replacing it.
const MERGED_ON_IMPORT = {
  grocery_unlocked_store_v1(localRaw, fileRaw) {
    const parse = (r) => { try { const v = JSON.parse(r); return v && typeof v === "object" ? v : null; } catch { return null; } };
    const mine = parse(localRaw);
    const theirs = parse(fileRaw);
    if (!theirs) return localRaw;
    if (!mine) return fileRaw;
    const out = { ...theirs, ...mine };
    for (const k of ["lists", "items", "favorites"]) {
      const have = Array.isArray(mine[k]) ? mine[k] : [];
      const ids = new Set(have.map((r) => r?.id));
      out[k] = [...have, ...(Array.isArray(theirs[k]) ? theirs[k] : []).filter((r) => r?.id && !ids.has(r.id))];
    }
    return JSON.stringify(out);
  },
};

export function readBackupLocalSettings() {
  const out = {};
  for (const key of presentBackupLsKeys()) {
    if (MIRROR_ONLY_KEYS.has(key)) continue;
    try {
      const val = localStorage.getItem(key);
      if (val !== null) out[key] = val;
    } catch { /* localStorage disabled — skip key */ }
  }
  return out;
}

// Never taken from a backup file, whatever the file says (audit
// 2026-10-01, M4/L12). The import trusts unknown keys so a newer build's
// preferences survive — but these belong to THIS device:
//   - sync identity + state (a cloned device id makes two devices
//     overwrite each other's sync file), storage mode / encryption,
//     the systems registry, native notification-id logs
//   - the backup decision and backup password
//   - the backup health log / last-backup time: they describe the OTHER
//     device's backups, and would hide that this one has none yet
//   (The backup LOCK MODE is deliberately NOT here: dropping it turned a
//   user's locked backups into plain files on the new device. Without the
//   password there, backups stop with "set your backup password" — they
//   fail closed, never plaintext. Review 2026-10-01, M5.)
const IMPORT_DENY_PREFIXES = ["symphony_sync_", "symphony_enc_"];
const IMPORT_DENY_KEYS = new Set([
  "symphony_storage_mode", "symphony_local_user", "symphony_systems_registry",
  "symphony_active_system_id",
  "symphony_native_reminder_log_v1", "symphony_plan_reminder_log_v1",
  "symphony_server_reminder_push_active_v1", "symphony_session_cleanup_v1",
  "symphony_backup_decision_v1", "symphony_autobackup_pw_v1",
  "symphony_autobackup_last_at", "symphony_backup_health_v1",
]);
export const isImportableSettingKey = (key) =>
  typeof key === "string" && !IMPORT_DENY_KEYS.has(key) && !IMPORT_DENY_PREFIXES.some((p) => key.startsWith(p));

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
    if (!isImportableSettingKey(key)) continue;
    if (value != null && MERGED_ON_IMPORT[key]) {
      try { localStorage.setItem(key, MERGED_ON_IMPORT[key](localStorage.getItem(key), value)); }
      catch { /* quota / disabled — skip */ }
      continue;
    }
    if (value != null) {
      try { localStorage.setItem(key, value); }
      catch { /* quota / disabled — skip */ }
    }
  }
}
