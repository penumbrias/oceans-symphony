// The house's Polls room: board 25-PollsPhone (a column of poll cards you
// vote on in place: Open/Closed and its note on the title bar, each option a
// flat tick, its voters' squares, a count and an amber bar; a tally poll's
// "Anonymous tally count − n +" box; the foot says who is voting, and
// "edit ..." opens the poll's sheet) and, on a computer or tablet, the same
// cards on the checked floor with the desktop frame's conventions: one slim
// toolbar (the filter · New poll; the page name stays a screen-reader
// heading because the frame's tab already shows it) and the status line.
// House mode only: the frames draw it on /polls (housePollsRoom); the old
// page is gated off (HouseRoomGate) and stays exactly as it was with the
// new house off.
//
// Writes, all through src/lib/pollEntry.js (the one poll write path the old
// page, the widgets and the board use): castPollVote (fresh read, per-voter
// toggle or one tally mark), decrementTallyVote, createPoll, editPoll (votes
// follow their option), setPollPinned, closePoll, trashPoll (inside
// trashWithUndo, so it goes to the trash with Undo), rememberTallyMode.
// Voters are picked with SetFrontModal's selection mode (the app's one
// multi-alter picker); nothing here writes a fronting session.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pin, PinOff, Lock, Trash2, Users, X, ListFilter } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { base44 } from "@/api/base44Client";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { Button, IconButton } from "@/house/kit/Button";
import { TextField } from "@/house/kit/Field";
import { Checkbox, Switch, Segmented } from "@/house/kit/Choices";
import { AlterPicker } from "@/house/kit/Pickers";
import { Sheet, ConfirmSheet } from "@/house/kit/Sheet";
import Menu from "@/house/kit/Menu";
import { EmptyBlock, LoadingBlock } from "@/house/kit/States";
import { showToast, trashWithUndo } from "@/house/kit/Toast";
import { useRoomTools } from "@/house/frame/roomTools";
import SetFrontModal from "@/components/fronting/SetFrontModal";
import { sharedList } from "@/lib/sharedLists";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { an } from "@/lib/articles";
import {
  castPollVote, decrementTallyVote, createPoll, editPoll, setPollPinned, closePoll, trashPoll,
  defaultTallyMode, rememberTallyMode,
} from "@/lib/pollEntry";
import {
  sortPolls, filterPolls, pollMeta, pollTotals, barPct, votedBy, votersOf, pollFoot, canClose, voterMarks,
  optionLabel, optionVoters, editableOptions, formToSave, formProblem, statusWords, MAX_OPTIONS,
} from "@/house/polls/pollsModel";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/polls/polls.css";

const dateWords = (iso) => format(new Date(iso), "MMM d");
const agoWords = (iso) => formatDistanceToNow(new Date(iso), { addSuffix: true });

