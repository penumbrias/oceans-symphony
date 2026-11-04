// One line of plain text from a note written in the shared text box (v0.347.3).
//
// Text boxes carry the formatting toolbar, so a saved note can hold the tags
// it writes, a ||censor bar|| or a whisper span. Previews that build a plain
// string (pills, truncated one-liners, labels) go through here: formatting
// dropped, whisper secrets hidden, censored words masked. Full displays use
// RichText instead.
import { redactWhispers } from "@/lib/whisperRedact";

export function plainNoteText(text) {
  if (!text || typeof text !== "string") return "";
  return redactWhispers(text)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\|\|([^|]+?)\|\|/g, "▒▒▒")
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}
