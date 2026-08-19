// ONE canonical description of what can leave the device — used by every
// privacy surface (first-run notice, Settings privacy notice, Friends page,
// Data inspector, tour) so they can't drift into contradiction again.
//
// Audit 2026-08-18 found eight surfaces each stating a different, mostly
// stale version ("Friends only sends name + front", "X is the ONLY thing
// that talks to a server", …). The rule this text follows (the user's own
// framing): the promise is "none of your data is STORED on servers" — some
// opt-in features legitimately CONTACT a relay; the text says exactly what
// each one hands over.
//
// Keep it accurate when behaviour changes; nothing else should restate
// these facts in its own words.

import React from "react";
import { useTerms } from "@/lib/useTerms";

// `variant`: "full" (bulleted, for the privacy notices) | "brief" (one
// paragraph, for tour bodies / inline mentions).
export default function WhatLeavesDevice({ variant = "full", className = "" }) {
  const t = useTerms();

  if (variant === "brief") {
    return (
      <span className={className}>
        Nothing is uploaded or synced by default. The only ways anything leaves this device are: exporting a
        backup yourself; <strong>Friends</strong> (opt-in — it sends your display name, {t.system} name, friend code,
        friends list, push registration, public key, and your <strong>current {t.front}</strong> at the privacy level you pick,
        plus any {t.alters} you share, which are end-to-end encrypted); <strong>cloud-backed reminders</strong> (opt-in —
        reminder times, and their wording only if you allow it); and third-party importers, which talk to that app&apos;s own
        servers with a token that&apos;s never sent to us.
      </span>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <p>
        By default nothing is uploaded or synced — there is no account and no sign-in. These are the <strong>only</strong> ways
        anything leaves this device, and every one is something you switch on:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>A backup you export.</strong> A plain file you choose where to put. (Android&apos;s own cloud backup and device
          transfer are switched off for this app, so your data never rides along in a Google backup.)</li>
        <li>
          <strong>Friends</strong> (off until you create a profile). Its relay holds: your display name, {t.system} name, friend
          code, chosen terms, privacy level, your friends list, your push registration (if on), your public key, and your{" "}
          <strong>current {t.front}</strong> — names / pronouns / colours at the level you pick, per friend. That last one is
          readable by the relay, so a notification can name who&apos;s {t.fronting}; set a friend to &quot;count only&quot; or &quot;hidden&quot; if
          you&apos;d rather it didn&apos;t. Any {t.alters} you share are <strong>end-to-end encrypted</strong> — the relay only holds
          scrambled data it can&apos;t read. All of it is deleted from the relay when you delete your Friends profile.
        </li>
        <li>
          <strong>Cloud-backed reminders</strong> (off unless you turn it on — or you already used Friends before this
          setting existed, in which case it was left on). Sends your reminder <em>times</em> so a push can reach you with the
          app closed. The reminder&apos;s wording is only sent if &quot;Show reminder text in notifications&quot; is on; otherwise a blank
          title goes and the words stay here.
        </li>
        <li>
          <strong>Importers.</strong> File imports (Simply Plural, OpenPlural, Octocon, PluralSpace, Plural Star, Ampersand)
          are read on-device — though imported avatars may still load from the original app&apos;s image host. Token
          connectors like PluralKit talk to that app&apos;s own servers; your token is never sent to us.
        </li>
      </ul>
      <p>
        Your journals, emotions, symptoms, plans, locations, chat and {t.alter} profiles never go anywhere.
      </p>
    </div>
  );
}