export default function HousePolls({ size = "full", tokens }) {
  const phone = size === "phone";
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const [filter, setFilter] = useState("all");
  const [sheet, setSheet] = useState(null); // { mode: "new" } | { mode: "edit", id }
  // Who votes on each poll, when the person picked someone other than the front.
  const [chosen, setChosen] = useState({});

  const { data: polls = [], isLoading } = useQuery({ ...sharedList("polls") });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: live = [] } = useQuery({
    queryKey: ["frontingSessions", "active"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const frontIds = useMemo(() => [...new Set(live.map((s) => s.alter_id || s.primary_alter_id).filter(Boolean))], [live]);
  const byId = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const sorted = useMemo(() => sortPolls(polls), [polls]);
  const shown = filterPolls(sorted, filter);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["polls"] });
    queryClient.invalidateQueries({ queryKey: ["bulletins"] });
  }, [queryClient]);

  // ── /polls?id= (the board, search, the timeline): find the card and pulse it ──
  const wanted = new URLSearchParams(location.search).get("id");
  useEffect(() => {
    if (!wanted || isLoading) return;
    if (!sorted.some((p) => p.id === wanted)) { navigate("/polls", { replace: true }); return; }
    setFilter("all");
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-polls-room] [data-highlight-id="${CSS.escape(wanted)}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("scroll-highlight-halo");
        setTimeout(() => el.classList.remove("scroll-highlight-halo"), 3200);
      }
      navigate("/polls", { replace: true });
    }, 120);
    return () => clearTimeout(t);
  }, [wanted, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps -- once per arrival

  const openNew = useCallback(() => setSheet({ mode: "new" }), []);
  const editing = sheet?.mode === "edit" ? sorted.find((p) => p.id === sheet.id) || null : null;

  // ── The phone's header: + and ⋯ ──
  const tools = useMemo(() => (phone ? {
    info: { label: "+", ariaLabel: "New poll", tour: "polls-create", onSelect: openNew },
    items: [
      { id: "new", label: "New poll", icon: Plus, onSelect: openNew },
      { id: "all", label: filter === "all" ? "Showing every poll" : "Show every poll", icon: ListFilter, onSelect: () => setFilter("all") },
      { id: "open", label: filter === "open" ? "Showing open polls" : "Show open polls", icon: ListFilter, onSelect: () => setFilter("open") },
      { id: "closed", label: filter === "closed" ? "Showing closed polls" : "Show closed polls", icon: ListFilter, onSelect: () => setFilter("closed") },
    ],
  } : null), [phone, openNew, filter]);
  useRoomTools(tools);

  const list = isLoading ? <LoadingBlock label="Loading polls" rows={3} /> : sorted.length === 0 ? (
    <div className="hpo-first">
      <EmptyBlock title="No polls yet" body={`A poll lets the whole ${terms.system} decide together: by ${terms.alter}, or as an anonymous tally.`}
        action={{ label: "New poll", icon: Plus, onClick: openNew }} />
    </div>
  ) : shown.length === 0 ? (
    <p className="hpo-none">{filter === "open" ? "No open polls." : "No closed polls."}</p>
  ) : (
    <div className="hpo-cards" data-tour="polls-list">
      {shown.map((p) => (
        <PollCard key={p.id} poll={p} byId={byId} frontIds={frontIds} chosen={chosen[p.id]}
          terms={terms} formatAlter={formatAlter} refresh={refresh} onEdit={() => setSheet({ mode: "edit", id: p.id })} />
      ))}
    </div>
  );

  const sheets = (
    <PollSheet key={sheet?.mode === "edit" ? `e-${sheet.id}` : sheet ? "new" : "none"}
      open={!!sheet && (sheet.mode === "new" || !!editing)} poll={editing} alters={alters} byId={byId} frontIds={frontIds}
      chosen={editing ? chosen[editing.id] : null}
      onChoose={(ids) => editing && setChosen((c) => ({ ...c, [editing.id]: ids }))}
      onClose={() => setSheet(null)} refresh={refresh} terms={terms} formatAlter={formatAlter} />
  );

  if (phone) {
    return (
      <HouseScope tokens={tokens} className="hpo hpo--phone" data-house-size="phone" data-polls-room="">
        <h1 className="hk-sr">Polls</h1>
        <div className="hpo-floor">{list}</div>
        {sheets}
      </HouseScope>
    );
  }

  return (
    <HouseScope tokens={tokens} className="hpo hpo--studio" data-house-size={size} data-polls-room="">
      <div className="hpo-bar">
        <div className="hpo-toolbar" role="toolbar" aria-label="Polls">
          <h1 className="hk-sr">Polls</h1>
          <Segmented label="Show" value={filter} onChange={setFilter}
            options={[{ value: "all", label: "All" }, { value: "open", label: "Open" }, { value: "closed", label: "Closed" }]} />
          <span className="hpo-grow" />
          <Button rank="primary" icon={Plus} data-tour="polls-create" onClick={openNew}>New poll</Button>
        </div>
      </div>
      <div className="hpo-scroll">
        <div className="hpo-floor" data-house-size={size}>{list}</div>
      </div>
      <div className="hpo-status" role="status">
        <span>{statusWords(sorted)}</span>
        <span className="hpo-grow" />
        <span>{frontIds.length ? `Voting as whoever is in ${terms.front} unless a poll says otherwise` : `No one in ${terms.front}: votes count for the ${terms.system}`}</span>
      </div>
      {sheets}
    </HouseScope>
  );
}

