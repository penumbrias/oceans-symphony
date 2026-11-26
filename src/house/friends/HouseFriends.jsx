// The house's Friends room: board 22-Friends. On a computer three columns —
// Friends (the list, requests, Add a friend and your code), the open friend
// (who's in front for them, what they see of you, their profile, the safety
// number) and the sharing column (your default levels, Show when {fronting}
// per {alter}, member levels, How it works). A tablet folds the sharing column
// under the friend. There is no phone board: the phone keeps board 08's
// conventions — Friends · Sharing as page tabs, and one friend opened on its
// own history entry with the square back. House mode only: the frames draw it
// on /friends (houseFriendsRoom); the old page is gated off (HouseRoomGate)
// and stays exactly as it was with the new house off.
//
// Network and writes: NONE of its own. Every read, relay call and write is
// the old page's, through the shared hooks:
//   - useFriendsPage (src/components/friends/): identity, the friends list
//     poll, key publishing, the one front push, the push-sub re-save, the
//     snapshot marker; respond, remove, notify, per-friend visibility (which
//     re-pushes), verify, send a request, copy my code;
//   - useFriendView: one friend's override, hides, levels, notify, the
//     decrypted members they share, the safety number; remove asks first;
//   - the dialogs (ProfileSetupModal, PrivacyLevelsManager, LevelMembersModal)
//     and PerAlterLevels are the old ones;
//   - "Show when {fronting}" writes friends_visible through setAlterFields
//     (alterEntry), as FrontShareNotice does, asking before it shares more.
// "Right now they would see" runs whatFriendSees, the push's own rule, on
// this device's data; nothing is sent to show it.

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Check, Copy, Eye, EyeOff, PlayCircle, RefreshCw, Settings2, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { PixelBack } from "@/house/tokens/PixelGlyphs";
import { Button, IconButton } from "@/house/kit/Button";
import { Panel, PageTabs } from "@/house/kit/Panel";
import { Segmented, SliderRow } from "@/house/kit/Choices";
import { TextField } from "@/house/kit/Field";
import Menu from "@/house/kit/Menu";
import { Sheet } from "@/house/kit/Sheet";
import { EmptyBlock, LoadingBlock } from "@/house/kit/States";
import { showToast } from "@/house/kit/Toast";
import { useRoomTools } from "@/house/frame/roomTools";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { confirm } from "@/components/shared/ConfirmDialog";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";
import FrontShareNotice from "@/components/friends/FrontShareNotice";
import E2EInfoCard from "@/components/friends/E2EInfoCard";
import PrivacyLevelsManager from "@/components/friends/PrivacyLevelsManager";
import LevelMembersModal from "@/components/friends/LevelMembersModal";
import { PerAlterLevels } from "@/components/friends/MemberSharingPanel";
import { PrivacyDisclaimer, ProfileSetupModal } from "@/components/friends/FriendsDialogs";
import { useFriendsPage } from "@/components/friends/useFriendsPage";
import { useFriendView } from "@/components/friends/useFriendView";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useFrontersFirst } from "@/lib/alterSort";
import { setAlterFields } from "@/lib/alterEntry";
import { isCryptoAvailable } from "@/lib/friendsCrypto";
import { openPageTour } from "@/lib/pageTutorials";
import { levelIdsUpToThreshold, getPrivacyLevels, sortedLevels } from "@/lib/privacyLevels";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { an } from "@/lib/articles";
import { PREF_LEVELS } from "@/lib/alterPreferences";
import { applyShareMode, buildFriendFronters, whatFriendSees } from "@/lib/friendFronters";
import { FRONT_LEVELS, friendFrontSummary, sharedGroupLabels, sharedCustomFieldPairs, shareModeLabel } from "@/lib/friendsView";
import {
  openFriendId, friendViewState, shownFriend, seeWords, friendSinceWords, theirLevelWords,
  effectiveLevel, overrideWords, levelRows, friendRowSub, filterAltersByText, pollWords,
} from "@/house/friends/friendsModel";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/friends/friends.css";

const dateWords = (d) => format(d, "d MMM");

