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
  Database, Lock,
} from "lucide-react";
import { useTerms, gerund, agent } from "@/lib/useTerms";
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
  deleteProfile,
} from "@/lib/friendsApi";
import { isPushEnabled, getActivePushSubscription } from "@/lib/pushRegistration";

// ── helpers ───────────────────────────────────────────────────────────────────

function buildTermsFromFriend(friendTerms = {}) {
  const t = { ...friendTerms };
  const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const plu = (s) => {
    if (!s) return s;
    if (s.endsWith('s')) return s;
    if (s.endsWith('y')) return s.slice(0, -1) + 'ies';
    return s + 's';
  };
  const fr = t.front || 'front';
  const fronter = agent(fr);
  const fronting = gerund(fr);
  return {
    system: t.system || 'system',
    System: cap(t.system || 'system'),
    alter: t.alter || 'alter',
    Alter: cap(t.alter || 'alter'),
    alters: t.alters || plu(t.alter || 'alter'),
    fronting: t.fronting || fronting,
    Fronting: cap(t.fronting || fronting),
    fronter,
    Fronter: cap(fronter),
    fronters: plu(fronter),
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

function ProfileSetupModal({ open, onClose, onSaved, onDeleted, existing }) {
  const terms = useTerms();
  const [displayName, setDisplayName] = useState(existing?.displayName || '');
  const [systemName, setSystemName] = useState(existing?.systemName || '');
  const [privacyLevel, setPrivacyLevel] = useState(existing?.privacyLevel || 'names');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
              {terms.Front} Visibility
            </label>
            <Select value={privacyLevel} onValueChange={setPrivacyLevel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="names">Show names &amp; colours</SelectItem>
                <SelectItem value="count_only">Count only (e.g. "2 {terms.fronters}")</SelectItem>
                <SelectItem value="hidden">Hidden (friends see no {terms.front} info)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1.5">
              Controls what friends can see when you update your {terms.front}.
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving…' : (existing ? 'Save Changes' : 'Create Profile')}
          </button>

          {existing && (
            <div className="border-t border-border/40 pt-3 mt-1 space-y-2">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full text-xs text-destructive/70 hover:text-destructive transition-colors py-1"
                >
                  Delete Friends profile…
                </button>
              ) : (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
                  <p className="text-xs text-foreground font-medium">Delete your Friends profile?</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    This will remove you from all your friends' lists and delete all your Friends data from the server. Your personal app data is not affected.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={async () => {
                        setDeleting(true);
                        try {
                          await deleteProfile();
                          toast.success('Friends profile deleted.');
                          onClose();
                          onDeleted?.();
                        } catch (e) {
                          setError(e.message || 'Failed to delete profile.');
                          setConfirmDelete(false);
                        } finally {
                          setDeleting(false);
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
                    >
                      {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      {deleting ? 'Deleting…' : 'Yes, delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Add friend modal ──────────────────────────────────────────────────────────

function AddFriendModal({ open, onClose, onAdded }) {
  const terms = useTerms();
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
            Enter your friend's code to send them a friend request. They'll need to approve it before you can see each other's {terms.front} status.
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

// ── Privacy disclosure ────────────────────────────────────────────────────────

function PrivacyDisclosure() {
  const t = useTerms();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border/40 bg-muted/5 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
      >
        <ShieldCheck className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-medium text-foreground flex-1">Data &amp; Privacy</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-border/30 pt-3">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  <span className="text-xs font-semibold text-foreground">Your personal data — stays on your device</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed pl-5">
                  {t.Alters}, journals, {t.fronting} sessions, symptoms, check-ins, and all other personal data live in IndexedDB on your device only. No server ever sees this. The optional AES-256 encryption protects it at rest.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                  <span className="text-xs font-semibold text-foreground">What Friends stores online</span>
                </div>
                <ul className="pl-5 space-y-1.5">
                  {[
                    "Your chosen display name and friend code",
                    "Friend connections (who approved who)",
                    "Push notification tokens, only if you enable push notifications",
                  ].map((item, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-2">
                      <span className="text-muted-foreground/40 flex-shrink-0 mt-px">·</span>
                      <span>{item}</span>
                    </li>
                  ))}
                  <li className="text-xs text-muted-foreground flex gap-2">
                    <span className="text-muted-foreground/40 flex-shrink-0 mt-px">·</span>
                    <span>
                      A {t.front} snapshot — sent only when you tap "Update {t.Front}", containing exactly:
                      <ul className="mt-1 space-y-0.5 pl-3">
                        <li className="flex gap-1.5"><span className="text-muted-foreground/40">–</span><span><span className="text-foreground/80">Names mode:</span> each {t.fronting} {t.alter}'s display name, accent colour, and whether they are primary or co-{t.fronting}. No other {t.alter} data (no pronouns, roles, descriptions, journal entries, etc.).</span></li>
                        <li className="flex gap-1.5"><span className="text-muted-foreground/40">–</span><span><span className="text-foreground/80">Count-only mode:</span> just a number (e.g. "2 {t.fronting}") — no names or colours.</span></li>
                        <li className="flex gap-1.5"><span className="text-muted-foreground/40">–</span><span><span className="text-foreground/80">Hidden mode:</span> nothing — friends see only that {t.front} status is private.</span></li>
                      </ul>
                      Per-friend visibility lets you override this per person or hide specific {t.alters} entirely.
                    </span>
                  </li>
                </ul>
              </div>

              <div className="rounded-lg bg-muted/20 px-3 py-2.5">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="text-foreground font-medium">Never shared: </span>
                  {t.alter} profiles, journal text, check-in data, symptom logs, and timeline history never touch the Friends server. The server only ever knows exactly what you explicitly push via Update {t.Front}.
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                Friends is fully opt-in. If you never create a profile, zero data leaves your device.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
    refetchInterval: 30_000,
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
    try {
      await respondToRequest(fromUserId, action);
      toast.success(action === 'approve' ? 'Friend request accepted!' : 'Request declined.');
      refetchFriends();
    } catch (e) {
      toast.error(e.message || 'Failed.');
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
      <div className="max-w-md mx-auto p-6 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-2">
          <Users className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-xl font-semibold">Friends &amp; {terms.Front} Sharing</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Share your {terms.front} status with trusted friends. Create a profile to get your unique friend code, then exchange codes to connect with others.
        </p>

        {/* Data transparency — before opt-in */}
        <div className="w-full space-y-2 text-left">
          <div className="rounded-xl border border-border/40 bg-muted/5 p-3">
            <div className="flex items-start gap-2.5">
              <Database className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground mb-0.5">Your personal data stays on-device</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {terms.Alters}, journals, sessions, check-ins, and all personal data live in IndexedDB on your device. No server ever accesses this.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border/40 bg-muted/5 p-3">
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground mb-0.5">Friends uses a minimal cloud relay</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Only your display name and — when you tap "Update {terms.Front}" — each {terms.fronting} {terms.alter}'s name, accent colour, and primary/co-{terms.front} status ever leave your device. This feature is entirely opt-in — if you skip it, nothing goes online.
                </p>
              </div>
            </div>
          </div>
        </div>

        <Button onClick={() => setShowSetup(true)} className="mt-2">
          Set Up Profile
        </Button>
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

      {/* Data & privacy disclosure */}
      <PrivacyDisclosure />

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
