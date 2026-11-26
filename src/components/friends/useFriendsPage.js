// The Friends page's reads, relay effects and handlers, in ONE place for the
// old page (src/pages/Friends.jsx) and the house's Friends room
// (src/house/friends/). Only one of the two is ever mounted (HouseRoomGate),
// so the effects run once, exactly as they did on the old page:
//   - the identity (getLocalIdentity; a push_only identity counts as none),
//   - the friends list (fetchFriendsList, 30 s foreground poll, refetched on a
//     front-change push), never blanked during a refetch,
//   - this device's keypair: ensureKeyPair, publishPublicKey, pushAlterShares,
//   - one pushCurrentFront when the identity is there,
//   - the push subscription re-saved to the relay when push is on,
//   - the friends_front_snapshots marker so seen changes don't alert again.
// Handlers: respond to a request, remove, notify, per-friend visibility,
// verify, send a request by code, copy my code. All through friendsApi.js.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import {
  getLocalIdentity,
  fetchFriendsList,
  sendFriendRequest,
  respondToRequest,
  removeFriend,
  toggleNotify,
  saveFriendVisibility,
  setFriendVerified,
  pushCurrentFront,
  FRIENDS_API_BASE,
} from "@/lib/friendsApi";
import { isPushEnabled, getActivePushSubscription } from "@/lib/pushRegistration";
import { ensureKeyPair, publishPublicKey, isCryptoAvailable } from "@/lib/friendsCrypto";
import { pushAlterShares } from "@/lib/friendsShare";