// ── One poll card (board 25) ────────────────────────────────────────────
function PollCard({ poll, byId, frontIds, chosen, terms, formatAlter, refresh, onEdit }) {
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(0); // a tally poll's chosen option
  const [votes, setVotes] = useState(null); // optimistic votes while a write lands
  useEffect(() => { setVotes(null); }, [poll.votes]);
  const shownPoll = votes ? { ...poll, votes } : poll;
  const voters = votersOf(chosen, frontIds);
  const { counts, total } = pollTotals(shownPoll);
  const closed = !!poll.is_closed;
  const tally = !!poll.tally_mode;
  const options = poll.options || [];
  const pick = Math.min(picked, Math.max(0, options.length - 1));

  const vote = async (idx) => {
    if (closed || busy) return;
    if (tally) { setPicked(idx); return; }
    setBusy(true);
    try { await castPollVote(poll, idx, voters, { onVotes: setVotes }); refresh(); }
    catch (e) { setVotes(null); showToast({ tone: "failed", message: "Couldn't count that vote.", detail: e?.message || "Nothing was changed." }); }
    finally { setBusy(false); }
  };
  const addMark = async () => {
    if (closed || busy) return;
    setBusy(true);
    try { await castPollVote(poll, pick, [], { onVotes: setVotes }); refresh(); }
    catch (e) { setVotes(null); showToast({ tone: "failed", message: "Couldn't add one.", detail: e?.message || "Nothing was changed." }); }
    finally { setBusy(false); }
  };
  const takeMark = async () => {
    if (closed || busy) return;
    setBusy(true);
    try { if (await decrementTallyVote(poll, pick, { onVotes: setVotes })) refresh(); }
    catch (e) { setVotes(null); showToast({ tone: "failed", message: "Couldn't take one off.", detail: e?.message || "Nothing was changed." }); }
    finally { setBusy(false); }
  };

  const foot = pollFoot(shownPoll, { voters, frontIds, chosen: !!(chosen && chosen.length), byId, terms, formatAlter });
  const pickedLabel = optionLabel(options[pick]) || `Option ${pick + 1}`;

  return (
    <section className="hpo-card" data-highlight-id={poll.id} data-closed={closed || undefined} aria-label={poll.question}>
      <div className="hpo-ttl">
        <span>{closed ? "Closed" : "Open"}</span>
        <span className="hpo-ttl-note">{pollMeta(poll, { dateWords, agoWords })}</span>
      </div>
      <div className="hpo-body">
        <h2 className="hpo-q">{poll.question}</h2>
        <ul className="hpo-opts" aria-label={`Options for ${poll.question}`}>
          {options.map((o, idx) => {
            const label = optionLabel(o) || `Option ${idx + 1}`;
            const mine = tally ? idx === pick && !closed : votedBy(shownPoll, idx, voters);
            const { shown, more } = voterMarks(shownPoll, idx);
            return (
              <li key={idx} className="hpo-opt">
                <div className="hpo-opt-row">
                  <Button rank={mine ? "primary" : "secondary"} className="hpo-tick" aria-pressed={mine}
                    aria-label={tally ? `Count ${label}` : mine ? `Take back the vote for ${label}` : `Vote ${label}`}
                    disabledReason={closed ? "This poll is closed" : undefined} onClick={() => vote(idx)}>{mine ? "x" : ""}</Button>
                  <span className="hpo-label" onClick={() => vote(idx)}>{label}</span>
                  {tally ? null : (
                    <span className="hpo-who" aria-label={`${optionVoters(shownPoll, idx).length} votes`}>
                      {shown.map((id, i) => {
                        const a = id ? byId[id] : null;
                        return <span key={`${id}-${i}`} className="hpo-sq" title={a ? formatAlter(a) : `The ${terms.system}`}
                          style={{ background: a?.color || "var(--house-muted)" }} />;
                      })}
                      {more ? <span className="hpo-more">{`+${more}`}</span> : null}
                    </span>
                  )}
                  <span className="hpo-num">{counts[idx] || 0}</span>
                </div>
                <span className="hpo-bar" aria-hidden="true"><span style={{ width: `${barPct(counts[idx] || 0, total)}%` }} /></span>
              </li>
            );
          })}
        </ul>
        {tally && !closed && options.length ? (
          <div className="hpo-tally" role="group" aria-label={`Anonymous tally count for ${pickedLabel}`}>
            <span className="hpo-tally-what">
              <span>Anonymous tally count</span>
              <span className="hpo-tally-opt">{pickedLabel}</span>
            </span>
            <Button rank="secondary" className="hpo-step" aria-label={`Take one off ${pickedLabel}`}
              disabledReason={(counts[pick] || 0) === 0 ? "Nothing to take off" : undefined} onClick={takeMark}>-</Button>
            <span className="hpo-tally-n">{counts[pick] || 0}</span>
            <Button rank="secondary" className="hpo-step" aria-label={`Add one to ${pickedLabel}`} onClick={addMark}>+</Button>
          </div>
        ) : null}
        <div className="hpo-foot">
          <span className="hpo-foot-words">{closed ? <><Lock size={12} aria-hidden="true" /> {foot}</> : foot}</span>
          <Button rank="quiet" className="hpo-edit" aria-label={`Edit ${poll.question}`} onClick={onEdit}>edit ...</Button>
        </div>
      </div>
    </section>
  );
}

