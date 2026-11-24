// Routines in the pixel look — the "Phone: Routines" board. Frequency tabs,
// the level panel, today's list with square ticks and points, then Period
// review / Edit routines. Only rendered in the pixel look (DailyTasks.jsx):
// every tick goes through the page's own handlers (toggleDailyProgressTasks
// via toggleManual / toggleHistoryTask), every editor is the page's own.

import React from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import TaskTemplateManager from "@/components/tasks/TaskTemplateManager";
import PeriodReview from "@/components/tasks/PeriodReview";
import { TaskCounter, TaskStepList, useTaskTicks } from "@/components/tasks/TaskCountControls";
import { openDailyTask, isDailyTaskOpenable, taskActivityConfig } from "@/lib/dailyTaskActivity";
import { taskCountConfig, taskCountState, countLabel } from "@/lib/taskCounts";
import { AUTO_TRIGGER_LABELS, resolveAutoTriggers, applyTerms, getLevelFromTotalXP, FREQUENCY_LABELS } from "@/lib/dailyTaskSystem";
import { taskNote } from "@/lib/taskCreate";
import { useTerms } from "@/lib/useTerms";
import "@/styles/pixel/tasks.css";

const FREQUENCIES = ["daily", "weekly", "monthly", "yearly"];

function howLine(task, terms) {
  const note = taskNote(task);
  if (note) return note;
  if (task.mode === "AUTO") {
    const { ids } = resolveAutoTriggers(task);
    const label = ids.length ? applyTerms(AUTO_TRIGGER_LABELS[ids[0]] || ids[0], terms) : "";
    return label ? `auto: ${label.charAt(0).toLowerCase()}${label.slice(1)}${ids.length > 1 ? ` (+${ids.length - 1})` : ""}` : "ticks itself";
  }
  if (taskActivityConfig(task)) return "tap: starts its activity";
  if (task.nav_path) return "tap: opens its page";
  return "tap when done";
}