export default function HouseFriends({ size = "full", tokens }) {
  const phone = size === "phone";
  const location = useLocation();
  const navigate = useNavigate();
  const page = useFriendsPage();
  const { terms, identity, identityLoading, friends, pending, pendingSent, friendsLoading, friendsFetching, refetchFriends, refetchIdentity } = page;
  const [tab, setTab] = useState("friends");
  const [showSetup, setShowSetup] = useState(false);
  const [sheet, setSheet] = useState(null); // "relay" | "e2e"
  const codeRef = useRef(null);

  // ── Which friend is open (kept in the history entry, never the address) ──
  const openId = openFriendId(location.state);
  const selected = identity ? shownFriend(friends, openId, { phone }) : null;
  const openFriend = useCallback((f) => {
    if (phone) navigate("/friends", { state: friendViewState(f.userId) });
    else navigate("/friends", { replace: true, state: friendViewState(f.userId) });
  }, [phone, navigate]);
  const closeFriend = useCallback(() => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate("/friends", { replace: true, state: null });
  }, [navigate]);
  const friendOpenOnPhone = phone && !!selected;

  const focusAdd = useCallback(() => {
    if (phone) setTab("friends");
    setTimeout(() => codeRef.current?.querySelector("input")?.focus(), 60);
  }, [phone]);

  // ── The phone's header: + (add a friend) and ⋯ ──
  const tools = useMemo(() => (phone ? {
    info: identity && !friendOpenOnPhone ? { label: "+", ariaLabel: "Add a friend", tour: "friends-code", onSelect: focusAdd } : null,
    items: [
      ...(identity ? [
        { id: "refresh", label: "Refresh friends", icon: RefreshCw, onSelect: () => refetchFriends() },
        { id: "profile", label: "Your Friends profile", icon: Settings2, onSelect: () => setShowSetup(true) },
      ] : [{ id: "setup", label: "Set up your Friends profile", icon: UserPlus, onSelect: () => setShowSetup(true) }]),
      { id: "relay", label: "What the relay holds", icon: ShieldCheck, onSelect: () => setSheet("relay") },
    ],
  } : null), [phone, identity, friendOpenOnPhone, focusAdd, refetchFriends]);
  useRoomTools(tools);

  if (identityLoading) {
    return (
      <HouseScope tokens={tokens} className={`hfr hfr--${phone ? "phone" : "studio"}`} data-house-size={size} data-friends-room="">
        <div className="hfr-pad"><LoadingBlock label="Loading Friends" rows={3} /></div>
      </HouseScope>
    );
  }

  const dialogs = (
    <>
      <ProfileSetupModal open={showSetup} onClose={() => setShowSetup(false)} onSaved={refetchIdentity} onDeleted={refetchIdentity} existing={identity} />
      <Sheet open={sheet === "relay"} onClose={() => setSheet(null)} title="What the relay holds" size="full">
        <div className="hfr-old"><PrivacyDisclaimer /></div>
      </Sheet>
      <Sheet open={sheet === "e2e"} onClose={() => setSheet(null)} title="Encryption, keys and trust" size="full">
        <div className="hfr-old"><E2EInfoCard /></div>
      </Sheet>
    </>
  );

  // ── The sharing column (board 22, right) ──
  const sharing = (
    <>
      <div className="hfr-old hfr-notice"><FrontShareNotice /></div>
      {identity ? <DefaultLevelsPanel identity={identity} terms={terms} onManage={() => setShowSetup(true)} /> : null}
      <ShowWhenPanel terms={terms} />
      <MemberLevelsPanel terms={terms} />
      <HowPanel terms={terms} onRelay={() => setSheet("relay")} onE2E={() => setSheet("e2e")} />
    </>
  );

  // ── No Friends profile yet ──
  if (!identity) {
    const intro = (
      <Panel className="hfr-pn" title="Friends">
        <div className="hfr-body" data-tour="friends-code">
          <p className="hfr-p">{`Share who's ${terms.fronting} with people you trust. Make a Friends profile to get your friend code, then swap codes with a friend and each accept.`}</p>
          <p className="hfr-p hfr-dim">{`Nothing about your ${terms.system} goes to the relay until you make a profile. You can set up sharing first; it will be ready when you connect.`}</p>
          <div className="hfr-acts">
            <Button rank="primary" icon={UserPlus} onClick={() => setShowSetup(true)}>Set up profile</Button>
            <Button rank="secondary" icon={ShieldCheck} onClick={() => setSheet("relay")}>What the relay holds</Button>
          </div>
        </div>
      </Panel>
    );
    if (phone) {
      return (
        <HouseScope tokens={tokens} className="hfr hfr--phone" data-house-size="phone" data-friends-room="">
          <div className="hfr-floor">{intro}{sharing}</div>
          {dialogs}
        </HouseScope>
      );
    }
    return (
      <HouseScope tokens={tokens} className="hfr hfr--studio" data-house-size={size} data-friends-room="">
        <div className="hfr-cols hfr-cols--setup" data-house-size={size}>
          <div className="hfr-col">{intro}</div>
          <div className="hfr-col hfr-col--side">{sharing}</div>
        </div>
        {dialogs}
      </HouseScope>
    );
  }

  // ── The Friends column (board 22, left) ──
  const list = (
    <Panel className="hfr-pn hfr-listpn" title="Friends"
      tools={<Button rank="quiet" className="hfr-poll" icon={RefreshCw} aria-label="Refresh friends" onClick={() => refetchFriends()}>{pollWords({ fetching: friendsFetching })}</Button>}>
      <div className="hfr-rows" data-tour="friends-list">
        {friendsLoading && friends.length === 0 ? <LoadingBlock label="Loading friends" rows={3} /> : null}
        {!friendsLoading && friends.length === 0 && pending.length === 0 && pendingSent.length === 0 ? (
          <p className="hfr-empty">No friends yet. Share your code, or add a friend's code below.</p>
        ) : null}
        {friends.map((f) => {
          const sel = selected?.userId === f.userId;
          const verified = !!identity?.verifiedFriends?.[f.userId];
          return (
            <Button key={f.userId} rank="quiet" className="hfr-frow" data-selected={sel || undefined} aria-current={sel || undefined}
              aria-label={`Open ${f.displayName || "friend"}`} onClick={() => openFriend(f)}>
              <span className="hfr-frow-in">
                <span className="hfr-sq" style={{ background: f.front?.fronters?.[0]?.color || "var(--house-raised)" }} aria-hidden="true" />
                <span className="hfr-frow-text">
                  <span className="hfr-frow-name">{f.displayName || "Friend"}</span>
                  <span className="hfr-frow-sub">{friendRowSub(friendFrontSummary(f), f)}</span>
                </span>
                {verified ? <span className="hfr-ok">verified</span> : null}
              </span>
            </Button>
          );
        })}
        {pending.map((req) => (
          <div key={req.fromUserId} className="hfr-req">
            <span className="hfr-sq hfr-sq--new" aria-hidden="true" />
            <span className="hfr-frow-text">
              <span className="hfr-frow-name">{`New request: ${req.fromDisplayName || "Unknown"}`}</span>
              <span className="hfr-frow-sub">{[req.fromSystemName, req.requestedAt ? formatDistanceToNow(new Date(req.requestedAt), { addSuffix: true }) : null].filter(Boolean).join(" · ") || "waiting for you"}</span>
              <span className="hfr-acts">
                <Button rank="primary" icon={Check} onClick={() => page.handleRespond(req.fromUserId, "approve")}>Accept</Button>
                <Button rank="secondary" onClick={() => page.handleRespond(req.fromUserId, "deny")}>Decline</Button>
              </span>
            </span>
          </div>
        ))}
        {pendingSent.map((uid) => (
          <div key={uid} className="hfr-req">
            <span className="hfr-sq hfr-sq--wait" aria-hidden="true" />
            <span className="hfr-frow-text">
              <span className="hfr-frow-name">Request sent</span>
              <span className="hfr-frow-sub">waiting for approval</span>
            </span>
          </div>
        ))}
      </div>
      <div className="hfr-add" data-tour="friends-code" ref={codeRef}>
        <TextField label="Add a friend" placeholder="XXXX-XXXX" maxLength={9} value={page.adder.code}
          onChange={(v) => page.adder.setCode(v.toUpperCase())} error={page.adder.error || undefined}
          onKeyDown={(e) => { if (e.key === "Enter") page.adder.handleSend(); }} />
        <Button rank="primary" className="hfr-add-btn" busy={page.adder.sending} busyLabel="Sending…"
          disabledReason={page.adder.code.trim() ? undefined : "Type their code first"} onClick={page.adder.handleSend}>Add</Button>
        <div className="hfr-code">
          <span>Your code: <b className="hfr-codeval">{identity.friendCode}</b></span>
          <Button rank="quiet" icon={page.copied ? Check : Copy} onClick={page.copyCode}>{page.copied ? "Copied" : "Copy"}</Button>
        </div>
        <div className="hfr-code">
          <span className="hfr-dim">{`Visible as ${identity.displayName || "—"}${identity.systemName ? ` · ${identity.systemName}` : ""}`}</span>
          <Button rank="quiet" icon={Settings2} onClick={() => setShowSetup(true)}>Profile</Button>
        </div>
      </div>
    </Panel>
  );

  const friendView = selected ? (
    <ErrorBoundary key={selected.userId} resetKeys={[selected.userId]}
      fallback={<Panel className="hfr-pn" title="This friend"><p className="hfr-empty">{`This friend's view couldn't be drawn (${selected.displayName || "friend"}). Their data is safe; this is a display problem, please report it.`}</p></Panel>}>
      <FriendPanels {...page.friendProps(selected)} identity={identity} phone={phone} onBack={closeFriend}
        onRemoved={() => { if (phone) closeFriend(); else navigate("/friends", { replace: true, state: null }); }} />
    </ErrorBoundary>
  ) : (
    <Panel className="hfr-pn" title="A friend">
      <EmptyBlock compact title={friends.length ? "Pick a friend" : "No friends yet"}
        body={friends.length ? `Pick a friend to see who's ${terms.fronting} for them and choose what they see of you.` : "Share your code, or add a friend's code. Once they accept, they show here."}
        action={friends.length ? undefined : { label: "Add a friend", icon: UserPlus, onClick: focusAdd }} />
    </Panel>
  );

  if (phone) {
    return (
      <HouseScope tokens={tokens} className="hfr hfr--phone" data-house-size="phone" data-friends-room="">
        {friendOpenOnPhone ? (
          <div className="hfr-floor">{friendView}</div>
        ) : (
          <>
            <div className="hfr-tabs">
              <PageTabs label="Friends views" value={tab} onChange={setTab}
                tabs={[{ id: "friends", label: "Friends", tour: "friends-tab" }, { id: "sharing", label: "Sharing", tour: "friends-sharing-tab" }]} />
            </div>
            <div className="hfr-floor">{tab === "friends" ? list : sharing}</div>
          </>
        )}
        {dialogs}
      </HouseScope>
    );
  }

  return (
    <HouseScope tokens={tokens} className="hfr hfr--studio" data-house-size={size} data-friends-room="">
      <div className="hfr-cols" data-house-size={size}>
        <div className="hfr-col hfr-col--list">{list}</div>
        <div className="hfr-col hfr-col--main">{friendView}{size === "compact" ? sharing : null}</div>
        {size === "compact" ? null : <div className="hfr-col hfr-col--side">{sharing}</div>}
      </div>
      {dialogs}
    </HouseScope>
  );
}

