// Setup packs: picture references hidden inside strings (custom CSS, rich
// text, nested style layers) never leave in a pack, and an import from an
// older build that still carries them is cleaned instead of refused.
//   node scripts/test-setup-pack-privacy.mjs
import { build } from "esbuild";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "packtest-")), "p.mjs");
await build({
  entryPoints: ["src/lib/setupPacks.js"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error",
  alias: { "@": path.resolve("src") },
  plugins: [{ name: "stub", setup(b) {
    b.onResolve({ filter: /useAccessibility|homePresetParts|experimentalHome|uiV2$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const getAccessibilitySettings=()=>({});export const setAccessibilityFontFamily=()=>{};export const setAccessibilityHeadingFont=()=>{};export const isWideScreen=()=>false;export const findFreeCell=()=>({x:0,y:0});export const V2_TOKEN_DEFS=[];" }));
  } }],
});
const P = await import(out);
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.error("FAIL", m); } else console.log("ok  ", m); };

const home = {
  grid: { phoneCols: 4, rowPx: 80 },
  styleMode: "glass",
  background: { layers: [{ type: "image", url: "/local-image/bg1" }, { type: "css", css: "background:url('local-image://bg2') center" }] },
  pages: [{ id: "p1", layoutMode: "free", widgets: [
    { instanceId: "a", widgetId: "text", span: { cols: 4, rows: 2 }, settings: { html: '<p>hi</p><img src="local-image://pic9">', css: "background-image: url(/local-image/x%201)", bgImage: "/local-image/y" } },
    { instanceId: "b", widgetId: "front", settings: { alterId: "abc", style: "user:s1" } },
  ] }],
};
const userStyles = [{ id: "s1", label: "Glow", look: { bg: "#000", layers: [{ url: "local-image://deep" }], css: "x{background:url(data:image/png;base64,AAAA)}" } }];

const layout = P.buildLayoutType(home, { includeLook: true, userStyles });
const pack = P.buildPack({ title: "t", layout, widgetStyles: P.buildWidgetStylesType(userStyles), uiTheme: P.buildUiThemeType({ pageLooks: { home: { bg: "url(/local-image/zz)" } } }) });
const json = JSON.stringify(pack);
ok(!/local-image|data:image/.test(json), "plain export carries no picture references");
ok(P.packLooksSafe(pack), "plain export passes the import check");
ok(layout.omittedImages >= 6, `omitted pictures are counted (${layout.omittedImages})`);
ok(!json.includes("abc"), "alter id stays out");
ok(json.includes("<p>hi</p>"), "text content survives");

const refs = [];
const zipLayout = P.buildLayoutType(home, { includeLook: true, userStyles, imageRefs: refs });
const zj = JSON.stringify(zipLayout);
ok(!/local-image/.test(zj) && /pack-image:\/\/\d/.test(zj), "zip export maps embedded pictures to pack-image refs");
ok(refs.includes("pic9") && refs.includes("x 1") && refs.includes("bg2"), `embedded ids are collected (${refs.join(",")})`);
const mapped = P.applyImageMap(zipLayout, Object.fromEntries(refs.map((_, i) => [`pack-image://${i}`, `local-image://new${i}`])));
ok(!JSON.stringify(mapped).includes("pack-image://"), "import maps embedded pack-image refs back");

// An older build's pack with leftovers is cleaned, not refused.
const legacy = { __format: "symphony_setup_pack", types: { layout: { pages: [{ widgets: [{ widgetId: "text", settings: { css: "a{background:url(/local-image/q)}", html: '<img src="data:image/png;base64,AAA">' } }] }] } } };
ok(!P.packLooksSafe(legacy), "legacy leftovers are detected");
const ready = P.preparePackForImport(legacy);
ok(!ready.error && ready.removedPictures === 2, `legacy pack imports with pictures removed (${ready.removedPictures})`);
ok(P.packLooksSafe(ready.pack), "cleaned pack passes the check");

const acct = { __format: "symphony_setup_pack", types: { uiTheme: { friends: { userId: "u", secret: "s" } } } };
const r2 = P.preparePackForImport(acct);
ok(r2.error && r2.error.includes("userId"), "account details are refused with what was found");

if (fail) { console.error(`${fail} failed`); process.exit(1); }
console.log("all passed");
