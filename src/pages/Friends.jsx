import ErrorBoundary from "@/components/shared/ErrorBoundary";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import {
  Users, Copy, UserPlus, Check, X, Bell, BellOff, UserMinus,
  ChevronDown, ChevronUp, Loader2, Settings2, RefreshCw, Eye, EyeOff, ShieldCheck,
  Lock,
} from "lucide-react";
import { an } from "@/lib/articles";
import { levelIdsUpToThreshold, resolveVisibleAlters } from "@/lib/privacyLevels";
import { PREF_LEVELS } from "@/lib/alterPreferences";
import { PrefLevelIcon } from "@/components/alters/AlterPreferencesEditor";
import { isCryptoAvailable } from "@/lib/friendsCrypto";
import E2EInfoCard from "@/components/friends/E2EInfoCard";
import MemberSharingPanel from "@/components/friends/MemberSharingPanel";
import FrontShareNotice from "@/components/friends/FrontShareNotice";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";
import { useUiLook, usePixelDesk } from "@/lib/uiLook";
import { sharedGroupLabels, sharedCustomFieldPairs, friendFrontSummary } from "@/lib/friendsView";
import { useFriendView } from "@/components/friends/useFriendView";
import { useFriendsPage } from "@/components/friends/useFriendsPage";
import { PrivacyDisclaimer, ProfileSetupModal, AddFriendModal } from "@/components/friends/FriendsDialogs";
import "@/styles/pixel/social.css";

// ── helpers ── (the words and payload readers live in @/lib/friendsView)

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