// Sending a friend request by code — the Add Friend popup, the pixel desk's
// "Add a friend" box and the house room all use this.
export function useFriendCodeSender(onDone) {
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
      onDone();
    } catch (e) {
      console.error('[Friends] sendFriendRequest failed:', e);
      setError(e.message || 'Failed to send request. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };
  return { code, setCode, sending, error, handleSend };
}

export function useFriendsPage() {
  const queryClient = useQueryClient();
  const terms = useTerms();
  const [copied, setCopied] = useState(false);

  const { data: rawIdentity, isLoading: identityLoading, refetch: refetchIdentity } = useQuery({
    queryKey: ['friendIdentity'],
    queryFn: getLocalIdentity,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  // A push_only identity is one auto-provisioned solely for cloud reminder /
  // FCM delivery — the user hasn't set up the social Friends feature. Treat it
  // as "no profile" everywhere on this page so we still show setup and never run
  // front-sharing / key publishing for it. Setting up Friends upgrades the same
  // record (push_only → false) via registerIdentity.
  const identity = rawIdentity && !rawIdentity.push_only ? rawIdentity : null;

  const { data: altersRaw = [] } = useQuery({
    queryKey: ['alters'],
    queryFn: () => base44.entities.Alter.filter({}),
    staleTime: 60_000,
  });
  const alters = altersRaw.filter(a => !a.is_archived);

  // Kept as the old page had it: the live front (local), warm for the notice
  // and the room's "right now they would see".
  const { data: activeFront = [] } = useQuery({
    queryKey: ['activeFront'],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
    staleTime: 15_000,
  });

  const { data: friendsData, isLoading: friendsLoading, isFetching: friendsFetching, refetch: refetchFriends } = useQuery({
    queryKey: ['friendsList'],
    queryFn: fetchFriendsList,
    enabled: !!identity,
    // Push-instead-of-poll: front changes trigger an instant refetch via the
    // push signal (see the effect below), so the timer can be slow and
    // foreground-only — a big cut to relay traffic + battery vs the old 10s
    // background poll. 30s still surfaces new friend requests promptly.
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    staleTime: 0,
    // Never blank the visible list during a refetch or a transient error —
    // keep showing the last-known-good friends until fresh data lands. Pairs
    // with fetchFriendsList now throwing (instead of returning empty) on a
    // failed request, so a resume-time blip can't wipe the list.
    placeholderData: keepPreviousData,
  });

  const friends = friendsData?.friends || [];
  const pending = friendsData?.pending || [];
  const pendingSent = friendsData?.pendingSent || [];

  // E2E keys: ensure this device has a keypair + publish the public key so
  // friends can fetch it. Also loads my public key for safety-number display.
  const [myPublicKeyJwk, setMyPublicKeyJwk] = useState(null);
  const keysPublishedRef = useRef(false);
  useEffect(() => {
    if (!identity || !isCryptoAvailable() || keysPublishedRef.current) return;
    keysPublishedRef.current = true;
    (async () => {
      try {
        const kp = await ensureKeyPair();
        if (kp) setMyPublicKeyJwk(kp.publicKeyJwk);
        await publishPublicKey();
        // Push the current encrypted member-list share now that keys are live.
        await pushAlterShares();
      } catch { /* non-fatal — sharing just won't be available until keys publish */ }
    })();
  }, [identity]);

  const handleVerifyFriend = useCallback(async (friendUserId, number) => {
    await setFriendVerified(friendUserId, number);
    refetchIdentity();
  }, [refetchIdentity]);

  // Sync current front status to the relay once when identity is available (catches cases where
  // the user was already fronting before they set up the Friends profile).
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!identity || syncedRef.current) return;
    syncedRef.current = true;
    (async () => {
      try {
        await pushCurrentFront(terms);
      } catch { /* non-fatal */ }
    })();
  }, [identity, terms.fronting, terms.front, terms.alter, terms.system]); // eslint-disable-line react-hooks/exhaustive-deps -- once, as before

  // Push-instead-of-poll: refetch the friends list the moment a front-change
  // push arrives — on web via the service worker's "push-received" message,
  // on native via the FCM foreground event dispatched by fcmPush.js. Keeps
  // the list feeling live while the timer poll above stays lazy.
  useEffect(() => {
    if (!identity) return;
    const refetch = () => refetchFriends();
    let swHandler = null;
    try {
      if (navigator.serviceWorker) {
        swHandler = (e) => { if (e.data?.type === "push-received") refetch(); };
        navigator.serviceWorker.addEventListener("message", swHandler);
      }
    } catch { /* no SW here */ }
    window.addEventListener("fcm-front-change", refetch);
    return () => {
      window.removeEventListener("fcm-front-change", refetch);
      try { if (swHandler && navigator.serviceWorker) navigator.serviceWorker.removeEventListener("message", swHandler); } catch { /* ignore */ }
    };
  }, [identity, refetchFriends]);

  // On mount, re-save push subscription to the relay if push is enabled.
  // This handles the case where VAPID keys were added after notifyOnChange was set.
  useEffect(() => {
    if (!identity) return;
    isPushEnabled().then(enabled => {
      if (!enabled) return;
      return getActivePushSubscription().then(sub => {
        if (!sub) return;
        fetch(`${FRIENDS_API_BASE}/save-push-sub`, {
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
    // Defensive: surface immediately if the request object is malformed
    // (otherwise the button looks unresponsive to the user).
    if (!fromUserId) {
      toast.error("This request is missing sender info. Try refreshing the page.");
      return;
    }
    // Immediate feedback so the user knows the tap registered, even if the
    // server round-trip is slow. We'll replace this with a success/error
    // toast below.
    const pendingToastId = toast.loading(action === 'approve' ? "Accepting…" : "Declining…");
    // Optimistically remove the request from `pending` so the UI updates
    // before the network round-trip finishes. Refetch reconciles state.
    queryClient.setQueryData(['friendsList'], (prev) => {
      if (!prev) return prev;
      const pending = (prev.pending || []).filter(p => p.fromUserId !== fromUserId);
      return { ...prev, pending };
    });
    try {
      await respondToRequest(fromUserId, action);
      toast.success(action === 'approve' ? 'Friend request accepted!' : 'Request declined.', { id: pendingToastId });
      refetchFriends();
    } catch (e) {
      toast.error(e?.message || 'Failed — check your connection and try again.', { id: pendingToastId });
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
    pushCurrentFront(terms).catch(() => {});
    // Re-push the encrypted member-list share so the level change takes effect.
    pushAlterShares().catch(() => {});
  }, [terms, refetchIdentity]);

  const adder = useFriendCodeSender(() => refetchFriends());

  // Everything one friend's view needs from the page (FriendCard / the room).
  const friendProps = (friend) => ({
    friend,
    onRemove: handleRemove,
    onToggleNotify: handleToggleNotify,
    alters,
    visibilitySettings: identity?.perFriendVisibility?.[friend.userId] || {},
    onVisibilityChange: handleVisibilityChange,
    globalPrivacyLevel: identity?.privacyLevel || 'names',
    terms,
    myPublicKeyJwk,
    verifiedNumber: identity?.verifiedFriends?.[friend.userId] || null,
    onVerify: handleVerifyFriend,
  });

  return {
    terms, identity, identityLoading, refetchIdentity,
    alters, activeFront, friends, pending, pendingSent, friendsLoading, friendsFetching, refetchFriends,
    myPublicKeyJwk, copied, copyCode, adder,
    handleRespond, handleRemove, handleToggleNotify, handleVisibilityChange, handleVerifyFriend,
    friendProps,
  };
}
