// Help me unblend (board 38-UnblendPhone; plan step 3.1). House mode only,
// on /unblend. The same question engine as the old page
// (src/lib/useUnblendSession.js): the same questions, ranking and skips.
//
//   Likely in front   bars from the ranking, the top four (all on request),
//                     and one big button that puts the top one in front
//                     through setFront.js (adds; nobody already there is
//                     taken out)
//   Question N        the question; a colour question is the swatches plus
//                     the app's colour picker (never the browser's: board
//                     38's note); Skip · Different question · Restart
//   Build up data…    Get to know me and Manage questions
//
// Answers are never stored. The only write besides front is deleting one of
// the person's own questions (to the trash, with Undo).

import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { localEntities } from "@/api/base44Client";
import { deleteWithUndo } from "@/lib/undoDelete";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { changeFront } from "@/lib/setFront";
import { normalizeHexInput } from "@/lib/colorUtils";
import { useUnblendSession, likelyShares, FALLBACK_SWATCHES } from "@/lib/useUnblendSession";
import { Button } from "@/house/kit/Button";
import { Panel } from "@/house/kit/Panel";
import { ColourField, Swatches } from "@/house/kit/Pickers";
import { AlterAvatar } from "@/house/kit/Content";
import { EmptyBlock } from "@/house/kit/States";
import { frontButtonWords } from "@/house/support/supportModel";

