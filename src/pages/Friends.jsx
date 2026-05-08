import React, { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Users, Copy, UserPlus, Check, X, Bell, BellOff, UserMinus,
  ChevronDown, ChevronUp, Loader2, Settings2, RefreshCw, Eye, EyeOff, ShieldCheck,
  Database, Lock, Trash2
} from "lucide-react";
import { useTerms } from "@/lib/useTerms";
import { base44 } from "@/api/base44Client";
import {
  getLocalIdentity,
  registerIdentity,
  fetchFriendsList,
  sendFriendRequest,
  respondToRequest,
  removeFriend,
  toggleNotify,
  pushFrontStatus,
  saveFriendVisibility,
  deleteIdentity,
} from "@/lib/friendsApi";
import { isPushEnabled, getActivePushSubscription } from "@/lib/pushRegistration";

// ── helpers ───────────────────────────────────────────────────────────────────

function buildTermsFromFriend(friendTerms = {}) {
  const t = { ...friendTerms };
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const ger = (s) => {
    if (!s) return s;
    if (s.endsWith('e') && !s.endsWith('ee')) return s.slice(0, -1) + 'ing';
    return s + 'ing';
  };
  const plu = (s) => {
    if (!s) return s;
    if (s.endsWith('s')) return s;
    if (s.endsWith('y')) return s.slice(0, -1) + 'ies';
    return s + 's';
  };
  const fr = t.front || 'front';
  return {
    system: t.system || 'system',
    System: cap(t.system || 'system'),
    alter: t.alter || 'alter',
    Alter: cap(t.alter || 'alter'),
    alters: t.alters || plu(t.alter || 'alter'),
    fronting: t.fronting || ger(fr),
    Fronting: cap(t.fronting || ger(fr)),
    fronter: fr + 'er',
    Fronter: cap(fr + 'er'),
    fronters: plu(fr + 'er'),
  };
}

function FronterBubble({ fronter }) {
  const bg = fronter.color || '#6b7280';
  const initial = fronter.initial || (fronter.name ? fronter.name[0] : '?');
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 border-background"
      style={{ background: bg, color: '#fff' }}
      title={fronter.name}
    >
      {initial}
    </span>
  );
}

// ── Friend card ───────────────────────────────────────────────────────────────

