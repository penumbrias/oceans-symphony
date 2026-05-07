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
  ChevronDown, ChevronUp, Loader2, Settings2, RefreshCw
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
} from "@/lib/friendsApi";

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

function FriendCard({ friend, onRemove, onToggleNotify }) {
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [togglingNotify, setTogglingNotify] = useState(false);

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

                <button
                  onClick={handleRemove}
                  disabled={removing}
                  className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
                >
                  {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                  Remove friend
                </button>
              </div>

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

function ProfileSetupModal({ open, onClose, onSaved, existing }) {
  const terms = useTerms();
  const [displayName, setDisplayName] = useState(existing?.displayName || '');
  const [systemName, setSystemName] = useState(existing?.systemName || '');
  const [privacyLevel, setPrivacyLevel] = useState(existing?.privacyLevel || 'names');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving…' : (existing ? 'Save Changes' : 'Create Profile')}
          </button>
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
    staleTime: 30_000,
  });

  const { data: friendsData, isLoading: friendsLoading, refetch: refetchFriends } = useQuery({
    queryKey: ['friendsList'],
    queryFn: fetchFriendsList,
    enabled: !!identity,
    refetchInterval: 60_000,
    staleTime: 30_000,
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
        <h1 className="text-xl font-semibold">Friends & Front Sharing</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Share your front status with trusted friends. Create a profile to get your unique friend code, then exchange codes to connect with others.
        </p>
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
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Friends ({friends.length})
            </p>
            {friends.map((friend) => (
              <FriendCard
                key={friend.userId}
                friend={friend}
                onRemove={handleRemove}
                onToggleNotify={handleToggleNotify}
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