export default function HouseUnblend({ size = "full" }) {
  const navigate = useNavigate();
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const u = useUnblendSession();
  const [showAll, setShowAll] = useState(false);
  const [setting, setSetting] = useState(false);
  const shares = useMemo(() => likelyShares(u.ranked), [u.ranked]);
  const shown = showAll ? u.ranked : u.ranked.slice(0, 4);
  const top = u.ranked[0]?.alter || null;
  const words = top ? frontButtonWords({
    name: formatAlter(top), fronting: u.activeFronterIds.has(top.id), anyoneFronting: u.activeFronterIds.size > 0, terms,
  }) : null;
  const swatches = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const a of u.activeAlters) {
      const c = normalizeHexInput(a.color || "");
      if (c && !seen.has(c.toLowerCase())) { seen.add(c.toLowerCase()); out.push(c); }
      if (out.length >= 8) break;
    }
    for (const c of FALLBACK_SWATCHES) {
      if (out.length >= 8) break;
      if (!seen.has(c)) { seen.add(c); out.push(c); }
    }
    return out;
  }, [u.activeAlters]);
  const draft = normalizeHexInput(u.colorDraft);
  const q = u.currentQuestion;
  const asking = q && !u.isExhausted && !u.hasNoQuestions;

  const putInFront = async () => {
    if (!top || setting) return;
    setSetting(true);
    try {
      // The one front write path; everyone already in front stays.
      await changeFront((cur) => (cur.some((x) => x.alterId === top.id) ? cur : [...cur, { alterId: top.id }]),
        { queryClient: u.queryClient, terms, alters: u.activeAlters });
      toast.success(`${formatAlter(top)} is ${terms.fronting}`);
    } catch (e) {
      toast.error(e?.message || "Couldn't change that. Nothing was changed.");
    } finally { setSetting(false); }
  };

  // A question goes to the trash, so it goes at once with Undo (no confirm).
  const deleteQuestion = async () => {
    const id = q?.userId;
    if (!id) return;
    await deleteWithUndo({
      label: "Question deleted",
      run: () => localEntities.UnblendQuestion.delete(id),
      refresh: () => u.queryClient.invalidateQueries({ queryKey: ["unblendQuestions"] }),
    });
    u.setQuestionIdx((i) => i + 1);
  };

  const likely = (
    <Panel title="Likely in front" className="hs-panel hs-likely"
      tools={<span>{u.answeredIds.size ? `after ${u.answeredIds.size} answer${u.answeredIds.size === 1 ? "" : "s"}` : "from the time of day"}</span>}>
      {u.activeAlters.length === 0 ? (
        <EmptyBlock compact title={`No ${terms.alters} yet`} body={`Add some ${terms.alters} and this can help work out who's here.`}
          action={<Button rank="secondary" onClick={() => navigate("/Home")}>{`Open ${terms.alters}`}</Button>} />
      ) : (
        <>
          <ul className="hs-list hs-bars" data-tour="unblend-likely">
            {shown.map(({ alter }) => {
              const p = shares.get(alter.id) || 0;
              const fronting = u.activeFronterIds.has(alter.id);
              return (
                <li key={alter.id}>
                  <Button rank="quiet" className="hs-bar-row" onClick={() => navigate(`/alter/${alter.id}`)}
                    aria-label={`${formatAlter(alter)}, ${p}%${fronting ? `, ${terms.fronting}` : ""}`}>
                    <AlterAvatar alter={alter} size="sm" />
                    <span className="hs-bar-name">{formatAlter(alter)}</span>
                    <span className="hs-bar" aria-hidden="true"><span style={{ width: `${p}%`, background: alter.color || "var(--house-accent)" }} /></span>
                    <span className="hs-bar-pc">{fronting ? terms.front : `${p}%`}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
          {u.ranked.length > 4 ? (
            <Button rank="quiet" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show the top four" : `Show all ${u.ranked.length} ${terms.alters}`}</Button>
          ) : null}
          {words ? (
            <Button rank="primary" block className="hs-big" busy={setting} busyLabel="Saving…" onClick={putInFront}
              disabledReason={words.done ? `${formatAlter(top)} is already in ${terms.front}` : undefined}>
              {words.label}
            </Button>
          ) : null}
        </>
      )}
    </Panel>
  );

  const question = asking ? (
    <Panel title={`Question ${u.answeredIds.size + 1}`} className="hs-panel hs-question"
      tools={<span>{u.idkCount > 0 ? `${u.idkCount} skipped` : "skipping is fine"}</span>}>
      <div className="hs-q" data-tour="unblend-question">
        <p className="hs-prompt house-label">{q.prompt}</p>
        {q.kind === "color" ? (
          <>
            <Swatches label="Colours to choose from" colours={swatches} value={draft} onChange={u.setColorDraft} />
            <ColourField label="Or any colour" value={draft || ""} onChange={(hex) => u.setColorDraft(hex)} />
            <Button rank="secondary" block disabledReason={draft ? undefined : "Pick a colour first"} onClick={() => u.handleColorPick(draft)}>
              Use this colour
            </Button>
            <p className="hs-hint">{`The list moves toward ${terms.alters} with similar colours.`}</p>
          </>
        ) : null}
        {q.kind === "choice" ? (
          <div className="hs-opts">
            {q.options.map((opt) => <Button key={opt.id} rank="secondary" onClick={() => u.handleChoicePick(opt)}>{opt.label}</Button>)}
          </div>
        ) : null}
        {q.userId ? <Button rank="quiet" onClick={deleteQuestion}>Delete this question</Button> : null}
      </div>
      <div className="hs-qfoot">
        <Button rank="secondary" onClick={u.handleIdk}>Skip</Button>
        <Button rank="secondary" onClick={u.handleShuffle}>Different question</Button>
        <Button rank="secondary" onClick={u.handleRestart}>Restart</Button>
      </div>
    </Panel>
  ) : (u.hasNoQuestions || u.isExhausted) ? (
    <Panel title={u.hasNoQuestions ? "Nothing to ask yet" : "That's every question"} className="hs-panel hs-question">
      <p>{u.hasNoQuestions ? `Not enough ${terms.alter} data to ask anything useful yet.` : "You've answered every question there is right now."}</p>
      <p className="hs-mut">{`This only asks questions that narrow the list. Fill in ${terms.alter} colours, pronouns, roles or ages, or use Get to know me while you're grounded.`}</p>
      <div className="hs-row">
        <Button rank="primary" onClick={() => navigate("/get-to-know-me")}>Get to know me</Button>
        <Button rank="secondary" onClick={() => navigate("/Home")}>{`Open ${terms.alters}`}</Button>
        {u.isExhausted ? <Button rank="secondary" onClick={u.handleRestart}>Start over</Button> : null}
      </div>
    </Panel>
  ) : null;

  return (
    <div className="hs-room" data-room="unblend" data-size={size} data-tour="unblend-page">
      {u.groundingNudgeShown ? (
        <Panel title="Want to take a grounding break?" className="hs-panel hs-nudge">
          <p className="hs-mut">When it's hard to tell who's here, sometimes the answer is "we need a moment first". A short breathing or grounding exercise can help things settle.</p>
          <div className="hs-row">
            <Button rank="primary" onClick={() => navigate("/grounding")}>Open grounding</Button>
            <Button rank="secondary" onClick={() => u.setGroundingNudgeShown(false)}>Not right now</Button>
          </div>
        </Panel>
      ) : null}
      <div className="hs-grid hs-grid--unblend">
        {likely}
        {question}
      </div>
      <div className="hs-foot">
        <span className="hs-hint">Build up data by answering when grounded.</span>
        <Button rank="secondary" onClick={() => navigate("/get-to-know-me")}>Get to know me</Button>
        <Button rank="secondary" onClick={() => navigate("/unblend/questions")} data-tour="unblend-manage-btn">Manage questions</Button>
      </div>
    </div>
  );
}
