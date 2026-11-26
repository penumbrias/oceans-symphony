// One friend's view on the Friends page: what they see of you (the per-friend
// override, hides and sharing levels), notify on change, the safety number and
// the members they share with you. Shared by the old page's FriendCard
// (src/pages/Friends.jsx) and the house's Friends room (src/house/friends/),
// so both write through exactly the same calls:
//   - onVisibilityChange (the page's: saveFriendVisibility, then a re-push of
//     the front and the encrypted member share),
//   - onToggleNotify (toggleNotify), onRemove (removeFriend, after the
//     confirm), onVerify (setFriendVerified);
//   - reads: fetchFriendShare (decrypt on open), safetyNumber, isPushEnabled.
// Nothing here talks to the relay by itself beyond what those calls do.
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { confirm } from "@/components/shared/ConfirmDialog";
import { base44 } from "@/api/base44Client";
import { getPrivacyLevels, sortedLevels, resolveVisibleAlters } from "@/lib/privacyLevels";
import { isPushEnabled } from "@/lib/pushRegistration";
import { safetyNumber } from "@/lib/friendsCrypto";
import { fetchFriendShare } from "@/lib/friendsShare";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { buildTermsFromFriend } from "@/lib/friendsView";

export function useFriendView({ friend, open = true, alters = [], visibilitySettings = {}, onVisibilityChange, onRemove, onToggleNotify, myPublicKeyJwk = null, verifiedNumber = null, onVerify }) {
  const [removing, setRemoving] = useState(false);
  const [togglingNotify, setTogglingNotify] = useState(false);
  const [pushReady, setPushReady] = useState(null); // null = not yet checked
  const [savingVis, setSavingVis] = useState(false);
  const [savedVis, setSavedVis] = useState(false);

  // Local copies of visibility settings so toggles feel instant
  const [hiddenAlterIds, setHiddenAlterIds] = useState(() => visibilitySettings.hiddenAlterIds || []);
  const [privacyOverride, setPrivacyOverride] = useState(() => visibilitySettings.privacyOverride || null);
  // Member-list share: which privacy levels this friend may see.
  const [allowedLevelIds, setAllowedLevelIds] = useState(() => visibilitySettings.allowedLevelIds || []);

  // Keep in sync if parent reloads identity
  useEffect(() => {
    setHiddenAlterIds(visibilitySettings.hiddenAlterIds || []);
    setPrivacyOverride(visibilitySettings.privacyOverride || null);
    setAllowedLevelIds(visibilitySettings.allowedLevelIds || []);
  }, [visibilitySettings.hiddenAlterIds, visibilitySettings.privacyOverride, visibilitySettings.allowedLevelIds]);

  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const levels = sortedLevels(getPrivacyLevels(pickPrimarySystemSettings(settingsList)));
  const maxLevelNumber = levels.length ? Math.max(...levels.map((l) => l.number)) : 0;
  const allowedSet = new Set(allowedLevelIds);
  const thresholdValue = (() => {
    const nums = levels.filter((l) => allowedSet.has(l.id)).map((l) => l.number);
    return nums.length ? Math.max(...nums) : -1;
  })();
  const visibleAlters = resolveVisibleAlters({ alters, levels, visibility: { allowedLevelIds, hiddenAlterIds } });
  const sharedCount = visibleAlters.length;
  const saveLevels = useCallback((next) => {
    setAllowedLevelIds(next);
    onVisibilityChange(friend.userId, { allowedLevelIds: next });
  }, [friend.userId, onVisibilityChange]);

  // Members this friend shares with me — fetched + decrypted when opened.
  const [sharedMembers, setSharedMembers] = useState(null); // null = not loaded
  const [loadingShare, setLoadingShare] = useState(false);
  useEffect(() => {
    if (!open || sharedMembers !== null) return;
    setLoadingShare(true);
    fetchFriendShare(friend.userId)
      .then((m) => setSharedMembers(Array.isArray(m) ? m : []))
      .catch(() => setSharedMembers([]))
      .finally(() => setLoadingShare(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- once per open, as before

  // Safety number for this friend — computed whenever the view is open.
  const [safetyNum, setSafetyNum] = useState(null);
  useEffect(() => {
    if (!open || !myPublicKeyJwk || !friend.publicKey) { setSafetyNum(null); return; }
    let cancelled = false;
    try {
      const theirs = JSON.parse(friend.publicKey);
      safetyNumber(myPublicKeyJwk, theirs).then((n) => { if (!cancelled) setSafetyNum(n); }).catch(() => {});
    } catch { setSafetyNum(null); }
    return () => { cancelled = true; };
  }, [open, myPublicKeyJwk, friend.publicKey]);

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
    if (open && pushReady === null) {
      isPushEnabled().then(setPushReady).catch(() => setPushReady(false));
    }
  }, [open, pushReady]);

  const handleRemove = async () => {
    if (!(await confirm({ title: `Remove ${friend.displayName || "this friend"}?`, body: "You are removed from each other's lists and everything shared between you is deleted on the relay. Adding each other again needs a new code exchange.", confirmLabel: "Remove", destructive: true }))) return;
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

  const isVerified = !!safetyNum && verifiedNumber === safetyNum;
  const setVerified = (on) => onVerify?.(friend.userId, on ? safetyNum : null);

  return {
    ft: buildTermsFromFriend(friend.front?.terms),
    fronters: friend.front?.fronters || [],
    updatedAt: friend.front?.updatedAt,
    privacyLevel: friend.front?.privacyLevel || 'names',
    removing, handleRemove,
    togglingNotify, handleNotify, pushReady,
    savingVis, savedVis,
    hiddenAlterIds, toggleAlterHidden,
    privacyOverride, handlePrivacyOverride,
    allowedLevelIds, allowedSet, saveLevels, levels, maxLevelNumber, thresholdValue, visibleAlters, sharedCount,
    sharedMembers, loadingShare,
    safetyNum, isVerified, setVerified,
  };
}