function FriendCard({ friend, onRemove, onToggleNotify, alters = [], visibilitySettings = {}, onVisibilityChange, globalPrivacyLevel = 'names', terms }) {
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [togglingNotify, setTogglingNotify] = useState(false);
  const [pushReady, setPushReady] = useState(null); // null = not yet checked
  const [showVisibility, setShowVisibility] = useState(false);
  const [savingVis, setSavingVis] = useState(false);
  const [savedVis, setSavedVis] = useState(false);

  // Local copies of visibility settings so toggles feel instant
  const [hiddenAlterIds, setHiddenAlterIds] = useState(() => visibilitySettings.hiddenAlterIds || []);
  const [privacyOverride, setPrivacyOverride] = useState(() => visibilitySettings.privacyOverride || null);

  // Keep in sync if parent reloads identity
  useEffect(() => {
    setHiddenAlterIds(visibilitySettings.hiddenAlterIds || []);
    setPrivacyOverride(visibilitySettings.privacyOverride || null);
  }, [visibilitySettings.hiddenAlterIds, visibilitySettings.privacyOverride]);

  const saveVisibility = useCallback(async (newHiddenIds, newPrivacyOverride) => {
    setSavingVis(true);
    setSavedVis(false);
    try {
      await onVisibilityChange(friend.userId, { hiddenAlterIds: newHiddenIds, privacyOverride: newPrivacyOverride });
      setSavedVis(true);
      setTimeout(() => setSavedVis(false), 2000);
    } finally {
      setSavingVis(false);
    }
  }, [friend.userId, onVisibilityChange]);

  const toggleAlterHidden = useCallback((alterId) => {
    setHiddenAlterIds(prev => {
      const next = prev.includes(alterId) ? prev.filter(id => id !== alterId) : [...prev, alterId];
      saveVisibility(next, privacyOverride);
      return next;
    });
  }, [privacyOverride, saveVisibility]);

  const handlePrivacyOverride = useCallback((val) => {
    const next = val === 'global' ? null : val;
    setPrivacyOverride(next);
    saveVisibility(hiddenAlterIds, next);
  }, [hiddenAlterIds, saveVisibility]);

  useEffect(() => {
    if (expanded && pushReady === null) {
      isPushEnabled().then(setPushReady).catch(() => setPushReady(false));
    }
  }, [expanded, pushReady]);

  const ft = buildTermsFromFriend(friend.front?.terms);
  const fronters = friend.front?.fronters || [];
  const updatedAt = friend.front?.updatedAt;
  const privacyLevel = friend.front?.privacyLevel || 'names';

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await onRemove(friend.userId);
    } finally {
      setRemoving(false);
    }
  };

  const handleNotify = async (val) => {
    setTogglingNotify(true);
    try {
      await onToggleNotify(friend.userId, val);
    } finally {
      setTogglingNotify(false);
    }
  };

  const frontSummary = () => {
    if (privacyLevel === 'hidden') return `${ft.Fronting} hidden`;
    if (fronters.length === 0) return `No one ${ft.fronting}`;
    if (privacyLevel === 'count_only') return `${fronters.length} ${fronters.length === 1 ? ft.fronter : ft.fronters}`;
    const names = fronters.map(f => f.name).join(', ');
    return names;
  };

  return (
    <motion.div
      layout
      className="rounded-xl border border-border/50 bg-card overflow-hidden"
    >
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Fronter bubbles / avatar stack */}
        <div className="flex -space-x-2 shrink-0">
          {fronters.length === 0 ? (
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-muted text-muted-foreground text-sm">
              {(friend.displayName || '?')[0]}
            </span>
          ) : (
            fronters.slice(0, 3).map((f, i) => <FronterBubble key={i} fronter={f} />)
          )}
          {fronters.length > 3 && (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground text-xs border-2 border-background">
              +{fronters.length - 3}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground truncate">
            {friend.displayName}
            {friend.systemName && (
              <span className="text-muted-foreground font-normal"> · {friend.systemName}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground truncate">{frontSummary()}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {friend.notifyOnChange && <Bell className="w-3.5 h-3.5 text-primary" />}
          {updatedAt && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
            </span>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-4">
              {/* Fronter list */}
              {privacyLevel !== 'hidden' && fronters.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    Currently {ft.fronting}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {fronters.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium"
                        style={{
                          borderColor: f.color || undefined,
                          background: f.color ? `${f.color}18` : undefined,
                        }}
                      >
                        {f.isPrimary && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Primary" />
                        )}
                        {f.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Controls */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {togglingNotify ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : friend.notifyOnChange ? (
                      <Bell className="w-4 h-4 text-primary" />
                    ) : (
                      <BellOff className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-sm text-foreground">Notify on change</span>
                    <Switch
                      checked={friend.notifyOnChange}
                      onCheckedChange={handleNotify}
                      disabled={togglingNotify}
                    />
                  </div>
                  {pushReady === false && (
                    <p className="text-xs text-amber-500 dark:text-amber-400 pl-6">
                      Push notifications aren't enabled — go to Settings → Reminders to turn them on first.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowVisibility(v => !v)}
                    className={`flex items-center gap-1.5 text-xs transition-colors ${showVisibility ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Visibility
                  </button>
                  <button
                    onClick={handleRemove}
                    disabled={removing}
                    className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
                  >
                    {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                    Remove
                  </button>
                </div>
              </div>

              {/* Per-friend visibility settings */}
              {showVisibility && (
                <div className="border border-border/40 rounded-xl p-3 space-y-3 bg-muted/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">Visibility for this friend</span>
                    <span className="text-xs text-muted-foreground">
                      {savingVis ? <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</span>
                       : savedVis ? <span className="text-green-500">Saved</span>
                       : null}
                    </span>
                  </div>

                  {/* Privacy level override */}
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Privacy override</span>
                    <Select value={privacyOverride || 'global'} onValueChange={handlePrivacyOverride}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">
                          Use global setting ({globalPrivacyLevel === 'count_only' ? 'count only' : globalPrivacyLevel === 'hidden' ? 'hidden' : 'names & colours'})
                        </SelectItem>
                        <SelectItem value="names">Show names & colours</SelectItem>
                        <SelectItem value="count_only">Count only</SelectItem>
                        <SelectItem value="hidden">Hidden</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Per-alter toggles — only when effective privacy shows names */}
                  {(privacyOverride === 'names' || (!privacyOverride && globalPrivacyLevel === 'names')) && alters.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">
                        Which {terms?.alters || 'alters'} can they see?
                      </span>
                      <div className="space-y-0.5 max-h-44 overflow-y-auto">
                        {alters.map(alter => {
                          const globallyHidden = alter.friends_visible === false;
                          const locallyHidden = hiddenAlterIds.includes(alter.id);
                          const isVisible = !globallyHidden && !locallyHidden;
                          return (
                            <div
                              key={alter.id}
                              className={`flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors ${
                                globallyHidden ? 'opacity-40' : 'hover:bg-muted/30'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ background: alter.color || '#6b7280' }}
                                />
                                <span className="text-xs text-foreground truncate">{alter.name}</span>
                                {globallyHidden && (
                                  <span className="text-xs text-muted-foreground flex-shrink-0">(hidden from all friends)</span>
                                )}
                              </div>
                              <button
                                disabled={globallyHidden}
                                onClick={() => !globallyHidden && toggleAlterHidden(alter.id)}
                                className={`flex-shrink-0 p-1 rounded transition-colors ${
                                  globallyHidden
                                    ? 'cursor-not-allowed'
                                    : isVisible
                                      ? 'text-primary hover:text-primary/70'
                                      : 'text-muted-foreground hover:text-foreground'
                                }`}
                                title={isVisible ? 'Visible — click to hide' : 'Hidden — click to show'}
                              >
                                {isVisible
                                  ? <Eye className="w-3.5 h-3.5" />
                                  : <EyeOff className="w-3.5 h-3.5" />
                                }
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {updatedAt && (
                <p className="text-xs text-muted-foreground">
                  Last updated {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Setup / profile modal ─────────────────────────────────────────────────────

function PrivacyDisclaimer() {
  const t = useTerms();
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
        <Database className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-foreground">Your personal data stays on-device</p>
          <p className="text-muted-foreground leading-relaxed mt-0.5">
            All your personal data — {t.alters}, journals, check-ins, symptoms, {t.fronting} sessions, etc. — lives in IndexedDB on your device. This is the "local-only" mode. Nothing from your personal {t.system} data ever leaves your device — no server sees it, no sync happens. The optional AES-256 encryption setting protects it at rest on the device itself.
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
            The Friends feature uses a separate, minimal cloud relay (Vercel KV — basically a Redis store). It only holds:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Your chosen display name and friend code</strong> — public-ish info you explicitly choose to share.</li>
            <li><strong>A snapshot of who is currently {t.fronting}</strong>, filtered by your privacy setting:
              <ul className="list-[circle] pl-5 mt-0.5">
                <li><em>Names &amp; colours</em> — each {t.fronting} {t.alter}'s name, accent colour, and primary/co-{t.front} status.</li>
                <li><em>Count only</em> — just how many {t.alters} are out (e.g. "2 {t.fronters}").</li>
                <li><em>Hidden</em> — nothing about who's {t.fronting} at all.</li>
              </ul>
            </li>
            <li><strong>Friend relationships</strong> — who approved who.</li>
            <li><strong>Push subscription tokens</strong>, only if you opt in to friend-front notifications.</li>
          </ul>
          <p>
            Your {t.alter} profiles, journal text, check-in data, symptoms, timeline history — <strong>none of that touches the friends server</strong>. The friends server only ever knows what you explicitly push via "Update Front", filtered by the privacy setting above.
          </p>
          <p>
            Friends is <strong>opt-in from the start</strong>: you have to create a Friends profile to use it. If you never do, zero data leaves the device. The core app works entirely locally; Friends is a separately-consented, explicitly-minimal cloud feature for sharing the specific thing you choose to share.
          </p>
        </div>
      </div>
    </div>
  );
}

function ProfileSetupModal({ open, onClose, onSaved, existing, onDeleted }) {
  const terms = useTerms();
  const [displayName, setDisplayName] = useState(existing?.displayName || '');
  const [systemName, setSystemName] = useState(existing?.systemName || '');
  const [privacyLevel, setPrivacyLevel] = useState(existing?.privacyLevel || 'names');
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

function AddFriendModal({ open, onClose, onAdded }) {
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    setError('');
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setSending(true);
    try {
      await sendFriendRequest(trimmed);
      toast.success('Friend request sent!');
      setCode('');
      onAdded();
      onClose();
    } catch (e) {
      console.error('[Friends] sendFriendRequest failed:', e);
      setError(e.message || 'Failed to send request. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FriendsPage() {
  const queryClient = useQueryClient();
  const [showSetup, setShowSetup] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: identity, isLoading: identityLoading, refetch: refetchIdentity } = useQuery({
    queryKey: ['friendIdentity'],
    queryFn: getLocalIdentity,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: altersRaw = [] } = useQuery({
    queryKey: ['alters'],
    queryFn: () => base44.entities.Alter.filter({}),
    staleTime: 60_000,
  });
  const alters = altersRaw.filter(a => !a.is_archived);

  const { data: activeFront = [] } = useQuery({
    queryKey: ['activeFront'],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
    staleTime: 15_000,
  });

  const { data: friendsData, isLoading: friendsLoading, refetch: refetchFriends } = useQuery({
    queryKey: ['friendsList'],
    queryFn: fetchFriendsList,
    enabled: !!identity,
    // Poll more aggressively so incoming/responded requests appear quickly
    // for both sides without needing a manual refresh.
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const friends = friendsData?.friends || [];
  const pending = friendsData?.pending || [];
  const pendingSent = friendsData?.pendingSent || [];

  const terms = useTerms();
  // Sync current front status to KV once when identity is available (catches cases where
  // the user was already fronting before they set up the Friends profile).
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!identity || syncedRef.current) return;
    syncedRef.current = true;
    (async () => {
      try {
        const [activeSessions, alters] = await Promise.all([
          base44.entities.FrontingSession.filter({ is_active: true }),
          base44.entities.Alter.filter({}),
        ]);
        const primaryAlterId = activeSessions.find(s => s.is_primary)?.alter_id
          || activeSessions[0]?.alter_id;
        const visibleFronters = activeSessions
          .map(s => alters.find(a => a.id === s.alter_id))
          .filter(a => a && !a.is_archived && a.friends_visible !== false)
          .map(a => ({
            id: a.id,
            name: a.name,
            initial: a.name?.[0] || '?',
            color: a.color || null,
            isPrimary: a.id === primaryAlterId,
            isCofronter: a.id !== primaryAlterId,
          }));
        await pushFrontStatus({
          fronters: visibleFronters,
          terms: {
            fronting: terms.fronting,
            front: terms.front,
            alter: terms.alter,
            system: terms.system,
          },
        });
      } catch (_) {}
    })();
  }, [identity, terms.fronting, terms.front, terms.alter, terms.system]);

  // On mount, re-save push subscription to KV if push is enabled.
  // This handles the case where VAPID keys were added after notifyOnChange was set.
  useEffect(() => {
    if (!identity) return;
    isPushEnabled().then(enabled => {
      if (!enabled) return;
      return getActivePushSubscription().then(sub => {
        if (!sub) return;
        fetch('/api/friends/save-push-sub', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: identity.userId, secret: identity.secret, subscription: sub }),
        }).catch(() => {});
      });
    }).catch(() => {});
  }, [identity]);

  // When the Friends page is open and friendsData loads/refreshes, update the snapshot
  // so changes already seen here don't re-trigger alerts on next app open.
  useEffect(() => {
    if (!friendsData?.friends?.length) return;
    const snapshots = {};
    for (const friend of friendsData.friends) {
      snapshots[friend.userId] = {
        updatedAt: friend.front?.updatedAt,
        fronters: friend.front?.fronters || [],
      };
    }
    localStorage.setItem("friends_front_snapshots", JSON.stringify(snapshots));
  }, [friendsData]);

  const copyCode = useCallback(() => {
    if (!identity?.friendCode) return;
    navigator.clipboard.writeText(identity.friendCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [identity]);

  const handleRespond = async (fromUserId, action) => {
    // Optimistically remove the request from `pending` so the UI updates
    // before the network round-trip finishes. Refetch reconciles state.
    queryClient.setQueryData(['friendsList'], (prev) => {
      if (!prev) return prev;
      const pending = (prev.pending || []).filter(p => p.fromUserId !== fromUserId);
      return { ...prev, pending };
    });
    try {
      await respondToRequest(fromUserId, action);
      toast.success(action === 'approve' ? 'Friend request accepted!' : 'Request declined.');
      refetchFriends();
    } catch (e) {
      toast.error(e.message || 'Failed.');
      refetchFriends(); // restore truth on failure
    }
  };

  const handleRemove = async (friendUserId) => {
    try {
      await removeFriend(friendUserId);
      toast.success('Friend removed.');
      refetchFriends();
    } catch (e) {
      toast.error(e.message || 'Failed to remove friend.');
    }
  };

  const handleToggleNotify = async (friendUserId, value) => {
    try {
      await toggleNotify(friendUserId, value);
      queryClient.setQueryData(['friendsList'], (old) => {
        if (!old) return old;
        return {
          ...old,
          friends: old.friends.map(f =>
            f.userId === friendUserId ? { ...f, notifyOnChange: value } : f
          ),
        };
      });
    } catch (e) {
      toast.error(e.message || 'Failed.');
    }
  };

  const handleVisibilityChange = useCallback(async (friendUserId, settings) => {
    await saveFriendVisibility(friendUserId, settings);
    // Refresh identity so visibility changes are reflected in the UI
    await refetchIdentity();
    // Re-push front status so this friend immediately sees the change
    const primaryAlterId = activeFront.find(s => s.is_primary)?.alter_id || activeFront[0]?.alter_id;
    const fronters = activeFront
      .map(s => alters.find(a => a.id === s.alter_id))
      .filter(a => a && !a.is_archived && a.friends_visible !== false)
      .map(a => ({
        id: a.id,
        name: a.name,
        initial: a.name?.[0] || '?',
        color: a.color || null,
        isPrimary: a.id === primaryAlterId,
        isCofronter: a.id !== primaryAlterId,
      }));
    pushFrontStatus({
      fronters,
      terms: { fronting: terms.fronting, front: terms.front, alter: terms.alter, system: terms.system },
    }).catch(() => {});
  }, [activeFront, alters, terms, refetchIdentity]);

  if (identityLoading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No profile yet
  if (!identity) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-5">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Friends & Front Sharing</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Share your front status with trusted friends. Create a profile to get your unique friend code, then exchange codes to connect with others.
          </p>
        </div>
        <PrivacyDisclaimer />
        <div className="flex justify-center">
          <Button onClick={() => setShowSetup(true)}>Set Up Profile</Button>
        </div>
        <ProfileSetupModal
          open={showSetup}
          onClose={() => setShowSetup(false)}
          onSaved={refetchIdentity}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Users className="w-5 h-5" /> Friends
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { refetchFriends(); }}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Button variant="outline" size="sm" onClick={() => setShowSetup(true)}>
            <Settings2 className="w-4 h-4 mr-1.5" /> Profile
          </Button>
          <Button size="sm" onClick={() => setShowAddFriend(true)}>
            <UserPlus className="w-4 h-4 mr-1.5" /> Add Friend
          </Button>
        </div>
      </div>

      {/* Friend code card */}
      <div data-tour="friends-code" className="rounded-xl border border-border/50 bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
          Your Friend Code
        </p>
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xl font-bold tracking-widest text-foreground">
            {identity.friendCode}
          </span>
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-sm transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Share this code with friends so they can send you a friend request.
        </p>
        {identity.displayName && (
          <p className="text-xs text-muted-foreground mt-1">
            Visible as: <span className="text-foreground font-medium">{identity.displayName}</span>
            {identity.systemName && ` · ${identity.systemName}`}
          </p>
        )}
      </div>

      {/* Privacy disclaimer — collapsed by default once a profile exists */}
      <details className="rounded-xl border border-border/50 bg-card overflow-hidden group">
        <summary className="cursor-pointer list-none px-4 py-2.5 flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors select-none">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            What gets shared with the cloud relay?
          </span>
          <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4 pt-1">
          <PrivacyDisclaimer />
        </div>
      </details>

      {/* Incoming requests */}
      {pending.length > 0 && (
        <div>
          <p className="text-xs font-medium text-primary uppercase tracking-wide mb-2">
            Pending Requests ({pending.length})
          </p>
          <div className="space-y-2">
            {pending.map((req) => (
              <div key={req.fromUserId} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{req.fromDisplayName || 'Unknown'}</p>
                  {req.fromSystemName && (
                    <p className="text-xs text-muted-foreground truncate">{req.fromSystemName}</p>
                  )}
                  {req.requestedAt && (
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(req.requestedAt), { addSuffix: true })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleRespond(req.fromUserId, 'approve')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" /> Accept
                  </button>
                  <button
                    onClick={() => handleRespond(req.fromUserId, 'deny')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outgoing pending */}
      {pendingSent.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Requests Sent ({pendingSent.length})
          </p>
          <div className="space-y-2">
            {pendingSent.map((uid) => (
              <div key={uid} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/10">
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs">
                  ?
                </div>
                <p className="text-sm text-muted-foreground">Waiting for approval…</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Friends list */}
      <div>
        {friendsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : friends.length === 0 ? (
          <div className="text-center py-14 space-y-2">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground text-sm">No friends yet.</p>
            <p className="text-xs text-muted-foreground">
              Share your friend code or add a friend's code to connect.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Friends ({friends.length})
              </p>
              <p className="text-xs text-muted-foreground/60">Updates every 30 s</p>
            </div>
            {friends.map((friend) => (
              <FriendCard
                key={friend.userId}
                friend={friend}
                onRemove={handleRemove}
                onToggleNotify={handleToggleNotify}
                alters={alters}
                visibilitySettings={identity?.perFriendVisibility?.[friend.userId] || {}}
                onVisibilityChange={handleVisibilityChange}
                globalPrivacyLevel={identity?.privacyLevel || 'names'}
                terms={terms}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <ProfileSetupModal
        open={showSetup}
        onClose={() => setShowSetup(false)}
        onSaved={refetchIdentity}
        onDeleted={refetchIdentity}
        existing={identity}
      />
      <AddFriendModal
        open={showAddFriend}
        onClose={() => setShowAddFriend(false)}
        onAdded={refetchFriends}
      />
    </div>
  );
}
