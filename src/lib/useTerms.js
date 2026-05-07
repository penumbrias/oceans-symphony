import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { base44 } from "@/api/base44Client";

export const DEFAULT_TERMS = {
  system: "system",
  alter: "alter",
  alters: "alters",
  switch: "switch",
  front: "front",
  fronting: "fronting",
};

// Pluralize helper with basic English rules
function pluralize(word) {
  if (!word) return word;
  if (word.endsWith('s')) return word; // already plural — don't double-pluralize
  if (word.endsWith('y')) return word.slice(0, -1) + 'ies';
  if (word.endsWith('ch') || word.endsWith('sh') || word.endsWith('x') || word.endsWith('z')) return word + 'es';
  return word + 's';
}

// Capitalize first letter
function capitalize(word) {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// Gerund helper: word → word + "ing" with basic English rules
function gerund(word) {
  if (!word) return word;
  // Drop silent 'e' and add 'ing' (but not 'ee' words)
  if (word.endsWith('e') && !word.endsWith('ee')) {
    return word.slice(0, -1) + 'ing';
  }
  // For simple single-syllable CVC, double final consonant (but keep simple)
  // e.g., "run" -> "running". We'll skip this for now to keep simple.
  return word + 'ing';
}

export function useTerms() {
  const { data: settingsList = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
    staleTime: 0,
  });

  const s = settingsList[0] || {};

  // Defensive fallback: use defaults if empty/missing
  const safe = (val, fallback) => (val && val.trim()) ? val.trim() : fallback;
  
  const sys = safe(s.term_system, DEFAULT_TERMS.system);
  const alt = safe(s.term_alter, DEFAULT_TERMS.alter);
  const sw = safe(s.term_switch, DEFAULT_TERMS.switch);
  const fr = safe(s.term_front, DEFAULT_TERMS.front);

  // Memoize derived terms to avoid rebuilds
  const terms = useMemo(() => {
    // System variants
    const system_lower = sys;
    const System_cap = capitalize(sys);
    const systems_lower = pluralize(sys);
    const Systems_cap = capitalize(systems_lower);

    // Alter variants
    const alter_lower = alt;
    const Alter_cap = capitalize(alt);
    const alters_lower = pluralize(alt);
    const Alters_cap = capitalize(alters_lower);

    // Switch variants
    const switch_lower = sw;
    const Switch_cap = capitalize(sw);
    const switches_lower = pluralize(sw);
    const Switches_cap = capitalize(switches_lower);
    const switching_lower = gerund(sw);
    const Switching_cap = capitalize(switching_lower);

    // Front variants
    const front_lower = fr;
    const Front_cap = capitalize(fr);
    const fronts_lower = pluralize(fr);
    const Fronts_cap = capitalize(fronts_lower);
    const fronting_lower = gerund(fr);
    const Fronting_cap = capitalize(fronting_lower);
    const fronter_lower = fr + 'er';
    const Fronter_cap = capitalize(fronter_lower);
    const fronters_lower = pluralize(fronter_lower);
    const Fronters_cap = capitalize(fronters_lower);

    // Co-fronter variants
    const cofronter_lower = `co-${alter_lower}`;
    const Cofronter_cap = `Co-${Alter_cap}`;
    const cofronters_lower = pluralize(cofronter_lower);
    const Cofronters_cap = capitalize(cofronters_lower);
    const cofronting_lower = `co-${fronting_lower}`;
    const Cofronting_cap = `Co-${Fronting_cap}`;

    return {
      // System
      system: system_lower,
      System: System_cap,
      systems: systems_lower,
      Systems: Systems_cap,

      // Alter
      alter: alter_lower,
      Alter: Alter_cap,
      alters: alters_lower,
      Alters: Alters_cap,

      // Switch
      switch: switch_lower,
      Switch: Switch_cap,
      switches: switches_lower,
      Switches: Switches_cap,
      switching: switching_lower,
      Switching: Switching_cap,

      // Front
      front: front_lower,
      Front: Front_cap,
      fronts: fronts_lower,
      Fronts: Fronts_cap,
      fronting: fronting_lower,
      Fronting: Fronting_cap,
      fronter: fronter_lower,
      Fronter: Fronter_cap,
      fronters: fronters_lower,
      Fronters: Fronters_cap,

      // Co-fronter
      cofronter: cofronter_lower,
      Cofronter: Cofronter_cap,
      cofronters: cofronters_lower,
      Cofronters: Cofronters_cap,
      cofronting: cofronting_lower,
      Cofronting: Cofronting_cap,

      // Raw settings id for saving
      _settingsId: s.id || null,
      _hasSettings: !!s.id,
    };
  }, [sys, alt, sw, fr, s.id]);

  return terms;
}