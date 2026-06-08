// User-configurable label mode for how alters appear in lists,
// dropdowns, and pickers throughout the app. Persisted on
// SystemSettings.alter_label_mode (singleton).
//
// Why three modes:
//   - name  — always show alter.name (the full form, including any
//             brackets / pronouns / decorations the user typed). Most
//             distinguishable; safest default when alters have
//             overlapping aliases.
//   - alias — show alter.alias when set, fall back to name. Compact
//             and what some surfaces used historically.
//   - both  — show "alias — name" when both exist. Verbose but
//             unambiguous in dense lists.

export const ALTER_LABEL_MODES = Object.freeze({
  NAME: "name",
  ALIAS: "alias",
  BOTH: "both",
});

export const DEFAULT_ALTER_LABEL_MODE = ALTER_LABEL_MODES.NAME;

export function isAlterLabelMode(v) {
  return v === ALTER_LABEL_MODES.NAME
    || v === ALTER_LABEL_MODES.ALIAS
    || v === ALTER_LABEL_MODES.BOTH;
}

// The emoji-as-alias mention token. When an alter has "use emoji as alias" on
// (and an emoji set), the emoji works as a mention / signpost token (@😀, -😀)
// just like an alias would. This is used by the mention resolver + the @
// autocomplete — NOT by the display label (the emoji shows as a visual prefix
// on chips/header instead, so the label keeps the readable alias text).
export function effectiveAlias(alter) {
  if (!alter) return "";
  if (alter.use_emoji_as_alias && alter.emoji) return String(alter.emoji).trim();
  return (alter.alias || "").trim();
}

export function formatAlterLabel(alter, mode = DEFAULT_ALTER_LABEL_MODE) {
  if (!alter) return "";
  const name = (alter.name || "").trim();
  const alias = (alter.alias || "").trim();
  const m = isAlterLabelMode(mode) ? mode : DEFAULT_ALTER_LABEL_MODE;
  if (m === ALTER_LABEL_MODES.ALIAS) return alias || name;
  if (m === ALTER_LABEL_MODES.BOTH) {
    if (alias && name && alias !== name) return `${alias} — ${name}`;
    return name || alias;
  }
  // NAME (default)
  return name || alias;
}
