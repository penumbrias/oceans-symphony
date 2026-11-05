// The words and symbol of the inline command grammar, as the person set
// them in Settings → Terminology (v0.353.0).
//
//   command symbol   "~" by default — starts a ~command ("~feeling:calm")
//   command words    one extra word per command type ("~mood" for feeling).
//                    The built-in words ALWAYS keep working, so text and
//                    habits from before a change still log the same way.
//   whisper word     one extra word after "/" ("/psst @name …"); "/w" and
//                    "/whisper" keep working.
//
// The ~therapy word has lived in therapyCommand.js since before this file
// (localStorage); Terminology edits it there.
//
// Stored on SystemSettings (`command_sign`, `command_words`, `whisper_word`)
// so it syncs and backs up with the other terms. useTerms() pushes the
// saved values in here on every render (configureCommandTerms is a no-op
// when nothing changed), the same way the signpost symbols reach the
// signpost parser — the parsers are plain functions, not hooks.

export const DEFAULT_COMMAND_SIGN = "~";

// The command types a word can be set for, in the order Terminology lists
// them. Keys match COMMAND_TYPES in logCommands.js.
export const COMMAND_WORD_TYPES = [
  { key: "symptom", label: "Symptom", example: "anxiety:3" },
  { key: "habit", label: "Habit", example: "water" },
  { key: "feeling", label: "Feeling", example: "calm" },
  { key: "company", label: "Company", example: "emma" },
  { key: "activity", label: "Activity", example: "reading:30m" },
  { key: "journal", label: "Journal", example: "body[dear diary]" },
];

// Built-in words, kept here too so the settings form can refuse a custom
// word that already means another command (logCommands imports nothing
// from the form, and this file imports nothing, so there is no cycle).
export const BUILT_IN_COMMAND_WORDS = {
  symptom: ["symptom", "symptoms", "sym"],
  habit: ["habit", "habits"],
  feeling: ["feeling", "feelings", "emotion", "emotions", "mood", "feel"],
  company: ["company", "with", "contact", "contacts"],
  activity: ["activity", "activities", "act"],
  journal: ["journal", "journals", "entry", "j"],
};
export const BUILT_IN_WHISPER_WORDS = ["w", "whisper"];

// Symbols that already mean something in the grammar or in stored rich
// text, so they can't start a command.
const RESERVED_COMMAND_SIGNS = new Set(["@", "/", "[", "]", "<", ">", ":", "&", ";", "\"", "'", "="]);

// Letters, digits, "-" and "_" only — a space or ":" would collide with the
// grammar itself. Same rule as the ~therapy word.
export function sanitizeCommandWord(raw) {
  return String(raw || "").trim().toLowerCase().replace(/^[~/]+/, "").replace(/[^a-z0-9_-]/g, "");
}

// A command symbol is one character that isn't a letter, digit or space,
// isn't one of the reserved symbols, and isn't a signpost symbol.
export function isValidCommandSign(ch, { signpostAdd = "+", signpostReplace = "-" } = {}) {
  return typeof ch === "string" && ch.length === 1 && !/[\w\s]/.test(ch)
    && !RESERVED_COMMAND_SIGNS.has(ch) && ch !== signpostAdd && ch !== signpostReplace;
}

let SIGN = DEFAULT_COMMAND_SIGN;
let WORDS = {};
let WHISPER = "";
let SIG = "";

function cleanWords(words) {
  const out = {};
  if (words && typeof words === "object") {
    for (const { key } of COMMAND_WORD_TYPES) {
      const w = sanitizeCommandWord(words[key]);
      if (w) out[key] = w;
    }
  }
  return out;
}

export function configureCommandTerms({ sign, words, whisper } = {}) {
  const s = typeof sign === "string" && isValidCommandSign(sign.trim(), { signpostAdd: "", signpostReplace: "" }) ? sign.trim() : DEFAULT_COMMAND_SIGN;
  const w = cleanWords(words);
  const wh = sanitizeCommandWord(whisper);
  const sig = JSON.stringify([s, w, wh]);
  if (sig === SIG) return;
  SIG = sig;
  SIGN = s;
  WORDS = w;
  WHISPER = BUILT_IN_WHISPER_WORDS.includes(wh) ? "" : wh;
}

export function getCommandSign() { return SIGN; }

// The person's own word for a type, or null.
export function getCustomCommandWord(type) { return WORDS[type] || null; }

// The word to show and insert for a type: the person's own, else the key.
export function getCommandWord(type) { return WORDS[type] || type; }

// Every word that starts a whisper (built-ins first, the person's own last).
export function getWhisperWords() {
  return WHISPER ? [...BUILT_IN_WHISPER_WORDS, WHISPER] : BUILT_IN_WHISPER_WORDS;
}

// The word to show in whisper hints ("/psst @name …").
export function getWhisperWord() { return WHISPER || "w"; }

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function whisperWordPattern() {
  return getWhisperWords().map(escapeRegex).sort((a, b) => b.length - a.length).join("|");
}
