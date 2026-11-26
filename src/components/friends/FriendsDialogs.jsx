// The Friends page's dialogs and the relay explainer, shared by the old page
// (src/pages/Friends.jsx) and the house's Friends room (src/house/friends/):
//   - PrivacyDisclaimer: what the cloud relay holds (and what it never does);
//   - ProfileSetupModal: create / edit / delete the Friends profile
//     (registerIdentity + saveFronterShareMode; deleteIdentity after a
//     second tap), the only place the profile's default level and share mode
//     are changed;
//   - AddFriendModal: send a request by code.
// Moved here unchanged from Friends.jsx so both houses use one copy.
import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus, Loader2, Database, Lock, Trash2 } from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { registerIdentity, deleteIdentity, saveFronterShareMode } from "@/lib/friendsApi";
import { useFriendCodeSender } from "@/components/friends/useFriendsPage";

// ── Setup / profile modal ─────────────────────────────────────────────────────

export function PrivacyDisclaimer() {
  const t = useTerms();
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
        <Database className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-foreground">Your personal data stays on-device</p>
          <p className="text-muted-foreground leading-relaxed mt-0.5">
            All your personal data — {t.alters}, journals, check-ins, symptoms, {t.fronting} sessions, etc. — lives in IndexedDB on your device. None of it is synced or uploaded — the relay described below only ever receives what you explicitly choose to share. The optional AES-256 encryption setting protects it at rest on the device itself.
          </p>
        </div>
      </div>
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
        <div className="flex items-start gap-3 mb-2">
          <Lock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="font-semibold text-foreground">Friends uses a minimal cloud relay</p>
        </div>
        <div className="text-muted-foreground leading-relaxed space-y-2 pl-8">
          <p>
            The Friends feature uses a separate, minimal cloud relay (a small serverless function with a key-value store). It only holds:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Your chosen display name, {t.system} name, friend code, chosen terms and privacy level</strong> — public-ish info you explicitly choose to share.</li>
            <li><strong>Your public encryption key</strong> — so friends can send you encrypted shares. (Your private key stays on this device, sealed with your app password when encryption is on.)</li>
            <li><strong>A snapshot of who is currently {t.fronting}</strong>, filtered by your privacy setting — <em>this one is readable by the relay</em> (so a notification can name who's {t.fronting}); the shared member list below is not:
              <ul className="list-[circle] pl-5 mt-0.5">
                <li><em>Names &amp; colours</em> — each {t.fronting} {t.alter}'s name, accent colour, and primary/co-{t.front} status.</li>
                <li><em>Count only</em> — just how many {t.alters} are out (e.g. "2 {t.fronters}").</li>
                <li><em>Hidden</em> — nothing about who's {t.fronting} at all.</li>
              </ul>
            </li>
            <li><strong>A member list you choose to share</strong> — <strong>end-to-end encrypted</strong>, so the relay only holds scrambled data it can't read. You control which {t.alters} (via privacy levels) and which details each friend sees; members are private until you add them to a level.</li>
            <li><strong>Friend relationships</strong> — who approved who.</li>
            <li><strong>Push tokens</strong> — a web-push subscription, or a Firebase/FCM token on the installed app — only if you opt in to notifications.</li>
            <li><strong>Reminder schedules</strong>, only if you turn on push notifications for reminders: the fire times, plus each reminder's text <em>unless</em> you switch off "Show reminder text in notifications" (then only a generic "you have a reminder" is sent and the wording stays on your device).</li>
          </ul>
          <p>
            Your {t.alter} profiles, journal text, check-in data, symptoms, and timeline history — <strong>none of that touches the friends server</strong>. What it holds is only the list above, and nothing gets added to that list without you turning something on. Everything above is deleted from the relay when you delete your Friends profile; removing a single friend removes their access and their copy of your shares.
          </p>
          <p>
            Friends is <strong>opt-in from the start</strong>: you have to create a Friends profile to use it. If you never do, nothing about your {t.system} goes to the relay. (Cloud-backed reminders, under Settings → Notifications, are a separate opt-in.) The core app works entirely locally; Friends is a separately-consented, explicitly-minimal cloud feature for sharing the specific thing you choose to share.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ProfileSetupModal({ open, onClose, onSaved, existing, onDeleted }) {
  const terms = useTerms();
  const [displayName, setDisplayName] = useState(existing?.displayName || '');
  const [systemName, setSystemName] = useState(existing?.systemName || '');
  const [privacyLevel, setPrivacyLevel] = useState(existing?.privacyLevel || 'names');
  // What rides along with each shared fronter ("name" keeps pre-feature
  // behaviour; nothing new leaves the device without an explicit change).
  const [fronterShareMode, setFronterShareMode] = useState(existing?.fronterShareMode || 'name');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      await deleteIdentity();
      toast.success('Friends profile deleted');
      onDeleted?.();
      onClose();
    } catch (e) {
      console.error('[Friends] deleteIdentity failed:', e);
      setError(e.message || 'Failed to delete profile.');
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    setError('');
    if (!displayName.trim()) {
      setError('Display name is required.');
      return;
    }
    setSaving(true);
    try {
      await registerIdentity({
        displayName: displayName.trim(),
        systemName: systemName.trim(),
        terms: {
          system: terms.system,
          alter: terms.alter,
          alters: terms.alters,
          front: terms.front,
          fronting: terms.fronting,
        },
        privacyLevel,
      });
      await saveFronterShareMode(fronterShareMode);
      toast.success('Profile saved!');
      onSaved();
      onClose();
    } catch (e) {
      console.error('[Friends] registerIdentity failed:', e);
      setError(e.message || 'Failed to save profile. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Friends Profile' : 'Set Up Friends Profile'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Display Name *
            </label>
            <Input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="How friends see you"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              {terms.System} Name (optional)
            </label>
            <Input
              value={systemName}
              onChange={e => setSystemName(e.target.value)}
              placeholder={`Your ${terms.system}'s name`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Front Visibility
            </label>
            <Select value={privacyLevel} onValueChange={setPrivacyLevel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="names">Show names & colours</SelectItem>
                <SelectItem value="count_only">Count only (e.g. "2 fronters")</SelectItem>
                <SelectItem value="hidden">Hidden (friends see no front info)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1.5">
              Controls what friends can see when you update your front.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              What each {terms.fronter} shares
            </label>
            <Select value={fronterShareMode} onValueChange={setFronterShareMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name only</SelectItem>
                <SelectItem value="name_prefs">Name + pronouns &amp; preferences</SelectItem>
                <SelectItem value="prefs_only">Pronouns &amp; preferences only (no name)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1.5">
              Preferences are the comfort-rated pronouns / names / terms set on each {terms.alter}'s profile (Edit → Pronouns → Advanced). "No name" shows pronouns in place of the name.
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || deleting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving…' : (existing ? 'Save Changes' : 'Create Profile')}
          </button>
          {existing && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving || deleting}
              className={`w-full flex items-center justify-center gap-1.5 mt-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                confirmDelete
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "text-destructive/80 hover:text-destructive hover:bg-destructive/10"
              }`}
            >
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {confirmDelete ? "Tap again to delete profile + remove from all friends" : "Delete profile"}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add friend modal ──────────────────────────────────────────────────────────

export function AddFriendModal({ open, onClose, onAdded }) {
  const { code, setCode, sending, error, handleSend } = useFriendCodeSender(() => { onAdded(); onClose(); });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Friend</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Enter your friend's code to send them a friend request. They'll need to approve it before you can see each other's front status.
          </p>
          <Input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX"
            maxLength={9}
            className="font-mono text-center tracking-widest text-base"
            onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          />
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !code.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {sending ? 'Sending…' : 'Send Request'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