// ── The poll's sheet: a new poll, or one poll's voters, words and settings ──
function PollSheet({ open, poll, alters, byId, frontIds, chosen, onChoose, onClose, refresh, terms, formatAlter }) {
  const isNew = !poll;
  const start = useMemo(() => editableOptions(poll), [poll?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- seeded once per poll
  const [question, setQuestion] = useState(poll?.question || "");
  const [options, setOptions] = useState(isNew ? ["", ""] : start.options);
  const [origin, setOrigin] = useState(isNew ? [null, null] : start.origin);
  const [tally, setTally] = useState(isNew ? defaultTallyMode() : !!poll?.tally_mode);
  const [maker, setMaker] = useState(null);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [dropped, setDropped] = useState(0); // votes on options removed since the sheet opened
  const [deleting, setDeleting] = useState(false);
  const voters = votersOf(chosen, frontIds);

  const form = { question, options, origin };
  const problem = formProblem(form);
  const live = alters.filter((a) => !a.is_archived);

  const setOption = (i, v) => setOptions((o) => o.map((x, k) => (k === i ? v : x)));
  const addOption = () => { setOptions((o) => [...o, ""]); setOrigin((o) => [...o, null]); };
  const dropNow = (i) => { setOptions((o) => o.filter((_, k) => k !== i)); setOrigin((o) => o.filter((_, k) => k !== i)); };
  const askDrop = (i) => {
    const from = origin[i];
    if (!isNew && from != null) setDropped((n) => n + optionVoters(poll, from).length);
    dropNow(i);
  };

  const save = async () => {
    if (problem) return;
    const f = formToSave(form);
    setSaving(true);
    try {
      if (isNew) await createPoll({ question: f.question, options: f.options, tallyMode: tally, createdByAlterId: tally ? null : maker });
      else await editPoll(poll, { question: f.question, options: f.options, optionOrigin: f.optionOrigin, tallyMode: tally });
      rememberTallyMode(tally);
      refresh();
      showToast({ message: isNew ? "Poll made." : "Poll saved." });
      onClose();
    } catch (e) {
      showToast({ tone: "failed", message: isNew ? "Couldn't make the poll." : "Couldn't save the poll.", detail: e?.message || "Nothing was changed." });
    } finally { setSaving(false); }
  };

  const pin = async (on) => {
    try { await setPollPinned(poll, on); refresh(); showToast({ message: on ? "Pinned to the board." : "Unpinned from the board." }); }
    catch (e) { showToast({ tone: "failed", message: "Couldn't change the pin.", detail: e?.message || "Nothing was changed." }); }
  };
  const close = async () => {
    try { await closePoll(poll.id); refresh(); showToast({ message: "Poll closed. It stays here for reference." }); onClose(); }
    catch (e) { showToast({ tone: "failed", message: "Couldn't close the poll.", detail: e?.message || "Nothing was changed." }); }
  };
  const remove = async () => {
    setDeleting(false);
    const ok = await trashWithUndo({ thing: poll.question || "The poll", run: () => trashPoll(poll), refresh });
    if (ok) onClose();
  };

  const sysVote = voters.includes("");
  const people = voters.filter(Boolean);
  const maker_ = poll?.created_by_alter_id ? byId[poll.created_by_alter_id] : null;

  return (
    <>
      <Sheet open={open} onClose={onClose} title={isNew ? "New poll" : "Poll"} size="half" holdsTyping
        tools={isNew ? null : (
          <Menu label={`More for ${poll.question}`} items={[
            { id: "pin", label: poll.pinned_to_dashboard ? "Unpin from the board" : "Pin to the board", icon: poll.pinned_to_dashboard ? PinOff : Pin, onSelect: () => pin(!poll.pinned_to_dashboard) },
            { id: "del", label: "Delete poll", icon: Trash2, danger: true, onSelect: () => setDeleting(true) },
          ]} />
        )}
        footer={<Button rank="primary" busy={saving} busyLabel="Saving…" disabledReason={problem || undefined} onClick={save}>{isNew ? "Make poll" : "Save"}</Button>}>
        <div className="hpo-sheet">
          {!isNew && !poll.is_closed && !poll.tally_mode ? (
            <section className="hpo-sec" aria-label="Voting as">
              <p className="hpo-sec-t house-label">Voting as</p>
              <div className="hpo-voters">
                {people.length ? people.map((id) => byId[id] ? (
                  <span key={id} className="hpo-voter"><span className="hpo-sq" style={{ background: byId[id].color || "var(--house-muted)" }} />{formatAlter(byId[id])}</span>
                ) : null) : null}
                {sysVote ? <span className="hpo-voter"><span className="hpo-sq" style={{ background: "var(--house-muted)" }} />{`The ${terms.system}`}</span> : null}
              </div>
              <div className="hpo-row">
                <Button rank="secondary" icon={Users} onClick={() => setPicking(true)}>{`Choose ${terms.alters}`}</Button>
                {chosen && chosen.length ? <Button rank="quiet" onClick={() => onChoose(null)}>{`Back to who is in ${terms.front}`}</Button> : null}
              </div>
              <Checkbox label={`Also ${an(terms.system)}-wide vote`} checked={sysVote}
                onChange={(on) => onChoose(on ? [...new Set([...people, ""])] : (people.length ? people : null))} />
              <p className="hpo-hint">One tap on an option then votes once for each of them. Tap again to take it back.</p>
            </section>
          ) : null}

          <section className="hpo-sec" aria-label="The poll">
            <TextField label="Question" value={question} onChange={setQuestion} maxLength={300} placeholder="What should we decide?" />
            <p className="hpo-sec-t house-label">Options</p>
            {options.map((o, i) => (
              <div key={i} className="hpo-optedit">
                <TextField label={`Option ${i + 1}`} value={o} onChange={(v) => setOption(i, v)} maxLength={200} />
                {options.length > 2 ? <IconButton icon={X} label={`Remove option ${i + 1}`} onClick={() => askDrop(i)} /> : null}
              </div>
            ))}
            {dropped ? <p className="hpo-warn">{`The options you removed had ${dropped} ${dropped === 1 ? "vote" : "votes"}. They go when you save; close without saving to keep them.`}</p> : null}
            {options.length < MAX_OPTIONS ? <Button rank="secondary" icon={Plus} onClick={addOption}>Add option</Button> : <p className="hpo-hint">{`A poll can have up to ${MAX_OPTIONS} options.`}</p>}
            <Switch label="Anonymous tally count" checked={tally} onChange={setTally}
              description={tally ? "Each + adds one to an option's count, and − takes one off. No one's name is kept." : `Each ${terms.alter} votes once, and tapping again takes it back.`} />
            {isNew && !tally ? (
              <AlterPicker label="Made by (optional)" value={maker} onChange={setMaker} alters={live} showNone noneLabel={`The ${terms.system}`} placeholder={`The ${terms.system}`} />
            ) : null}
          </section>

          {!isNew ? (
            <section className="hpo-sec" aria-label="Settings">
              <Switch label="Pinned to the board" checked={!!poll.pinned_to_dashboard} onChange={pin} />
              {poll.is_closed ? <p className="hpo-hint">This poll is closed. It stays here for reference.</p> : (
                <Button rank="secondary" icon={Lock}
                  disabledReason={canClose(poll, voters) ? undefined : `Only ${maker_ ? formatAlter(maker_) : "its maker"}, who made it, can close it`}
                  onClick={close}>Close poll</Button>
              )}
              <p className="hpo-hint">{`Made by ${maker_ ? formatAlter(maker_) : `the ${terms.system}`}${poll.created_date ? `, ${agoWords(poll.created_date)}` : ""}${poll.bulletin_id ? ", from the board" : ""}.`}</p>
            </section>
          ) : null}
        </div>
      </Sheet>
      {picking ? (
        <SetFrontModal open onClose={() => setPicking(false)} selectionMode preselectedIds={people.length ? people : frontIds}
          selectionTitle="Who is voting?" selectionHint="Tap to add or remove." confirmLabel="Done"
          onConfirm={(ids) => { onChoose(ids.length ? (sysVote ? [...ids, ""] : ids) : (sysVote ? [""] : null)); setPicking(false); }} />
      ) : null}
      <ConfirmSheet open={deleting} thing={poll?.question ? `"${poll.question}"` : "this poll"} onCancel={() => setDeleting(false)} onConfirm={remove}
        detail={poll?.bulletin_id ? "It goes to the trash, and its post on the board stops showing it." : "It goes to the trash."} />
    </>
  );
}
