import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export const DEFAULT_TERMS = {
  system: "system",
  alter: "alter",
  alters: "alters",
  switch: "switch",
  front: "front",
  fronting: "fronting",
};

export function useTerms() {
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
    staleTime: 30000,
  });

  const s = settingsList[0] || {};

  const sys = s.term_system || DEFAULT_TERMS.system;
  const alt = s.term_alter || DEFAULT_TERMS.alter;
  const sw = s.term_switch || DEFAULT_TERMS.switch;
  const fr = s.term_front || DEFAULT_TERMS.front;

  return {
    system: sys,
    System: sys.charAt(0).toUpperCase() + sys.slice(1),
    alter: alt,
    Alter: alt.charAt(0).toUpperCase() + alt.slice(1),
    alters: alt + "s",
    Alters: alt.charAt(0).toUpperCase() + alt.slice(1) + "s",
    switch: sw,
    Switch: sw.charAt(0).toUpperCase() + sw.slice(1),
    front: fr,
    Front: fr.charAt(0).toUpperCase() + fr.slice(1),
    fronting: fr + "ing",
    Fronting: fr.charAt(0).toUpperCase() + fr.slice(1) + "ing",
    // raw settings id for saving
    _settingsId: s.id || null,
    _hasSettings: !!s.id,
  };
}