// ── The open friend (board 22, middle) ──────────────────────────────────
function FriendPanels({ identity, phone, onBack, onRemoved, ...props }) {
  const { friend, alters, terms, globalPrivacyLevel } = props;
  const v = useFriendView({ ...props, onRemove: async (id) => { await props.onRemove(id); onRemoved?.(); } });
  const formatAlter = useAlterLabel();
  const [revealSafety, setRevealSafety] = useState(false);
  const [pickLevels, setPickLevels] = useState(false);
  const [showVisible, setShowVisible] = useState(false);
  const [visShown, setVisShown] = useState(60);
  const safetyRef = useRef(null);

  // "Right now they would see": the push's own rule on this device's data.
  const { data: activeFront = [] } = useQuery({ queryKey: ["activeFront"], queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }) });
  const { data: allAlters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.filter({}) });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const view = useMemo(() => {
    const fronters = applyShareMode(buildFriendFronters({ activeSessions: activeFront, alters: allAlters, groups }), identity?.fronterShareMode || "name");
    return whatFriendSees(fronters, identity?.perFriendVisibility?.[friend.userId], v.levels, globalPrivacyLevel);
  }, [activeFront, allAlters, groups, identity, friend.userId, v.levels, globalPrivacyLevel]);

  const level = effectiveLevel(v.privacyOverride, globalPrivacyLevel);
  const showsNames = level === "names";
  const prefsFronters = v.fronters.filter((f) => Array.isArray(f.preferences) && f.preferences.length > 0);

  const head = (
    <Panel className="hfr-pn hfr-headpn" title={<span className="hfr-headrow">
      {phone ? <IconButton icon={PixelBack} rank="secondary" label="Back to Friends" onClick={onBack} /> : null}
      <span className="hfr-bigsq" style={{ background: v.fronters[0]?.color || "var(--house-raised)" }} aria-hidden="true" />
      <span className="hfr-headtext">
        <span className="hfr-name">{friend.displayName || "Friend"}</span>
        <span className="hfr-dim hfr-small">{friendSinceWords(friend, { verified: v.isVerified, dateWords }) || (v.updatedAt ? `updated ${formatDistanceToNow(new Date(v.updatedAt), { addSuffix: true })}` : "")}</span>
      </span>
    </span>}
      tools={<>
        {v.safetyNum && !phone ? (
          <Button rank="secondary" onClick={() => v.setVerified(!v.isVerified)}>{v.isVerified ? "Unmark verified" : "Mark verified"}</Button>
        ) : null}
        <Menu label={`More for ${friend.displayName || "this friend"}`} items={[
          { id: "safety", label: "Safety number", icon: ShieldCheck, onSelect: () => { setRevealSafety(true); safetyRef.current?.scrollIntoView?.({ block: "nearest" }); } },
          ...(v.safetyNum && phone ? [{ id: "verify", label: v.isVerified ? "Unmark verified" : "Mark verified", icon: Check, onSelect: () => v.setVerified(!v.isVerified) }] : []),
          { id: "remove", label: v.removing ? "Removing…" : `Remove ${friend.displayName || "friend"}`, icon: UserMinus, danger: true, onSelect: v.handleRemove },
        ]} />
      </>}>
      {v.updatedAt && friendSinceWords(friend, { dateWords }) ? (
        <p className="hfr-dim hfr-small hfr-headnote">{`Updated ${formatDistanceToNow(new Date(v.updatedAt), { addSuffix: true })}`}</p>
      ) : null}
    </Panel>
  );

  const theirFront = (
    <Panel className="hfr-pn" title={`Who's ${v.ft.fronting} for them`} tools={<span className="hfr-note">{theirLevelWords(v.privacyLevel, v.ft)}</span>}>
      <div className="hfr-body">
        {v.privacyLevel === "hidden" || v.fronters.length === 0 || v.privacyLevel === "count_only" ? (
          <p className="hfr-p">{friendFrontSummary(friend)}</p>
        ) : (
          <div className="hfr-fronters">
            {v.fronters.map((f, i) => (
              <div key={i} className="hfr-fronter">
                <span className="hfr-sq hfr-sq--md" style={{ background: f.color || "var(--house-raised)" }} aria-hidden="true" />
                <span className="hfr-fronter-text">
                  <b>{f.name}</b>
                  <span className="hfr-dim hfr-small">{[f.isPrimary ? "primary" : `co-${v.ft.fronter}`, f.pronouns && f.pronouns !== f.name ? f.pronouns : null].filter(Boolean).join(" · ")}</span>
                </span>
              </div>
            ))}
          </div>
        )}
        {v.privacyLevel === "names" && prefsFronters.length ? (
          <div className="hfr-prefs">
            {prefsFronters.map((f, i) => (
              <p key={i} className="hfr-small">
                <span className="hfr-dim">{`${f.name}: `}</span>
                {[...f.preferences].sort((a, b) => (b.level || 3) - (a.level || 3)).map((p, j) => (
                  <span key={j} className="hfr-pref" title={(PREF_LEVELS[p.level] || PREF_LEVELS[3]).label}>{`${p.label} (${(PREF_LEVELS[p.level] || PREF_LEVELS[3]).label.toLowerCase()})`}</span>
                ))}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );

  const visible = [...v.visibleAlters].sort((a, b) => (formatAlter(a.alter) || "").localeCompare(formatAlter(b.alter) || ""));
  const levelsPart = (
    <div className="hfr-sub">
      <div className="hfr-subttl">{`${terms.Alters} this friend can see`}</div>
      {v.levels.length === 0 ? (
        <p className="hfr-p hfr-dim">No sharing levels yet. Make them under Member levels, or on any profile's Options.</p>
      ) : (
        <>
          {pickLevels ? (
            <div className="hfr-chips" role="group" aria-label="Levels this friend can see">
              {v.levels.map((l) => {
                const on = v.allowedSet.has(l.id);
                return (
                  <Button key={l.id} rank={on ? "primary" : "secondary"} className="hfr-chip" aria-pressed={on}
                    onClick={() => v.saveLevels(on ? v.allowedLevelIds.filter((id) => id !== l.id) : [...v.allowedLevelIds, l.id])}>
                    {`${l.number}. ${l.name}`}
                  </Button>
                );
              })}
            </div>
          ) : (
            <SliderRow label="Levels they see" hint={v.thresholdValue < 0 ? "none of your levels" : `levels 0 to ${v.thresholdValue}`}
              value={v.thresholdValue} min={-1} max={v.maxLevelNumber} step={1}
              onChange={(n) => v.saveLevels(n < 0 ? [] : levelIdsUpToThreshold(v.levels, n))} />
          )}
          <div className="hfr-line2">
            <Button rank="quiet" onClick={() => setPickLevels((p) => !p)}>{pickLevels ? "Use the slider" : "Pick specific levels"}</Button>
            <span className="hfr-note">{`${v.sharedCount} ${v.sharedCount === 1 ? terms.alter : terms.alters} shared`}</span>
          </div>
          {visible.length ? (
            <>
              <Button rank="quiet" aria-expanded={showVisible} onClick={() => { setShowVisible((s) => !s); setVisShown(60); }}>
                {`${showVisible ? "Hide" : "Show"} the ${visible.length} ${visible.length === 1 ? terms.alter : terms.alters} they can see`}
              </Button>
              {showVisible ? (
                <ul className="hfr-mini" aria-label={`${terms.Alters} they can see`}>
                  {visible.slice(0, visShown).map(({ alter }) => (
                    <li key={alter.id}><span className="hfr-sq hfr-sq--sm" style={{ background: alter.color || "var(--house-raised)" }} aria-hidden="true" />{formatAlter(alter)}</li>
                  ))}
                  {visible.length > visShown ? <li><Button rank="quiet" onClick={() => setVisShown((s) => s + 60)}>{`Show more (${visShown} of ${visible.length})`}</Button></li> : null}
                </ul>
              ) : null}
            </>
          ) : <p className="hfr-p hfr-dim">{`No ${terms.alters} visible with the current levels.`}</p>}
          <p className="hfr-p hfr-dim">{v.allowedLevelIds.length
            ? `When ${terms.fronting}, this friend sees only these ${terms.alters}, with the fields their levels share.`
            : `With no levels, this friend sees whoever has "Show when ${terms.fronting}" on.`}</p>
        </>
      )}
    </div>
  );

  const hidePart = showsNames && alters.length > 0 ? (
    <div className="hfr-sub">
      <div className="hfr-subttl">{`Hide ${terms.alters} from this friend`}</div>
      <div className="hfr-old">
        <AlterTreeSelect controlPosition="right" maxHeight="44vh"
          renderControl={(alter) => {
            // With levels granted, the levels decide: the profile switch only covers friends without levels.
            const globallyHidden = alter.friends_visible === false && v.allowedLevelIds.length === 0;
            const shown = !globallyHidden && !v.hiddenAlterIds.includes(alter.id);
            return (
              <IconButton icon={shown ? Eye : EyeOff} rank="quiet"
                label={globallyHidden ? `${formatAlter(alter)}: hidden from all friends ("Show when ${terms.fronting}" is off)` : shown ? `${formatAlter(alter)}: shown, hide from this friend` : `${formatAlter(alter)}: hidden, show to this friend`}
                disabledReason={globallyHidden ? `"Show when ${terms.fronting}" is off` : undefined}
                onClick={() => v.toggleAlterHidden(alter.id)} />
            );
          }} />
      </div>
    </div>
  ) : null;

  const whatTheySee = (
    <Panel className="hfr-pn" title="What they see of you" tools={<span className="hfr-note">{v.savingVis ? "saving…" : v.savedVis ? "saved" : "for this friend only"}</span>}>
      <div className="hfr-body" data-tour="friends-what-they-see">
        <div className="hfr-line">
          <span className="hfr-key">Level</span>
          <Segmented label="What this friend sees" value={level} onChange={(val) => v.handlePrivacyOverride(val)}
            options={FRONT_LEVELS.map((l) => ({ value: l.id, label: l.label }))} />
        </div>
        <div className="hfr-line">
          <span className="hfr-key">Privacy override</span>
          <span className="hfr-val">
            {overrideWords(v.privacyOverride, globalPrivacyLevel)}
            {v.privacyOverride ? <Button rank="quiet" onClick={() => v.handlePrivacyOverride("global")}>Use my default</Button> : null}
          </span>
        </div>
        <div className="hfr-line">
          <span className="hfr-key">Notify on change</span>
          <span className="hfr-val">
            <Button rank={friend.notifyOnChange ? "primary" : "secondary"} className="hfr-tick" aria-pressed={!!friend.notifyOnChange}
              aria-label={`Notify me when who's ${v.ft.fronting} for them changes`} busy={v.togglingNotify}
              onClick={() => v.handleNotify(!friend.notifyOnChange)}>
              {friend.notifyOnChange ? <Check aria-hidden="true" className="hfr-tick-glyph" /> : null}
            </Button>
            {v.pushReady === false ? <span className="hfr-warn">Push notifications aren't on. Settings → Reminders turns them on.</span> : null}
          </span>
        </div>
        <p className="hfr-sunk" data-tour="friends-preview">{`Right now they would see: ${seeWords(view, terms)}.`}</p>
        {levelsPart}
        {hidePart}
      </div>
    </Panel>
  );

  const members = v.sharedMembers || [];
  const theirProfile = (
    <Panel className="hfr-pn" title="Their profile" tools={<span className="hfr-note">what they chose to share</span>}>
      <div className="hfr-body">
        <dl className="hfr-kv">
          {friend.systemName ? <><dt>{`${v.ft.System} name`}</dt><dd>{friend.systemName}</dd></> : null}
          <dt>Shown as</dt><dd>{friend.displayName || "Friend"}</dd>
        </dl>
        {v.loadingShare ? <LoadingBlock label="Decrypting what they share" rows={2} /> : members.length === 0 ? (
          <p className="hfr-p hfr-dim">{`They share no ${v.ft.alters} with you yet. Shared ${v.ft.alters} are end-to-end encrypted.`}</p>
        ) : (
          <ul className="hfr-members" aria-label="What they share with you">
            {members.map((m) => {
              const meta = [m.pronouns, m.role, m.age != null && m.age !== "" ? `age ${m.age}` : ""].filter(Boolean);
              const groupsOf = sharedGroupLabels(m);
              const fields = sharedCustomFieldPairs(m);
              return (
                <li key={m.id} className="hfr-member">
                  <span className="hfr-sq hfr-sq--md" style={{ background: m.color || "var(--house-raised)" }} aria-hidden="true" />
                  <span className="hfr-member-text">
                    <span><b>{m.name || v.ft.Alter}</b>{meta.length ? <span className="hfr-dim">{` · ${meta.join(" · ")}`}</span> : null}</span>
                    {groupsOf.length ? <span className="hfr-dim hfr-small">{groupsOf.join(", ")}</span> : null}
                    {m.bio ? <span className="hfr-small hfr-bio">{String(m.bio)}</span> : null}
                    {fields.length ? (
                      <dl className="hfr-kv hfr-kv--small">{fields.map(([k, val], i) => <React.Fragment key={i}><dt>{k}</dt><dd>{val}</dd></React.Fragment>)}</dl>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );

  const safety = (
    <Panel className="hfr-pn" title="Safety number" tools={<span className="hfr-note">{v.isVerified ? "verified" : "end-to-end encrypted"}</span>}>
      <div className="hfr-body" ref={safetyRef}>
        {v.safetyNum ? (revealSafety ? (
          <>
            <p className="hfr-sunk hfr-mono">{v.safetyNum}</p>
            <p className="hfr-p hfr-dim">Compare this with your friend another way (in person or a call). If it matches on both devices, no one is tampering with your connection.</p>
            <div className="hfr-acts">
              <Button rank={v.isVerified ? "secondary" : "primary"} onClick={() => v.setVerified(!v.isVerified)}>{v.isVerified ? "Unmark verified" : "Mark as verified"}</Button>
              <Button rank="quiet" icon={EyeOff} onClick={() => setRevealSafety(false)}>Hide</Button>
            </div>
          </>
        ) : (
          <Button rank="secondary" icon={Eye} onClick={() => setRevealSafety(true)}>Show the safety number</Button>
        )) : (
          <p className="hfr-p hfr-dim">{friend.publicKey ? "Preparing…" : "This friend hasn't set up encrypted sharing yet. The number appears once they've opened Friends on a version that supports it."}</p>
        )}
      </div>
    </Panel>
  );

  return <>{head}{theirFront}{whatTheySee}{theirProfile}{safety}</>;
}

// ── Your default levels (board 22, "Sharing levels") ───────────────────
// Read here; changed only in the profile dialog (registerIdentity), as before.
function DefaultLevelsPanel({ identity, terms, onManage }) {
  const rows = levelRows(identity?.privacyLevel || "names", terms);
  return (
    <Panel className="hfr-pn" title="Sharing levels" tools={<Button rank="quiet" onClick={onManage}>manage</Button>}>
      <ul className="hfr-lvls" aria-label="Your default sharing level" data-tour="friends-levels">
        {rows.map((r) => (
          <li key={r.id} className="hfr-lvl" data-on={r.isDefault || undefined}>
            <span>{r.label}</span><span className="hfr-dim">{r.isDefault ? `${r.hint} · your default` : r.hint}</span>
          </li>
        ))}
        <li className="hfr-lvl">
          <span>{`Each ${terms.fronter} shares`}</span><span className="hfr-dim">{shareModeLabel(identity?.fronterShareMode || "name").toLowerCase()}</span>
        </li>
      </ul>
    </Panel>
  );
}

// ── Show when {fronting}, per {alter} (board 22) ────────────────────────
function ShowWhenPanel({ terms }) {
  const queryClient = useQueryClient();
  const formatAlter = useAlterLabel();
  const sortAlters = useFrontersFirst();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(null);
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.filter({}) });
  const live = useMemo(() => sortAlters(alters.filter((a) => !a.is_archived)), [alters, sortAlters]);
  const shown = filterAltersByText(live, q, formatAlter);

  const flip = async (a) => {
    const on = a.friends_visible !== false;
    if (!on) {
      const ok = await confirm({
        title: `Show ${formatAlter(a)} when ${terms.fronting}?`,
        body: `Friends you haven't given sharing levels will see ${formatAlter(a)} in your ${terms.front} status from the next update (friends with levels still see only their levels, and a friend set to Hidden or Count only still won't).`,
        confirmLabel: `Show when ${terms.fronting}`,
      });
      if (!ok) return;
    }
    setBusy(a.id);
    try {
      await setAlterFields(a.id, { friends_visible: !on });
      queryClient.invalidateQueries({ queryKey: ["alters"] });
      queryClient.invalidateQueries({ queryKey: ["alter", a.id] });
      showToast({ message: on ? `${formatAlter(a)} is hidden from friends from the next update.` : `Friends will see ${formatAlter(a)} on the next update.` });
    } catch (e) {
      showToast({ tone: "failed", message: "Couldn't change that.", detail: e?.message || "Nothing was shared." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel className="hfr-pn" title={`Show when ${terms.fronting}`} tools={<span className="hfr-note">{`per ${terms.alter}`}</span>}>
      <div className="hfr-body hfr-body--tight" data-tour="friends-show-when">
        {live.length > 8 ? <TextField label={`Find ${an(terms.alter)}`} value={q} onChange={setQ} placeholder="Name or alias" /> : null}
        {live.length === 0 ? <p className="hfr-p hfr-dim">{`No ${terms.alters} yet.`}</p> : (
          <ul className="hfr-show" aria-label={`Show when ${terms.fronting}`}>
            {shown.map((a) => {
              const on = a.friends_visible !== false;
              return (
                <li key={a.id} className="hfr-showrow">
                  <span className="hfr-sq hfr-sq--sm" style={{ background: a.color || "var(--house-raised)" }} aria-hidden="true" />
                  <span className="hfr-showname">{formatAlter(a)}</span>
                  <Button rank={on ? "primary" : "secondary"} className="hfr-tick" aria-pressed={on} busy={busy === a.id}
                    aria-label={on ? `${formatAlter(a)} is shown when ${terms.fronting}: hide` : `${formatAlter(a)} is not shown when ${terms.fronting}: show`}
                    onClick={() => flip(a)}>
                    {on ? <Check aria-hidden="true" className="hfr-tick-glyph" /> : null}
                  </Button>
                </li>
              );
            })}
            {shown.length === 0 ? <li className="hfr-p hfr-dim">Nothing matches.</li> : null}
          </ul>
        )}
        <p className="hfr-p hfr-dim hfr-small">{`For friends without sharing levels. New ${terms.alters} start hidden.`}</p>
      </div>
    </Panel>
  );
}

// ── Member levels: what a friend's levels show (the old hub's insides) ──
function MemberLevelsPanel({ terms }) {
  const [manage, setManage] = useState(false);
  const [levelFor, setLevelFor] = useState(null);
  const [perAlter, setPerAlter] = useState(false);
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.filter({}) });
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const levels = useMemo(() => sortedLevels(getPrivacyLevels(pickPrimarySystemSettings(settingsList))), [settingsList]);
  const live = alters.filter((a) => !a.is_archived);
  return (
    <Panel className="hfr-pn" title="Member levels" tools={<Button rank="quiet" icon={Settings2} onClick={() => setManage(true)}>Manage levels</Button>}>
      <div className="hfr-body hfr-body--tight">
        <p className="hfr-p hfr-dim hfr-small">{`Levels decide what a friend sees of each ${terms.alter} (name, pronouns, bio…). ${terms.Alters} are private until you put them in a level.`}</p>
        {levels.length === 0 ? <p className="hfr-p hfr-dim">No levels yet. Manage levels makes some.</p> : (
          <ul className="hfr-lvls" aria-label="Member levels">
            {levels.map((l) => {
              const count = live.filter((a) => Array.isArray(a.privacy_levels) && a.privacy_levels.includes(l.id)).length;
              return (
                <li key={l.id}>
                  <Button rank="quiet" className="hfr-lvlbtn" aria-label={`Choose who is in ${l.name}`} onClick={() => setLevelFor(l)}>
                    <span className="hfr-lvl-in"><span>{`${l.number}. ${l.name}`}</span><span className="hfr-dim">{`${count} ${count === 1 ? terms.alter : terms.alters}`}</span></span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {levels.length ? (
          <>
            <Button rank="quiet" aria-expanded={perAlter} onClick={() => setPerAlter((o) => !o)}>{perAlter ? `Hide levels per ${terms.alter}` : `Set levels per ${terms.alter}`}</Button>
            {perAlter ? <div className="hfr-old"><PerAlterLevels maxHeight="40vh" /></div> : null}
          </>
        ) : null}
      </div>
      <PrivacyLevelsManager isOpen={manage} onClose={() => setManage(false)} />
      <LevelMembersModal isOpen={!!levelFor} level={levelFor} onClose={() => setLevelFor(null)} />
    </Panel>
  );
}

// ── How it works (board 22) ─────────────────────────────────────────────
function HowPanel({ terms, onRelay, onE2E }) {
  return (
    <Panel className="hfr-pn" title="How it works">
      <div className="hfr-body" data-tour="friends-how">
        {isCryptoAvailable() ? <p className="hfr-p">{`The ${terms.alters} you share are end-to-end encrypted: the relay only holds scrambled data. Who's ${terms.fronting} stays readable to the relay so it can notify friends; Count only or Hidden sends no names.`}</p> : null}
        <p className="hfr-p">Your data stays on this device. The relay holds only what you choose to share, push tokens and, if you turn them on, reminder times.</p>
        <div className="hfr-acts hfr-acts--col">
          <Button rank="secondary" icon={ShieldCheck} onClick={onRelay}>What the relay holds</Button>
          {isCryptoAvailable() ? <Button rank="secondary" icon={ShieldCheck} onClick={onE2E}>Keys, trust and limits</Button> : null}
          <Button rank="primary" icon={PlayCircle} onClick={() => openPageTour("/friends")}>Show me around this page</Button>
        </div>
      </div>
    </Panel>
  );
}
