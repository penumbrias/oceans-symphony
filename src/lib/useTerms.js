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
    staleTime: 0,
  });

  const s = settingsList[0] || {};

  const sys = s.term_system || DEFAULT_TERMS.system;
  const alt = s.term_alter || DEFAULT_TERMS.alter;
  const sw = s.term_switch || DEFAULT_TERMS.switch;
  const fr = s.term_front || DEFAULT_TERMS.front;

  const altCap = alt.charAt(0).toUpperCase() + alt.slice(1);
  const frCap = fr.charAt(0).toUpperCase() + fr.slice(1);
  const swCap = sw.charAt(0).toUpperCase() + sw.slice(1);
  const sysCap = sys.charAt(0).toUpperCase() + sys.slice(1);

  return {
    system: sys,
    System: sysCap,
    alter: alt,
    Alter: altCap,
    alters: alt + "s",
    Alters: altCap + "s",
    switch: sw,
    Switch: swCap,
    front: fr,
    Front: frCap,
    fronting: fr + "ing",
    Fronting: frCap + "ing",
    // co-fronter = a co-fronting alter
    cofronter: `co-${alt}`,
    Cofronter: `Co-${altCap}`,
    cofronters: `co-${alt}s`,
    Cofronters: `Co-${altCap}s`,
    // co-fronting = the act
    cofronting: `co-${fr}ing`,
    Cofronting: `Co-${frCap}ing`,
    // raw settings id for saving
    _settingsId: s.id || null,
    _hasSettings: !!s.id,
  };
}