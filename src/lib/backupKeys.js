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
  "grocery_lock_on_close_v1",
];

export function readBackupLocalSettings() {
  const out = {};
  for (const key of BACKUP_LS_KEYS) {
    try {
      const val = localStorage.getItem(key);
      if (val !== null) out[key] = val;
    } catch { /* localStorage disabled — skip key */ }
  }
  return out;
}

export function writeBackupLocalSettings(settings) {
  if (!settings || typeof settings !== "object") return;
  for (const key of BACKUP_LS_KEYS) {
    if (settings[key] != null) {
      try { localStorage.setItem(key, settings[key]); }
      catch { /* quota / disabled — skip */ }
    }
  }
}
