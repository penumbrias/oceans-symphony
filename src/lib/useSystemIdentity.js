import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";

/**
 * Reads the user's system identity (display name + avatar) from
 * SystemSettings so anywhere the app renders "System" / "System-wide"
 * as an author can show the user's chosen name + picture instead of
 * the generic placeholder.
 *
 * Returns { name, avatarUrl, hasCustomName } where name falls back to
 * a localised `${terms.System}-wide` label, and avatarUrl is null when
 * the user hasn't uploaded one yet.
 */
export function useSystemIdentity() {
  const terms = useTerms();
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const s = settingsList[0] || {};
  const name = (s.system_name && s.system_name.trim()) || `${terms.System}-wide`;
  return {
    name,
    avatarUrl: s.system_avatar_url || null,
    hasCustomName: !!(s.system_name && s.system_name.trim()),
  };
}
