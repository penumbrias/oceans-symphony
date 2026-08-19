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
            <p className="text-xs text-muted-foreground">Oceans Symphony · Last updated August 2026</p>
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
            This data never leaves your device unless you explicitly export a backup file, enable
            the Friends feature, turn on cloud-backed reminder delivery, or connect a third-party
            import — each described below. Optional at-rest encryption (AES-256-GCM, key derived from
            your password with PBKDF2 at 600,000 iterations) protects it on the device itself; the
            password never leaves the device and cannot be recovered if lost.
          </p>
          <p>
            On Android, the app opts out of the operating system's own cloud backup and device
            transfer, so your data is never copied into a Google backup. Your own export file is the
            only way it moves.
          </p>
        </Section>

        <Section title="Friends feature (optional)">
          <p>
            The Friends feature lets you share your current front status with trusted people.
            If you choose to use it, the following information is stored on our relay (a small
            serverless function with a key-value store):
          </p>
          <ul className="list-disc list-inside space-y-1 pl-2">
            <li>A display name and optional {terms.system} name you provide, and the terms you've chosen</li>
            <li>Your unique friend code</li>
            <li>Your current {terms.front} status (who is {terms.fronting}, using names, pronouns and colours you have set) — <strong>this is stored readable by the relay</strong> so a notification can name who's {terms.fronting}. Set a friend to "count only" or "hidden" if you'd rather it didn't.</li>
            <li>Your privacy preference (full names / count only / hidden), including per-friend overrides</li>
            <li>Your approved friend list (stored as anonymous user IDs)</li>
            <li>Your public encryption key, so friends can send you encrypted shares</li>
            <li>{terms.Alter} details you choose to share with a friend — <strong>end-to-end encrypted</strong>: the relay only holds scrambled data it cannot read</li>
          </ul>
          <p>
            Everything above is deleted from the relay when you delete your Friends profile. Removing
            a single friend removes their access and their copy of your shares. The Friends feature is
            entirely opt-in — the app works fully without it. Your Friends identity (including the
            private key) stays on your device and is sealed with your app password when encryption is on.
          </p>
        </Section>

        <Section title="Push notifications (optional)">
          <p>
            If you enable push notifications for reminders or friend front-change alerts, your
            browser's push subscription endpoint is stored on our relay solely to deliver
            those notifications. It is not used for any other purpose and is deleted when you
            disable push notifications.
          </p>
          <p>
            If you turn on cloud-backed reminder delivery, your reminder <em>times</em> are stored on
            the relay so a push can reach you while the app is closed. A reminder's wording is only
            sent if "Show reminder text in notifications" is on — otherwise the relay sends a blank
            title and the words stay on your device. This is off unless you turn it on (or already
            used Friends before the setting existed, in which case it was left on).
          </p>
        </Section>

        <Section title="File imports (optional)">
          <p>
            Simply Plural, OpenPlural, PluralSpace, Octocon, Plural Star and Ampersand are imported
            from an export file you provide — no account connection, no API token. The file is read on
            your device and the imported data ({terms.alter} profiles, {terms.fronting} history and so on)
            is stored locally. Imported avatars may still load from the original app's image host when
            displayed.
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
