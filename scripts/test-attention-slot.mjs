// node scripts/test-attention-slot.mjs — the one-thing-at-a-time slot.
import assert from "node:assert/strict";
import { claimAttention, releaseAttention, attentionHolder, ATTENTION, _resetAttention } from "../src/lib/attentionSlot.js";

_resetAttention();
assert.equal(attentionHolder(), null, "empty slot");
claimAttention("tip", ATTENTION.TIP);
assert.equal(attentionHolder(), "tip");
claimAttention("promo", ATTENTION.PROMO);
assert.equal(attentionHolder(), "promo", "higher priority wins");
claimAttention("setup", ATTENTION.SETUP);
claimAttention("reminder", ATTENTION.REMINDER);
assert.equal(attentionHolder(), "reminder");
releaseAttention("reminder");
assert.equal(attentionHolder(), "setup", "the next one gets its turn back");
claimAttention("setup2", ATTENTION.SETUP);
assert.equal(attentionHolder(), "setup", "ties go to the earlier claim");
claimAttention("setup", ATTENTION.SETUP);
assert.equal(attentionHolder(), "setup", "re-claiming keeps its place");
releaseAttention("setup"); releaseAttention("setup2"); releaseAttention("promo");
assert.equal(attentionHolder(), "tip");
releaseAttention("tip");
assert.equal(attentionHolder(), null);

// `besides` looks past the named claims (the survey floats beside notices).
claimAttention("home-notices:a", ATTENTION.NOTICES);
claimAttention("feedback-survey:b", ATTENTION.SURVEY);
claimAttention("continue-setup:c", ATTENTION.SETUP);
assert.equal(attentionHolder(), "home-notices:a");
assert.equal(attentionHolder(["home-notices"]), "feedback-survey:b", "shares the screen with notices");
claimAttention("reminder-toast:d", ATTENTION.REMINDER);
assert.equal(attentionHolder(["home-notices"]), "reminder-toast:d", "still waits for a reminder");
_resetAttention();
console.log("attention slot: all good");