// variant "desk": the pixel look's friend view (the Friends mockup's middle
// column) — always open, the same pieces laid out as titled panels.
function FriendCard({ friend, onRemove, onToggleNotify, alters = [], visibilitySettings = {}, onVisibilityChange, globalPrivacyLevel = 'names', terms, myPublicKeyJwk = null, verifiedNumber = null, onVerify, variant = "list" }) {
  const desk = variant === "desk";
  const [expanded, setExpanded] = useState(desk);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showVisibility, setShowVisibility] = useState(false);
  const [advancedLevels, setAdvancedLevels] = useState(false);
  const [showVisibleList, setShowVisibleList] = useState(false);
  const [visShown, setVisShown] = useState(60);
  const [revealSafety, setRevealSafety] = useState(false); // hidden until tapped (it's a long sensitive value)
  // The friend's state and writes are shared with the house's Friends room.
  const {
    ft, fronters, updatedAt, privacyLevel,
    removing, handleRemove, togglingNotify, handleNotify, pushReady,
    savingVis, savedVis, hiddenAlterIds, toggleAlterHidden, privacyOverride, handlePrivacyOverride,
    allowedLevelIds, allowedSet, saveLevels, levels, maxLevelNumber, thresholdValue, sharedCount,
    sharedMembers, loadingShare, safetyNum,
  } = useFriendView({ friend, open: expanded, alters, visibilitySettings, onVisibilityChange, onRemove, onToggleNotify, myPublicKeyJwk, verifiedNumber, onVerify });

  const frontSummary = () => friendFrontSummary(friend);

  // Pieces of the expanded card, shared by the list card and the pixel
  // desk's friend view (variant "desk").
  const prefsBlock = fronters.some((f) => Array.isArray(f.preferences) && f.preferences.length > 0) && (
                    <div className="mt-2 space-y-1.5">
                      {fronters.filter((f) => Array.isArray(f.preferences) && f.preferences.length > 0).map((f, i) => (
                        <div key={`prefs-${i}`} className="text-xs">
                          <span className="text-muted-foreground">{f.name}:</span>{" "}
                          <span className="inline-flex flex-wrap gap-1 align-middle">
                            {[...f.preferences].sort((a, b) => (b.level || 3) - (a.level || 3)).map((p, j) => {
                              const lvl = PREF_LEVELS[p.level] || PREF_LEVELS[3];
                              return (
                                <span key={j} title={lvl.label}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-xs"
                                  style={{ borderColor: `${lvl.color}66`, backgroundColor: `${lvl.color}14` }}>
                                  <PrefLevelIcon level={p.level} className="w-3 h-3" filled />{p.label}
                                </span>
                              );
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
  const fronterList = privacyLevel !== 'hidden' && fronters.length > 0 && (
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
                        {f.pronouns && f.pronouns !== f.name && (
                          <span className="opacity-60 font-normal">· {f.pronouns}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Shared preferences/boundaries — pronouns.cc-style chips.
                      Only present when the friend's share mode includes them. */}
                  {prefsBlock}
                </div>
              );
  const sharedMembersBlock = (loadingShare || (sharedMembers && sharedMembers.length > 0)) && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1.5">
                    <Lock className="w-3 h-3" /> Members they share with you
                  </p>
                  {loadingShare ? (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Decrypting…</p>
                  ) : (
                    <div className="space-y-1.5">
                      {sharedMembers.map((m) => {
                        const meta = [m.pronouns, m.role, m.age != null && m.age !== "" ? `age ${m.age}` : ""].filter(Boolean);
                        return (
                          <div key={m.id} className="flex items-start gap-2.5 p-2 rounded-lg border border-border/40 bg-muted/10">
                            <span className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[0.625rem] font-bold text-white mt-0.5" style={{ background: m.color || "#6b7280" }}>
                              {(m.name?.[0] || "?").toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-foreground">
                                {m.name || <span className="italic text-muted-foreground">Member</span>}
                                {meta.length > 0 && <span className="text-xs text-muted-foreground"> · {meta.join(" · ")}</span>}
                              </p>
                              {/* Everything below came over the wire from a
                                  FRIEND's device — possibly a different app
                                  version. Normalise every shape before
                                  iterating: a payload we don't recognise
                                  must never take the whole Friends page down
                                  ("object is not iterable" crash, tester
                                  report 2026-08-18). */}
                              {sharedGroupLabels(m).length > 0 && (
                                <p className="mt-1 flex flex-wrap gap-1">
                                  {sharedGroupLabels(m).map((g, i) => <span key={i} className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{g}</span>)}
                                </p>
                              )}
                              {m.bio && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">{String(m.bio)}</p>}
                              {sharedCustomFieldPairs(m).length > 0 && (
                                <dl className="mt-1 text-[0.6875rem] text-muted-foreground space-y-0.5">
                                  {sharedCustomFieldPairs(m).map(([k, v], i) => (<div key={i}><span className="font-medium text-foreground/80">{k}:</span> {v}</div>))}
                                </dl>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
  const safetyBlock = (<div className="rounded-lg border border-border/40 bg-muted/10 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1.5"><Lock className="w-3 h-3" /> Safety number</span>
                  {safetyNum && verifiedNumber === safetyNum && (
                    <span className="text-[0.6875rem] text-green-500 inline-flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Verified</span>
                  )}
                </div>
                {safetyNum ? (
                  revealSafety ? (
                    <>
                      <p className="font-mono text-xs tracking-wide text-foreground bg-background rounded-lg px-2 py-1.5 break-all select-all">{safetyNum}</p>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[0.625rem] text-muted-foreground flex-1">Compare this with your friend another way (in person or a call). If it matches on both devices, no one is tampering with your connection.</p>
                        <button type="button" onClick={() => setRevealSafety(false)} className="text-[0.6875rem] text-muted-foreground hover:underline inline-flex items-center gap-1 flex-shrink-0"><EyeOff className="w-3 h-3" /> Hide</button>
                      </div>
                      {verifiedNumber === safetyNum ? (
                        <button type="button" onClick={() => onVerify?.(friend.userId, null)} className="text-[0.6875rem] text-muted-foreground hover:underline">Unmark verified</button>
                      ) : (
                        <button type="button" onClick={() => onVerify?.(friend.userId, safetyNum)} className="text-[0.6875rem] text-primary hover:underline">Mark as verified</button>
                      )}
                    </>
                  ) : (
                    <button type="button" onClick={() => setRevealSafety(true)} className="w-full font-mono text-xs tracking-widest text-muted-foreground/70 bg-background rounded-lg px-2 py-1.5 inline-flex items-center justify-center gap-1.5 hover:text-foreground transition-colors">
                      <Eye className="w-3 h-3" /> Tap to reveal safety number
                    </button>
                  )
                ) : (
                  <p className="text-[0.625rem] text-muted-foreground">
                    {friend.publicKey
                      ? "Preparing…"
                      : "This friend hasn't set up encrypted sharing yet — the number appears once they've opened the Friends page on a version that supports it."}
                  </p>
                )}
              </div>);
  const levelsBlock = (<div className="pt-3 border-t border-border/40 space-y-2">
                    <span className="text-xs font-medium text-foreground">{terms?.Alters || "Members"} this friend can see</span>
                    {levels.length === 0 ? (
                      <p className="text-[0.6875rem] text-muted-foreground">
                        No privacy levels yet. Create them from {an(terms?.alter || "alter")}'s profile → Options → Sharing levels.
                      </p>
                    ) : (
                      <>
                        {!advancedLevels ? (
                          <div className="space-y-1">
                            <input
                              type="range" min={-1} max={maxLevelNumber} step={1} value={thresholdValue}
                              onChange={(e) => { const n = Number(e.target.value); saveLevels(n < 0 ? [] : levelIdsUpToThreshold(levels, n)); }}
                              className="w-full accent-primary" aria-label="Privacy levels this friend can see" />
                            <p className="text-[0.6875rem] text-muted-foreground">
                              {thresholdValue < 0 ? "Sees none of your levels" : `Sees levels 0–${thresholdValue}`}
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {levels.map((l) => {
                              const on = allowedSet.has(l.id);
                              return (
                                <button key={l.id} type="button" aria-pressed={on}
                                  onClick={() => saveLevels(on ? allowedLevelIds.filter((id) => id !== l.id) : [...allowedLevelIds, l.id])}
                                  className={`text-[0.6875rem] px-2 py-1 rounded-full border transition-colors ${on ? "border-primary/50 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:bg-muted/40"}`}>
                                  {l.number}. {l.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <button type="button" onClick={() => setAdvancedLevels((v) => !v)} className="text-[0.6875rem] text-primary hover:underline">
                            {advancedLevels ? "Use simple slider" : "Pick specific levels"}
                          </button>
                          <span className="text-[0.6875rem] text-muted-foreground">{sharedCount} {sharedCount === 1 ? (terms?.alter || "alter") : (terms?.alters || "alters")} shared</span>
                        </div>
                        {/* Live preview — exactly who this friend can see right now,
                            recomputed from the granted levels + per-alter hides. */}
                        {(() => {
                          const visible = resolveVisibleAlters({ alters, levels, visibility: { allowedLevelIds, hiddenAlterIds } });
                          if (visible.length === 0) {
                            return <p className="text-[0.625rem] text-muted-foreground italic">No {terms?.alters || "alters"} visible with the current levels.</p>;
                          }
                          // Collapsed by default so large systems don't flood the
                          // card — tap to reveal the (capped) list.
                          return (
                            <div className="rounded-lg border border-border/40 bg-muted/10 p-2 space-y-1">
                              <button type="button" onClick={() => { setShowVisibleList((v) => !v); setVisShown(60); }} className="text-[0.625rem] text-primary hover:underline">
                                {showVisibleList ? "Hide" : "Show"} the {visible.length} {visible.length === 1 ? (terms?.alter || "alter") : (terms?.alters || "alters")} they can see
                              </button>
                              {showVisibleList && (
                                <div className="max-h-48 overflow-y-auto overscroll-contain space-y-0.5 mt-1 pr-1"
                                  onScroll={(e) => { const el = e.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) setVisShown((s) => s + 60); }}>
                                  {[...visible].sort((a, b) => (a.alter.name || "").localeCompare(b.alter.name || "")).slice(0, visShown).map(({ alter }) => (
                                    <div key={alter.id} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted/20">
                                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: alter.color || "#6b7280" }} />
                                      <span className="text-[0.6875rem] text-foreground/90 truncate">{alter.name}</span>
                                    </div>
                                  ))}
                                  {visible.length > visShown && <p className="text-[0.625rem] text-muted-foreground italic py-1 text-center">Loading more… ({visShown}/{visible.length})</p>}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        {allowedLevelIds.length > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            When {terms?.fronting || "fronting"}, this friend sees only these {terms?.alters || "alters"}, with the fields their levels share.
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            With no levels, this friend sees whoever has "Show when {terms?.fronting || "fronting"}" on.
                          </p>
                        )}
                        <p className="text-[0.625rem] text-muted-foreground">Shared end-to-end encrypted — changes reach this friend right away.</p>
                      </>
                    )}
                  </div>);
  const hideAltersBlock = (privacyOverride === 'names' || (!privacyOverride && globalPrivacyLevel === 'names')) && alters.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Hide specific {terms?.alters || 'alters'} from this friend:</span>
                      <AlterTreeSelect
                        controlPosition="right"
                        renderControl={(alter) => {
                          // With levels granted, the levels decide — the profile switch only
                          // covers friends without levels.
                          const globallyHidden = alter.friends_visible === false && allowedLevelIds.length === 0;
                          const locallyHidden = hiddenAlterIds.includes(alter.id);
                          const isVisible = !globallyHidden && !locallyHidden;
                          return (
                            <button
                              disabled={globallyHidden}
                              onClick={() => !globallyHidden && toggleAlterHidden(alter.id)}
                              className={`flex-shrink-0 p-1 rounded transition-colors ${globallyHidden ? 'cursor-not-allowed opacity-40' : isVisible ? 'text-primary hover:text-primary/70' : 'text-muted-foreground hover:text-foreground'}`}
                              title={globallyHidden ? `Hidden from all friends: "Show when ${terms?.fronting || 'fronting'}" is off in their profile → Options` : isVisible ? 'Visible — tap to hide' : 'Hidden — tap to show'}
                            >
                              {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            </button>
                          );
                        }}
                        maxHeight="44vh"
                      />
                    </div>
                  );

  if (desk) {
    const LEVEL_LABEL = { hidden: "hidden", count_only: "count only", names: "names and colours" };
    const effective = privacyOverride || globalPrivacyLevel;
    const theirLevel = { hidden: `they share nothing about who's ${ft.fronting}`, count_only: "they share a count only", names: "they share names and colours" }[privacyLevel] || "";
    const isVerified = !!safetyNum && verifiedNumber === safetyNum;
    const levelChoices = [
      { v: "global", label: `My default (${LEVEL_LABEL[globalPrivacyLevel] || "names and colours"})` },
      { v: "hidden", label: "Hidden" },
      { v: "count_only", label: "Count only" },
      { v: "names", label: "Names and colours" },
    ];
    return (
      <div className="pf-friend">
        <section className="pf-panel pf-head">
          <span className="pf-bigmark" style={{ background: fronters[0]?.color || "var(--px-tab)" }} aria-hidden />
          <div className="pf-head-text">
            <h2 className="pf-name">{friend.displayName || "Friend"}</h2>
            <p className="pf-dim">
              {[friend.systemName, isVerified ? "verified" : null, updatedAt ? `updated ${formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <span className="pf-grow" />
          {safetyNum && (
            <button type="button" className="pf-btn" onClick={() => onVerify?.(friend.userId, isVerified ? null : safetyNum)}>
              {isVerified ? "Unmark verified" : "Mark verified"}
            </button>
          )}
          <div className="relative">
            <button type="button" className="pf-btn" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} aria-label="More for this friend">...</button>
            {moreOpen && (
              <div className="pf-menu" role="menu">
                <button type="button" role="menuitem" className="pf-menu-item pf-danger" onClick={() => { setMoreOpen(false); handleRemove(); }} disabled={removing}>
                  {removing ? "Removing…" : "Remove friend"}
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="pf-panel">
          <div className="pf-ttl"><span>Who's {ft.fronting} for them</span><span className="pf-ttl-dim">{theirLevel}</span></div>
          <div className="pf-body">
            {privacyLevel === "hidden" || fronters.length === 0 ? (
              <p className="pf-dim">{frontSummary()}</p>
            ) : privacyLevel === "count_only" ? (
              <p>{frontSummary()}</p>
            ) : (
              <>
                <div className="pf-fronters">
                  {fronters.map((f, i) => (
                    <div key={i} className="pf-fronter">
                      <span className="pf-mark" style={{ background: f.color || "var(--px-text-2)" }} aria-hidden />
                      <span>
                        <b>{f.name}</b>
                        <span className="pf-dim pf-small">{[f.isPrimary ? "primary" : null, f.pronouns && f.pronouns !== f.name ? f.pronouns : null].filter(Boolean).join(" · ") || "\u00a0"}</span>
                      </span>
                    </div>
                  ))}
                </div>
                {prefsBlock}
              </>
            )}
          </div>
        </section>

        <section className="pf-panel">
          <div className="pf-ttl"><span>What they see of you</span><span className="pf-ttl-dim">{savingVis ? "saving…" : savedVis ? "saved" : "for this friend only"}</span></div>
          <div className="pf-body">
            <div className="pf-line">
              <span className="pf-key">Level</span>
              <div className="pf-chips" role="group" aria-label="What this friend sees">
                {levelChoices.map((c) => {
                  const on = (privacyOverride || "global") === c.v;
                  return <button key={c.v} type="button" className={`pf-chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => handlePrivacyOverride(c.v)}>{c.label}</button>;
                })}
              </div>
            </div>
            <div className="pf-line">
              <span className="pf-key">Notify on change</span>
              <button type="button" className={`pf-tick${friend.notifyOnChange ? " y" : ""}`} aria-pressed={!!friend.notifyOnChange}
                aria-label="Notify me when their front changes" disabled={togglingNotify} onClick={() => handleNotify(!friend.notifyOnChange)}>
                {togglingNotify ? <Loader2 className="w-3 h-3 animate-spin" /> : friend.notifyOnChange ? "x" : ""}
              </button>
              {pushReady === false && <span className="pf-warn">Push notifications aren't on — Settings → Reminders turns them on.</span>}
            </div>
            <p className="pf-sunk">Right now they would see: {effective === "hidden" ? "nothing" : effective === "count_only" ? `a count of who's ${terms?.fronting || "fronting"}` : `the names and colours of who's ${terms?.fronting || "fronting"}`}.</p>
            <div className="pf-sub">{levelsBlock}</div>
            {hideAltersBlock && <div className="pf-sub">{hideAltersBlock}</div>}
          </div>
        </section>

        {sharedMembersBlock && (
          <section className="pf-panel">
            <div className="pf-ttl"><span>Their profile</span><span className="pf-ttl-dim">what they chose to share</span></div>
            <div className="pf-body">{sharedMembersBlock}</div>
          </section>
        )}

        <section className="pf-panel">
          <div className="pf-ttl"><span>Safety number</span><span className="pf-ttl-dim">end-to-end encrypted</span></div>
          <div className="pf-body">{safetyBlock}</div>
        </section>
      </div>
    );
  }

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
              {fronterList}

              {/* Members this friend shares with you (end-to-end encrypted) */}
              {sharedMembersBlock}

              {/* ── Safety number (E2E key verification) — always shown when expanded ── */}
              {safetyBlock}

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

                  {/* ── Member-list sharing (privacy levels) ── */}
                  {levelsBlock}

                  {/* Per-alter hide toggles — only when effective privacy shows names.
                      Uses the standard tree picker (by subsystem / group, searchable,
                      lazy) with an eye toggle as the per-row control. */}
                  {hideAltersBlock}
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FriendsPage() {
  const [showSetup, setShowSetup] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  // The pixel look: the Friends mockup's desk (friends · the open friend ·
  // sharing and how it works), stacked on a phone.
  const pixel = useUiLook() === "pixel";
  const pixelDesk = usePixelDesk();
  const [selectedFriendId, setSelectedFriendId] = useState(null);
  // Reads, relay effects and handlers: shared with the house's Friends room.
  const {
    terms, identity, identityLoading, refetchIdentity, alters,
    friends, pending, pendingSent, friendsLoading, refetchFriends,
    myPublicKeyJwk, copied, copyCode, adder,
    handleRespond, handleRemove, handleToggleNotify, handleVisibilityChange, handleVerifyFriend,
  } = useFriendsPage();

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
      <div className="os-page-shell p-6 space-y-5">
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

        {/* Sharing can be set up BEFORE creating a profile — privacy levels and
            per-member assignment live on your own data, so they're ready the
            moment you connect with someone. No friends needed to configure. */}
        <div className="pt-3 border-t border-border/40 space-y-3">
          <div className="text-center space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Set up sharing first (optional)</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Define privacy levels and choose what each {terms.alter} shares now — no friends needed yet. It'll be ready when you connect with someone.
            </p>
          </div>
          <MemberSharingPanel />
        </div>

        <ProfileSetupModal
          open={showSetup}
          onClose={() => setShowSetup(false)}
          onSaved={refetchIdentity}
        />
      </div>
    );
  }

  if (pixel) {
    const selected = friends.find((f) => f.userId === selectedFriendId) || (pixelDesk ? friends[0] : null) || null;
    return (
      <div className={`pf-desk${pixelDesk ? " pf-desk-wide" : ""}`}>
        <aside className="pf-panel pf-list" aria-label="Friends">
          <div className="pf-ttl">
            <span>Friends</span>
            <button type="button" className="pf-ttl-dim pf-ttl-btn" onClick={() => refetchFriends()} title="Refresh">updates every 30 s</button>
          </div>
          <div className="pf-rows">
            {friendsLoading && friends.length === 0 && <p className="pf-dim pf-pad"><Loader2 className="inline w-3 h-3 animate-spin" /> Loading…</p>}
            {!friendsLoading && friends.length === 0 && pending.length === 0 && pendingSent.length === 0 && (
              <p className="pf-dim pf-pad">No friends yet. Share your code or add a friend's code below.</p>
            )}
            {friends.map((f) => {
              const sel = selected?.userId === f.userId;
              const verified = !!identity?.verifiedFriends?.[f.userId];
              return (
                <button key={f.userId} type="button" className={`pf-frow${sel ? " sel" : ""}`} aria-pressed={sel} onClick={() => setSelectedFriendId(sel && !pixelDesk ? null : f.userId)}>
                  <span className="pf-mark" style={{ background: f.front?.fronters?.[0]?.color || "var(--px-tab)" }} aria-hidden />
                  <span className="pf-frow-text">
                    <span className="pf-frow-name">{f.displayName || "Friend"}{f.systemName ? <span className="pf-dim"> · {f.systemName}</span> : null}</span>
                    <span className="pf-dim pf-small">{friendFrontSummary(f)}{f.notifyOnChange ? " · notify on" : ""}</span>
                  </span>
                  {verified && <span className="pf-ok">verified</span>}
                </button>
              );
            })}
            {pending.map((req) => (
              <div key={req.fromUserId} className="pf-frow pf-req">
                <span className="pf-mark" style={{ background: "var(--color-primary)" }} aria-hidden />
                <span className="pf-frow-text">
                  <span className="pf-frow-name">New request: {req.fromDisplayName || "Unknown"}</span>
                  <span className="pf-dim pf-small">{[req.fromSystemName, req.requestedAt ? formatDistanceToNow(new Date(req.requestedAt), { addSuffix: true }) : null].filter(Boolean).join(" · ")}</span>
                  <span className="pf-req-acts">
                    <button type="button" className="pf-chip on" onClick={() => handleRespond(req.fromUserId, 'approve')}>Accept</button>
                    <button type="button" className="pf-chip" onClick={() => handleRespond(req.fromUserId, 'deny')}>Decline</button>
                  </span>
                </span>
              </div>
            ))}
            {pendingSent.map((uid) => (
              <div key={uid} className="pf-frow pf-req">
                <span className="pf-mark" aria-hidden />
                <span className="pf-frow-text">
                  <span className="pf-frow-name">Request sent</span>
                  <span className="pf-dim pf-small">waiting for approval</span>
                </span>
              </div>
            ))}
          </div>
          <div className="pf-add" data-tour="friends-code">
            <div className="pf-add-ttl">Add a friend</div>
            <div className="pf-add-row">
              <input className="pf-input" placeholder="XXXX-XXXX" aria-label="Friend code" value={adder.code}
                onChange={(e) => adder.setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") adder.handleSend(); }} />
              <button type="button" className="pf-btn pf-btn-on" onClick={adder.handleSend} disabled={adder.sending || !adder.code.trim()}>
                {adder.sending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
              </button>
            </div>
            {adder.error && <p className="pf-warn">{adder.error}</p>}
            <div className="pf-code">
              <span>Your code: <b>{identity.friendCode}</b></span>
              <button type="button" className="pf-chip" onClick={copyCode}>{copied ? "Copied" : "Copy"}</button>
            </div>
            <div className="pf-code">
              <span className="pf-dim pf-small">Visible as {identity.displayName || "—"}{identity.systemName ? ` · ${identity.systemName}` : ""}</span>
              <button type="button" className="pf-chip" onClick={() => setShowSetup(true)}>Profile</button>
            </div>
          </div>
        </aside>

        <main className="pf-main">
          {selected ? (
            <ErrorBoundary key={selected.userId} resetKeys={[selected.userId]}
              fallback={<div className="pf-panel pf-body pf-dim">This friend's view couldn't be drawn ({selected.displayName || selected.userId}). Their data is safe — this is a display problem, please report it.</div>}>
              <FriendCard
                variant="desk"
                friend={selected}
                onRemove={async (id) => { await handleRemove(id); setSelectedFriendId(null); }}
                onToggleNotify={handleToggleNotify}
                alters={alters}
                visibilitySettings={identity?.perFriendVisibility?.[selected.userId] || {}}
                onVisibilityChange={handleVisibilityChange}
                globalPrivacyLevel={identity?.privacyLevel || 'names'}
                terms={terms}
                myPublicKeyJwk={myPublicKeyJwk}
                verifiedNumber={identity?.verifiedFriends?.[selected.userId] || null}
                onVerify={handleVerifyFriend}
              />
            </ErrorBoundary>
          ) : pixelDesk ? (
            <section className="pf-panel pf-body pf-dim">Pick a friend to see who's {terms.fronting} for them and choose what they see of you.</section>
          ) : null}
        </main>

        <aside className="pf-aside">
          <FrontShareNotice />
          <section className="pf-panel">
            <div className="pf-ttl"><span>Sharing levels</span><span className="pf-ttl-dim">per {terms.alter}</span></div>
            <div className="pf-body"><MemberSharingPanel /></div>
          </section>
          <section className="pf-panel">
            <div className="pf-ttl"><span>How it works</span></div>
            <div className="pf-body pf-how">
              {isCryptoAvailable() && <E2EInfoCard />}
              <details>
                <summary className="pf-link">What gets shared with the cloud relay?</summary>
                <PrivacyDisclaimer />
              </details>
            </div>
          </section>
        </aside>

        <ProfileSetupModal open={showSetup} onClose={() => setShowSetup(false)} onSaved={refetchIdentity} onDeleted={refetchIdentity} existing={identity} />
      </div>
    );
  }

  return (
    <div className="os-page-shell p-4 space-y-6">
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
                    type="button"
                    onClick={() => handleRespond(req.fromUserId, 'approve')}
                    className="flex items-center gap-1 px-3 py-2 min-h-[36px] rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 active:bg-primary/80 transition-colors touch-manipulation"
                  >
                    <Check className="w-3.5 h-3.5" /> Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespond(req.fromUserId, 'deny')}
                    className="flex items-center gap-1 px-3 py-2 min-h-[36px] rounded-lg border border-border text-xs hover:bg-muted active:bg-muted/80 transition-colors touch-manipulation"
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

      {/* Someone up front that friends can't see — and why. */}
      <FrontShareNotice />

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
            {isCryptoAvailable() && <E2EInfoCard />}
            <MemberSharingPanel />
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Friends ({friends.length})
              </p>
              <p className="text-xs text-muted-foreground/60">Updates every 30 s</p>
            </div>
            {friends.map((friend) => (
              // One friend's odd payload must never blank the whole page.
              <ErrorBoundary key={friend.userId} resetKeys={[friend.userId]}
                fallback={<div className="p-3 rounded-xl border border-destructive/30 text-xs text-muted-foreground">This friend's card couldn't be drawn ({friend.displayName || friend.name || friend.userId}). Their data is safe — this is a display problem, please report it.</div>}>
              <FriendCard
                friend={friend}
                onRemove={handleRemove}
                onToggleNotify={handleToggleNotify}
                alters={alters}
                visibilitySettings={identity?.perFriendVisibility?.[friend.userId] || {}}
                onVisibilityChange={handleVisibilityChange}
                globalPrivacyLevel={identity?.privacyLevel || 'names'}
                terms={terms}
                myPublicKeyJwk={myPublicKeyJwk}
                verifiedNumber={identity?.verifiedFriends?.[friend.userId] || null}
                onVerify={handleVerifyFriend}
              />
              </ErrorBoundary>
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
