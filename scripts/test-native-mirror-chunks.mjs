// node scripts/test-native-mirror-chunks.mjs — chunked mirror writes keep
// every character (no emoji split across pieces) and rebuild exactly.
import assert from "node:assert/strict";
const { chunkText } = await import("../src/lib/nativeMirror.js").catch(async () => {
  // The module imports "@/lib/platform"; fall back to a copy of the helper.
  const src = (await import("node:fs")).readFileSync(new URL("../src/lib/nativeMirror.js", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export function chunkText"), src.indexOf("\n}\n", src.indexOf("export function chunkText")) + 2);
  return { chunkText: new Function(`${body.replace("export ", "")}; return chunkText;`)() };
});
const emoji = "💜";
const text = ("ab" + emoji).repeat(1000) + "x";
for (const size of [1, 2, 3, 5, 7, 512]) {
  const parts = chunkText(text, size);
  assert.equal(parts.join(""), text, `rebuilds at size ${size}`);
  for (const p of parts) {
    assert.ok(p.length <= Math.max(size, 2), "piece within size");
    const last = p.charCodeAt(p.length - 1);
    if (size > 1 && p !== parts[parts.length - 1]) assert.ok(!(last >= 0xd800 && last <= 0xdbff), "no dangling high surrogate");
  }
}
assert.deepEqual(chunkText("", 10), [""]);
assert.deepEqual(chunkText("abc", 10), ["abc"]);
console.log("native mirror chunks: ok");
