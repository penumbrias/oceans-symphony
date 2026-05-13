import React from "react";
import { AlertTriangle } from "lucide-react";

// Shared medical / clinical-scope disclaimer. Rendered in two places:
//   1. DisclaimerModal — first-run, gated, must-acknowledge.
//   2. Settings → Disclaimer section — collapsible, always-accessible
//      reference.
// Keep the wording in this one file so both surfaces stay in sync.
export default function MedicalDisclaimer({ compact = false }) {
  return (
    <div className={compact ? "space-y-3 text-sm" : "space-y-4 text-sm"}>
      <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-foreground leading-relaxed">
          <strong>Oceans Symphony is a personal journaling and organisation tool, not a medical product.</strong>
          {" "}It is not a health app, not a therapy app, and not a substitute for professional care.
        </p>
      </div>

      <div className="space-y-2 leading-relaxed text-muted-foreground">
        <p>
          This app is built by a DID system for our own use and shared with the
          plural community in good faith. <strong className="text-foreground">We are not licensed
          mental health professionals</strong> — not therapists, psychologists, psychiatrists,
          counsellors, doctors, or clinicians of any kind. Oceans Symphony has not been
          designed, reviewed, validated, endorsed, or approved by any clinician,
          hospital, regulatory body, or medical institution.
        </p>

        <p className="font-medium text-foreground pt-1">What this app is:</p>
        <p>
          A private journaling and self-organisation tool for plural and multi-identity
          users — somewhere to keep track of who's around, write things down, log
          day-to-day life, and share status with chosen friends if you want.
        </p>

        <p className="font-medium text-foreground pt-1">What this app is NOT:</p>
        <ul className="list-disc list-inside space-y-0.5 pl-1">
          <li>A medical device or medical software</li>
          <li>A diagnosis tool</li>
          <li>A therapy substitute or therapy supplement</li>
          <li>A crisis-intervention service</li>
          <li>A source of medical, psychological, or clinical advice</li>
          <li>A treatment for any condition — including DID, OSDD, PTSD, trauma, dissociation, depression, anxiety, or anything else</li>
        </ul>

        <p className="pt-1">
          Nothing in this app — features, prompts, suggestions, terminology, journal
          templates, grounding techniques, safety-plan structure, therapy-report output,
          or any other content — should be interpreted as professional advice,
          diagnosis, or treatment. We do not provide guidance on managing any medical
          or mental-health condition. Any framing of the app that suggests otherwise
          (in promotional copy, community discussion, etc.) is not endorsed by us and
          does not change the app's actual scope.
        </p>

        <p className="font-medium text-foreground pt-2">If you are in crisis</p>
        <p>
          This app cannot help you in a crisis. Please contact your local emergency
          services or a crisis line, such as:
        </p>
        <ul className="list-disc list-inside space-y-0.5 pl-1">
          <li>US: <strong>988</strong> (Suicide &amp; Crisis Lifeline) — call or text</li>
          <li>UK / ROI: <strong>Samaritans 116 123</strong></li>
          <li>Canada: <strong>9-8-8</strong></li>
          <li>Australia: <strong>Lifeline 13 11 14</strong></li>
          <li>Elsewhere: search "crisis line" + your country, or contact your local emergency number</li>
        </ul>

        <p className="pt-2">
          Always work with a qualified clinician for the diagnosis and treatment of
          any condition. If something the app says or does conflicts with guidance
          from your own care team, defer to your care team.
        </p>

        <p className="pt-2 text-xs italic">
          By using Oceans Symphony you acknowledge that the developers are not
          medical professionals, that the app is provided "as is" without any
          clinical validation, and that you are responsible for seeking
          appropriate professional support for any medical or mental-health needs.
        </p>
      </div>
    </div>
  );
}
