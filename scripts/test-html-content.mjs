// node scripts/test-html-content.mjs
import assert from "node:assert/strict";
import { hasShownContent, isBlankValue, looksLikeHtml } from "../src/lib/htmlContent.js";

assert.equal(hasShownContent(undefined), false);
assert.equal(hasShownContent(null), false);
assert.equal(hasShownContent(""), false);
assert.equal(hasShownContent("   "), false);
assert.equal(hasShownContent("<p></p><br>"), false);
assert.equal(hasShownContent("<p>&nbsp;</p>"), false);
assert.equal(hasShownContent("hi"), true);
assert.equal(hasShownContent("<p>hi</p>"), true);
assert.equal(hasShownContent('<img src="/local-image/x" alt="" />'), true);
assert.equal(hasShownContent('<div data-os-gallery="carousel"><div><img src="a"></div></div>'), true);
assert.equal(hasShownContent("<video src='x'></video>"), true);
assert.equal(hasShownContent(0), true);
assert.equal(isBlankValue('<img src="x">'), false);
assert.equal(looksLikeHtml("![pic](/local-image/x)"), false);
assert.equal(looksLikeHtml("<p>x</p>"), true);
console.log("htmlContent: all good");
