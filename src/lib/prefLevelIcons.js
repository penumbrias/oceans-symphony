// The icon for each comfort level of a preference (hate → love), v0.320.0.
//
// Defaults are flat line icons (a tester asked for flat, not emoji); hate
// is an angry face — the old broken heart looked just like the filled
// heart once selected. Each level's icon can be set to any emoji or short
// text, kept on SystemSettings.pref_level_icons as { "1": "😠", … }, so it
// syncs and is in backups and every surface (profile widgets, Friends, the
// level picker) shows the same one.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Angry, ThumbsDown, Minus, ThumbsUp, Heart } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

export const DEFAULT_PREF_ICONS = { 1: Angry, 2: ThumbsDown, 3: Minus, 4: ThumbsUp, 5: Heart };
// Emoji suggestions offered beside each level's box.
export const PREF_ICON_SUGGESTIONS = { 1: ["😠", "💔", "🚫"], 2: ["👎", "😕", "🙁"], 3: ["😐", "🤷", "➖"], 4: ["👍", "🙂", "✨"], 5: ["❤️", "😍", "💖"] };

// A custom icon is a short string (an emoji or a character or two);
// anything else is ignored so a bad import can't break the picker.
export function customPrefIcon(map, level) {
  const v = map?.[level] ?? map?.[String(level)];
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && [...s].length <= 3 ? s : null;
}

export function usePrefLevelIcons() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const settings = pickPrimarySystemSettings(rows) || null;
  const map = settings?.pref_level_icons && typeof settings.pref_level_icons === "object" ? settings.pref_level_icons : {};
  // One write for any number of levels (a fresh read first, so two quick
  // changes never overwrite each other).
  const setIcons = async (patch) => {
    const fresh = pickPrimarySystemSettings(await base44.entities.SystemSettings.list());
    const current = fresh?.pref_level_icons && typeof fresh.pref_level_icons === "object" ? { ...fresh.pref_level_icons } : {};
    for (const [level, text] of Object.entries(patch)) {
      const s = (text || "").trim();
      if (s) current[String(level)] = s; else delete current[String(level)];
    }
    if (fresh?.id) await base44.entities.SystemSettings.update(fresh.id, { pref_level_icons: current });
    else await base44.entities.SystemSettings.create({ pref_level_icons: current });
    qc.invalidateQueries({ queryKey: ["systemSettings"] });
  };
  const setIcon = (level, text) => setIcons({ [level]: text });
  return { icons: map, setIcon, setIcons };
}