function RoutineRow({ task, done, onToggle, showPoints, ticks }) {
  const navigate = useNavigate();
  const terms = useTerms();
  const mode = taskCountConfig(task).mode;
  const openable = isDailyTaskOpenable(task);
  const manualOnce = task.mode === "MANUAL" && mode === "once";
  const counted = mode === "target" || mode === "tally";
  const onRow = () => {
    if (openable) openDailyTask(task, navigate);
    else if (manualOnce) onToggle(task.id);
  };
  return (
    <div className={`pr-row${done ? " done" : ""}${openable || manualOnce ? " tap" : ""}`} onClick={onRow}>
      {manualOnce ? (
        <button type="button" role="checkbox" aria-checked={done} className={`pt-tick${done ? " y" : ""}`}
          aria-label={done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
          onClick={(e) => { e.stopPropagation(); onToggle(task.id); }}>{done ? "x" : ""}</button>
      ) : (
        <span className={`pt-tick${done ? " y" : ""}`} aria-label={done ? "Done" : "Not done yet"} role="img">{done ? "x" : ""}</span>
      )}
      <span className="pr-txt">
        <span className="pr-title">{task.title}</span>
        <span className="pr-how">{howLine(task, terms)}</span>
        {mode === "steps" && <span onClick={(e) => e.stopPropagation()}><TaskStepList task={task} ticks={ticks} /></span>}
      </span>
      {counted && <span onClick={(e) => e.stopPropagation()}><TaskCounter task={task} ticks={ticks} /></span>}
      {mode === "steps" && (
        <span className="pr-pts">{done ? <Check className="w-3.5 h-3.5" /> : countLabel(taskCountState(task, ticks))}</span>
      )}
      {showPoints && !counted && mode !== "steps" && <span className="pr-pts">+{task.points || 0}</span>}
    </div>
  );
}

export default function RoutinesPixel({
  activeFreq, onFreq, freqCounts, currentPeriodKey,
  activeTasks, isDone, hideCompleted, toggleHideCompleted, toggleManual,
  totalXP, periodEarnedXP, periodPossibleXP, periodLabel, goalXP, showPoints, shownUp,
  askAboutPoints, choosePoints,
  showReview, setShowReview, showManager, setShowManager,
  templates, allProgress, toggleHistoryTask,
}) {
  const terms = useTerms();
  const ticks = useTaskTicks();
  const { level, xpIntoLevel, xpForNextLevel } = getLevelFromTotalXP(totalXP);
  const pct = Math.min(100, Math.round((xpIntoLevel / Math.max(1, xpForNextLevel)) * 100));
  const completedCount = activeTasks.filter(isDone).length;
  const visible = hideCompleted ? activeTasks.filter((t) => !isDone(t)) : activeTasks;
  const now = new Date();
  const periodTitle = {
    daily: `Today, ${now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`,
    weekly: `This week, ${currentPeriodKey}`,
    monthly: `This month, ${now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`,
    yearly: `This year, ${now.getFullYear()}`,
  }[activeFreq];

  return (
    <div className="pr-page" data-tour="tasks-daily">
      <h1 className="sr-only">Routines</h1>
      <div className="pr-tabs" role="tablist" aria-label="How often" data-tour="tasks-freq-tabs">
        {FREQUENCIES.map((f) => (
          <button key={f} type="button" role="tab" aria-selected={activeFreq === f}
            className={`pr-tab${activeFreq === f ? " sel" : ""}`}
            onClick={() => { onFreq(f); setShowReview(false); }}>
            {FREQUENCY_LABELS[f] || f}
            {freqCounts[f] > 0 && <span className="pr-tabn">{freqCounts[f]}</span>}
          </button>
        ))}
      </div>

      <div data-tour="tasks-level-bar">
        {showPoints ? (
          <section className="pr-panel">
            <div className="pr-ttl"><span>Level {level}</span><span className="pr-mut">{xpIntoLevel} / {xpForNextLevel} points</span></div>
            <div className="pr-body">
              <div className="pr-meter"><span style={{ width: `${pct}%` }} /></div>
              <p className="pr-cap">
                {periodEarnedXP}/{periodPossibleXP} points {periodLabel} · {totalXP} in all.
                {shownUp ? ` ${shownUp}.` : ""}
                {goalXP > 0 ? ` Includes ${goalXP} from goals.` : ""}
                {" "}Points and levels can be turned off under Edit routines.
              </p>
            </div>
          </section>
        ) : (shownUp || askAboutPoints) ? (
          <section className="pr-panel">
            <div className="pr-ttl"><span>{askAboutPoints ? "Points and levels" : "This month"}</span></div>
            <div className="pr-body">
              {shownUp && <p className="pr-cap">{shownUp}</p>}
              {askAboutPoints && (
                <>
                  <p className="pr-cap">Would points and levels help you, or get in the way? Some people like earning points for routines. Others find them pressure. You can change this any time under Edit routines.</p>
                  <div className="pr-btns">
                    <button type="button" className="pr-btn on" onClick={() => choosePoints(true)}>Use points and levels</button>
                    <button type="button" className="pr-btn" onClick={() => choosePoints(false)}>No thanks</button>
                  </div>
                </>
              )}
            </div>
          </section>
        ) : null}
      </div>

      {showManager ? (
        <section className="pr-panel">
          <div className="pr-ttl"><span>Edit routines</span><button type="button" className="pa-ttl-act" onClick={() => setShowManager(false)}>Close</button></div>
          <div className="pr-body pr-manager">
            <TaskTemplateManager templates={templates} onClose={() => setShowManager(false)} showPoints={showPoints} onPointsChange={choosePoints} />
          </div>
        </section>
      ) : showReview ? (
        <section className="pr-panel">
          <div className="pr-ttl"><span>Period review</span><button type="button" className="pa-ttl-act" onClick={() => setShowReview(false)}>Close</button></div>
          <div className="pr-body">
            <PeriodReview frequency={activeFreq} templates={templates} allProgress={allProgress} onToggleTask={toggleHistoryTask} showPoints={showPoints} />
          </div>
        </section>
      ) : (
        <section className="pr-panel pr-list">
          <div className="pr-ttl"><span>{periodTitle}</span>{activeTasks.length > 0 && <span className="pr-mut">{completedCount} of {activeTasks.length}</span>}</div>
          {activeTasks.length === 0 ? (
            <p className="pr-empty">No {(FREQUENCY_LABELS[activeFreq] || activeFreq).toLowerCase()} routines yet. Open Edit routines to add some.</p>
          ) : visible.length === 0 ? (
            <p className="pr-empty">All done for {periodLabel}.</p>
          ) : visible.map((task) => (
            <RoutineRow key={task.id}
              task={{ ...task, title: applyTerms(task.title, terms), description: applyTerms(task.description, terms) }}
              done={isDone(task)} onToggle={toggleManual} showPoints={showPoints} ticks={ticks} />
          ))}
          {activeTasks.length > 0 && completedCount > 0 && (
            <button type="button" className="pr-more" aria-pressed={hideCompleted} onClick={toggleHideCompleted}>
              {hideCompleted ? `Show ${completedCount} completed` : "Hide completed"}
            </button>
          )}
        </section>
      )}

      <div className="pr-btns pr-foot">
        <button type="button" className={`pr-btn big${showReview ? " on" : ""}`} aria-pressed={showReview}
          onClick={() => { setShowManager(false); setShowReview((v) => !v); }}>Period review</button>
        <button type="button" data-tour="tasks-edit-btn" className={`pr-btn big${showManager ? " on" : ""}`} aria-pressed={showManager}
          onClick={() => { setShowReview(false); setShowManager((v) => !v); }}>Edit routines</button>
      </div>
    </div>
  );
}
