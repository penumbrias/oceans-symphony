const LS_KEY = "symphony_system_distress";

const DEFAULT_DISTRESS = [
  "anxious", "overwhelmed", "panicked", "scared", "terrified",
  "crisis", "unsafe", "dissociated", "numb", "frozen", "fearful",
  "hopeless", "worthless", "rejected", "excluded", "insecure",
  "desperate", "panic", "worried", "paralysed",
];

export function loadSystemDistressSet() {
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored !== null) return new Set(JSON.parse(stored));
    return new Set(DEFAULT_DISTRESS);
  } catch {
    return new Set(DEFAULT_DISTRESS);
  }
}

export function saveSystemDistressSet(set) {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...set])); } catch {}
}
