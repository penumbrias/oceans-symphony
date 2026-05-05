const LS_FONT_SIZE = "symphony_a11y_fontSize";
const LS_REDUCE_MOTION = "symphony_a11y_reduceMotion";
const LS_HIGH_CONTRAST = "symphony_a11y_highContrast";
const LS_LARGE_TOUCH = "symphony_a11y_largeTouch";

const FONT_CLASSES = ["a11y-text-sm", "a11y-text-lg", "a11y-text-xl"];
const TOUCH_CLASSES = ["a11y-touch-comfortable", "a11y-touch-large"];

function applyFontSize(value) {
  const el = document.documentElement;
  FONT_CLASSES.forEach(c => el.classList.remove(c));
  if (value && value !== "default") el.classList.add(`a11y-text-${value}`);
}

function applyReduceMotion(enabled) {
  document.documentElement.classList.toggle("a11y-reduce-motion", !!enabled);
}

function applyHighContrast(enabled) {
  document.documentElement.classList.toggle("a11y-high-contrast", !!enabled);
}

function applyLargeTouch(value) {
  const el = document.documentElement;
  TOUCH_CLASSES.forEach(c => el.classList.remove(c));
  if (value && value !== "default") el.classList.add(`a11y-touch-${value}`);
}

export function initAccessibility() {
  applyFontSize(localStorage.getItem(LS_FONT_SIZE) || "default");
  applyReduceMotion(localStorage.getItem(LS_REDUCE_MOTION) === "true");
  applyHighContrast(localStorage.getItem(LS_HIGH_CONTRAST) === "true");
  applyLargeTouch(localStorage.getItem(LS_LARGE_TOUCH) || "default");
}

export function getAccessibilitySettings() {
  return {
    fontSize: localStorage.getItem(LS_FONT_SIZE) || "default",
    reduceMotion: localStorage.getItem(LS_REDUCE_MOTION) === "true",
    highContrast: localStorage.getItem(LS_HIGH_CONTRAST) === "true",
    largeTouch: localStorage.getItem(LS_LARGE_TOUCH) || "default",
  };
}

export function setAccessibilityFontSize(value) {
  localStorage.setItem(LS_FONT_SIZE, value);
  applyFontSize(value);
}

export function setAccessibilityReduceMotion(enabled) {
  localStorage.setItem(LS_REDUCE_MOTION, String(enabled));
  applyReduceMotion(enabled);
}

export function setAccessibilityHighContrast(enabled) {
  localStorage.setItem(LS_HIGH_CONTRAST, String(enabled));
  applyHighContrast(enabled);
}

export function setAccessibilityLargeTouch(value) {
  localStorage.setItem(LS_LARGE_TOUCH, value);
  applyLargeTouch(value);
}
