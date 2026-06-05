import React from "react";
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { useTerms } from "@/lib/useTerms";

const Section = ({ title, children }) => (
  <div className="space-y-2">
    <h2 className="text-base font-semibold text-foreground">{title}</h2>
    <div className="text-sm text-muted-foreground space-y-2 leading-relaxed">{children}</div>
  </div>
);

export default function Privacy() {
  const terms = useTerms();
  return (
    <div className="min-h-screen text-foreground">
      <div className="max-w-2xl mx-auto px-5 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Privacy Policy</h1>
            <p className="text-xs text-muted-foreground">Oceans Symphony · Last updated May 2026</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Oceans Symphony is designed to be private by default. Your personal data stays on your
          device. This policy explains exactly what is and isn't collected.
        </p>

        <Section title="Data stored on your device">
          <p>
            All core app data — {terms.alter} profiles, {terms.fronting} history, journals, emotions, activities,
            sleep records, tasks, reminders, diary cards, notes, polls, location history, {terms.system}
            check-ins, therapy reports, and all other records — is stored exclusively in your
            browser's IndexedDB on your device.
          </p>
          <p>
            This data never leaves your device unless you explicitly export a backup file or
            enable the Friends feature described below.
          </p>
        </Section>

        <Section title="Friends feature (optional)">
          <p>
            The Friends feature lets you share your current front status with trusted people.
            If you choose to use it, the following information is stored on our servers
            (Upstash Redis):
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>A display name and optional {terms.system} name you provide</li>
            <li>Your unique friend code</li>
            <li>Your current {terms.front} status (who is {terms.fronting}, using names and colours you have set)</li>
            <li>Your privacy preference (full names / count only / hidden)</li>
            <li>Your approved friend list (stored as anonymous user IDs)</li>
          </ul>
          <p>
            This data is deleted from the server when you remove a friend or delete your profile.
            The Friends feature is entirely opt-in — the app works fully without it.
          </p>
        </Section>

        <Section title="Push notifications (optional)">
          <p>
            If you enable push notifications for reminders or friend front-change alerts, your
            browser's push subscription endpoint is stored on our servers solely to deliver
            those notifications. It is not used for any other purpose and is deleted when you
            disable push notifications.
          </p>
        </Section>

        <Section title="Simply Plural integration (optional)">
          <p>
            If you connect a Simply Plural account, your Simply Plural API token is stored
            locally on your device only. Data imported from Simply Plural ({terms.alter} profiles,
            {terms.fronting} history) is stored locally and subject to Simply Plural's own privacy policy.
            We do not store or transmit your Simply Plural credentials.
          </p>
        </Section>

        <Section title="PluralKit integration (optional)">
          <p>
            If you connect a PluralKit account, your PluralKit API token is stored locally
            on your device only (encrypted at rest if you have storage encryption enabled).
            The app sends authenticated requests directly to api.pluralkit.me using that token —
            your token is not transmitted to any other server and is not logged.
          </p>
          <p>
            Data imported from PluralKit ({terms.alter} profiles, group lists, and switch
            history when you request it) is stored locally and subject to PluralKit's own
            privacy policy. If you choose to export your local {terms.alters} back to
            PluralKit, only the {terms.alter} profile fields PluralKit understands are
            sent ({terms.fronting} sessions and {terms.alter}-specific notes are not exported).
            When you disconnect, the token is removed from this device. If you ever expose
            your token, you can invalidate it from Discord with <code>pk;token refresh</code>.
          </p>
        </Section>

        <Section title="What we do not collect">
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>No analytics or usage tracking</li>
            <li>No advertising identifiers</li>
            <li>No user accounts or email addresses</li>
            <li>No crash reporting that includes personal data</li>
            <li>No selling or sharing of any data with third parties</li>
          </ul>
        </Section>

        <Section title="Data export and deletion">
          <p>
            You can export a complete backup of all your local data at any time via
            Settings → Data Backup. Uninstalling the app or clearing browser storage
            permanently deletes all locally stored data. To delete Friends feature data
            from our servers, remove all friends and delete your Friends profile within
            the app.
          </p>
        </Section>

        <Section title="Children">
          <p>
            Oceans Symphony is not directed at children under 13. We do not knowingly
            collect information from children under 13.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we make material changes to this policy, we will update the date at the top
            of this page. Continued use of the app after changes constitutes acceptance of
            the updated policy.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            If you have questions about this privacy policy or your data, please open an
            issue at our GitHub repository or contact us through the app's support channel.
          </p>
        </Section>

        <div className="pt-4 border-t border-border/40">
          <Link to="/" className="text-xs text-primary hover:underline">← Back to Oceans Symphony</Link>
        </div>
      </div>
    </div>
  );
}
