// "a" or "an" before a word the person chose (v0.370.3). Their words replace
// "alter", "system", "front"… so a hardcoded "an ${t.alter}" reads "an part"
// and "a ${t.fronting}" reads "a influencing". Use these instead:
//   `Add ${an(t.alter)}`  → "Add an alter" / "Add a part"
//   `${An(t.alter)} you pick` → "An alter you pick" / "A part you pick"
// Pure and small; useTerms also hands them out as t.an / t.An.

const AN_EXCEPTIONS = /^(hour|honest|honou?r|heir)/i;            // silent h: "an hour"
const A_EXCEPTIONS = /^(uni|use|usu|uti|ure|uro|eu|ewe|one\b|once|ubiq|u[bcdfgklmnprstvz][aeiou])/i; // "a unit", "a one-off"

export function article(word) {
  const w = String(word ?? "").trim().replace(/^[^A-Za-z0-9]+/, "");
  if (!w) return "a";
  if (AN_EXCEPTIONS.test(w)) return "an";
  if (/^[aeiou]/i.test(w)) return A_EXCEPTIONS.test(w) ? "a" : "an";
  // Spelled-out letters/numbers: "an 8", "an 11", "an MRI" stay rare here.
  if (/^(8|11|18)\b/.test(w)) return "an";
  return "a";
}

export const an = (word) => `${article(word)} ${word}`;
export const An = (word) => { const a = article(word); return `${a[0].toUpperCase()}${a.slice(1)} ${word}`; };
