// Which alters a widget's scope means (v0.292.0). On an alter's profile
// the scope is that alter; on a group's, its members; on a location's, the
// alters placed there; a contact has no alters of its own. null means no
// scope — show everyone's, as on the home screen.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useWidgetScope } from "@/lib/boardSubject";
import { getMemberAlters } from "@/lib/subsystemUtils";

export function useScopeAlterIds(settings) {
  const scope = useWidgetScope(settings);
  const type = scope?.type || null;
  const id = scope?.id || null;
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(), enabled: !!type && type !== "alter" });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list(), enabled: type === "group" });
  return useMemo(() => {
    if (!type) return null;
    if (type === "alter") return [id];
    if (type === "group") {
      const g = groups.find((x) => String(x.id) === String(id) || (x.sp_id && String(x.sp_id) === String(id)));
      return g ? getMemberAlters(g, alters).map((a) => a.id) : [];
    }
    if (type === "location") return alters.filter((a) => a.inner_world_location_id === id).map((a) => a.id);
    return [];
  }, [type, id, alters, groups]);
}
