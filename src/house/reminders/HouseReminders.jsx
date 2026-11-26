// The house's Reminders room: board 23-RemindersPhone (Inbox · Manage, Due
// now over Your reminders, the reminder editor as board 24 on its own
// address) and, on a computer or tablet, the same panels laid out with the
// desktop frame's conventions (boards 01 and 06): a toolbar panel
// (Reminders · the list filter · New reminder), the checked floor with Due
// now, Your reminders and the Reminder panel side by side, and the status
// line under it all. House mode only: the frames draw it on /reminders
// (houseRemindersRoom); the old page is gated off (HouseRoomGate) and stays
// exactly as it was with the new house off.
//
// Writes, all through the paths the old page uses:
//   - answering a fired reminder: useReminderActions → reminderInstanceActions
//     (Done, Snooze, Dismiss, Unsnooze, and the check-in / front sheets);
//   - the notification link ?act=&action=: applyReminderDeepLink, then the
//     action runs once, as the old inbox does;
//   - a reminder: saveReminder / setReminderActive / deleteReminder
//     (src/lib/reminderEntry.js), the delete inside trashWithUndo so it goes
//     to the trash with Undo;
//   - the first reminders: RemindersOnboarding (the old suggestions panel).
// The schedulers (native, server, in-app) follow the ["reminders"] query, so
// they reschedule from either house exactly the same.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus, Settings as SettingsIcon, Inbox, ListChecks } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { Button } from "@/house/kit/Button";
import { Panel, PageTabs } from "@/house/kit/Panel";
import { Segmented } from "@/house/kit/Choices";
import { AlterPicker } from "@/house/kit/Pickers";
import Menu from "@/house/kit/Menu";
import { EmptyBlock, LoadingBlock } from "@/house/kit/States";
import { showToast, trashWithUndo } from "@/house/kit/Toast";
import { useRoomTools } from "@/house/frame/roomTools";
import NotificationStatusCard from "@/components/shared/NotificationStatusCard";
import RemindersOnboarding from "@/components/reminders/RemindersOnboarding";
import { useReminderActions } from "@/components/reminders/useReminderActions";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { formatTime, clockPattern } from "@/lib/timeFormat";
import { format } from "date-fns";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { setReminderActive, deleteReminder } from "@/lib/reminderEntry";
import { applyReminderDeepLink } from "@/lib/reminderInstanceActions";
import {
  inboxBuckets, effectiveActionsFor, reminderWhenWords, reminderDeepLink, hhmmWords,
  DEFAULT_SNOOZE_OPTIONS, formatSnoozeLabel,
} from "@/lib/reminderForm";
import {
  editorOf, editorHref, filterReminders, filterOptions, scopedAlterIds, quietWords, whoWords, reminderOn,
  statusWords, dueWhenWords, HANDLED_WORDS,
} from "@/house/reminders/remindersModel";
import ReminderEditor from "@/house/reminders/ReminderEditor";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/reminders/reminders.css";

const clockOf = (d) => formatTime(d, { hour: "numeric", minute: "2-digit" });
const clockHhmm = (t) => hhmmWords(t, clockOf);
const dateWords = (iso) => format(new Date(iso), clockPattern("EEE d MMM, h:mm a"));

export default function HouseReminders({ size = "full", tokens }) {
  const phone = size === "phone";
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const [tab, setTab] = useState("inbox");
  const [filter, setFilter] = useState("all");
  const [showHandled, setShowHandled] = useState(false);
  const acts = useReminderActions({ notify: (kind, words) => showToast({ message: words }) });

  const { data: reminders = [], isLoading } = useQuery({ queryKey: ["reminders", "all"], queryFn: () => base44.entities.Reminder.list() });
  const { data: instances = [] } = useQuery({
    queryKey: ["reminderInstances", "inbox"],
    queryFn: () => base44.entities.ReminderInstance.list("-scheduled_for", 200),
    refetchInterval: 60000,
  });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const quiet = pickPrimarySystemSettings(settingsList)?.quiet_hours;

  const alterMap = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);
  const reminderMap = useMemo(() => Object.fromEntries(reminders.map((r) => [r.id, r])), [reminders]);
  const { due, handled } = useMemo(() => inboxBuckets(instances), [instances]);
  const dueShown = due.filter((i) => reminderMap[i.reminder_id]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["reminders"] });
    queryClient.invalidateQueries({ queryKey: ["reminderInstances"] });
  }, [queryClient]);

  // ── The notification link: answer the instance, then run its action once ──
  const [autoTrigger, setAutoTrigger] = useState(null);
  const consumed = useRef(null);
  useEffect(() => {
    const link = reminderDeepLink(location.search);
    if (!link) return;
    applyReminderDeepLink(link).then(() => queryClient.invalidateQueries({ queryKey: ["reminderInstances"] }));
    navigate("/reminders", { replace: true });
    setTab("inbox");
    if (link.actionType !== "dismiss") setAutoTrigger({ instanceId: link.instanceId, actionType: link.actionType });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival
  useEffect(() => {
    if (!autoTrigger || !instances.length || consumed.current === autoTrigger.instanceId) return;
    const inst = instances.find((i) => i.id === autoTrigger.instanceId);
    if (!inst) return;
    consumed.current = autoTrigger.instanceId;
    acts.run(inst, { action_type: autoTrigger.actionType });
  }, [autoTrigger, instances]); // eslint-disable-line react-hooks/exhaustive-deps -- acts is new each render

  // ── The editor's address ──
  const ed = editorOf(location.search);
  const editing = ed?.mode === "edit" ? reminderMap[ed.id] || null : null;
  const editorOpen = ed?.mode === "new" || !!editing;
  const pushed = useRef(false);
  const openEditor = useCallback((r) => {
    const already = !!editorOf(window.location.search);
    navigate(editorHref(r), { replace: already });
    if (!already) pushed.current = true;
  }, [navigate]);
  const closeEditor = useCallback(() => {
    if (pushed.current && (window.history.state?.idx ?? 0) > 0) { pushed.current = false; navigate(-1); }
    else navigate("/reminders", { replace: true });
  }, [navigate]);
  // A reminder that's gone (deleted on another device) closes its editor.
  useEffect(() => {
    if (ed?.mode === "edit" && !isLoading && !reminderMap[ed.id]) navigate("/reminders", { replace: true });
  }, [ed?.mode, ed?.id, isLoading, reminderMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (r) => {
    const next = !r.is_active;
    try {
      await setReminderActive(r.id, next);
      invalidate();
      showToast({ message: next ? `${r.title} is on.` : `${r.title} is paused.` });
    } catch (e) {
      showToast({ tone: "failed", message: `Couldn't change ${r.title}.`, detail: e?.message || "Nothing was changed." });
    }
  };
  const remove = async (r) => {
    const ok = await trashWithUndo({ thing: r.title || "The reminder", run: () => deleteReminder(r.id), refresh: invalidate });
    if (ok && editing?.id === r.id) closeEditor();
  };

  // ── The phone's header: + and ⋯ ──
  const tools = useMemo(() => (phone ? {
    info: editorOpen ? null : { label: "+", ariaLabel: "New reminder", tour: "reminders-new", onSelect: () => openEditor(null) },
    items: [
      { id: "new", label: "New reminder", icon: Plus, onSelect: () => openEditor(null) },
      ...(editorOpen ? [] : [
        { id: "inbox", label: "Inbox", icon: Inbox, onSelect: () => setTab("inbox") },
        { id: "manage", label: "Manage", icon: ListChecks, onSelect: () => setTab("manage") },
      ]),
      { id: "settings", label: "Quiet hours and snooze settings", icon: SettingsIcon, onSelect: () => navigate("/settings#reminders") },
    ],
  } : null), [phone, editorOpen, openEditor, navigate]);
  useRoomTools(tools);

  const scopedAlters = scopedAlterIds(reminders).map((id) => alterMap[id]).filter(Boolean);
  const shown = filterReminders(reminders, filter);
  const onCount = reminders.filter((r) => reminderOn(r, alterMap[r.alter_id])).length;
  const quietText = quietWords(quiet, clockHhmm);
  const nothingYet = !isLoading && reminders.length === 0;

  // ── Panels ──
  const duePanel = (
    <Panel className="hrm-pn" title="Due now" tools={<span className="hrm-note">{dueShown.length}</span>}>
      <div data-tour="reminders-inbox">
        {dueShown.length === 0 ? (
          <p className="hrm-empty">Nothing due right now. When a reminder fires, it waits here until you answer it. Snoozed ones wait here too.</p>
        ) : dueShown.map((i) => (
          <DueRow key={i.id} instance={i} reminder={reminderMap[i.reminder_id]} alter={alterMap[reminderMap[i.reminder_id]?.alter_id]}
            acts={acts} terms={terms} formatAlter={formatAlter} />
        ))}
        {handled.length > 0 ? (
          <>
            <Button rank="quiet" className="hrm-fold" icon={showHandled ? ChevronDown : ChevronRight} aria-expanded={showHandled}
              onClick={() => setShowHandled((o) => !o)}>{`Recently handled (${handled.length})`}</Button>
            {showHandled ? handled.map((i) => (
              <DueRow key={i.id} instance={i} reminder={reminderMap[i.reminder_id]} alter={alterMap[reminderMap[i.reminder_id]?.alter_id]}
                acts={acts} terms={terms} formatAlter={formatAlter} readOnly />
            )) : null}
          </>
        ) : null}
      </div>
    </Panel>
  );

  const filterRow = (
    <span className="hrm-filter" data-tour="reminders-filter">
      <Segmented label="Show" value={filter === "all" || filter === "system" || filter === "per_alter" ? filter : null}
        onChange={setFilter} options={filterOptions(terms)} />
      {scopedAlters.length ? (
        <AlterPicker label="For" value={alterMap[filter] ? filter : null} onChange={(id) => setFilter(id || "all")}
          alters={scopedAlters} showNone noneLabel="Anyone" placeholder="Anyone" />
      ) : null}
    </span>
  );

  const listPanel = (
    <Panel className="hrm-pn" title="Your reminders" tools={quietText ? <span className="hrm-note">{quietText}</span> : null}>
      <div data-tour="reminders-list">
        {isLoading ? <LoadingBlock label="Loading reminders" rows={3} /> : nothingYet ? (
          <EmptyBlock compact title="No reminders yet" body="A reminder can come at set times, every so often, after a feeling, a symptom or sleep, or on a date."
            action={{ label: "New reminder", icon: Plus, onClick: () => openEditor(null) }} />
        ) : shown.length === 0 ? (
          <p className="hrm-empty">No reminders match this filter.</p>
        ) : (
          <ul className="hrm-list" aria-label="Your reminders">
            {shown.map((r) => {
              const alter = r.alter_id ? alterMap[r.alter_id] : null;
              const on = reminderOn(r, alter);
              const sel = editing?.id === r.id;
              return (
                <li key={r.id} className="hrm-rrow" data-selected={sel || undefined} data-highlight-id={r.id}>
                  <Button rank="quiet" className="hrm-rrow-main" aria-current={sel || undefined} aria-label={`Change ${r.title}`} onClick={() => openEditor(r)}>
                    <span className="hrm-rrow-text">
                      <span className="hrm-rrow-title" data-off={!r.is_active || undefined}>{r.title}</span>
                      <span className="hrm-rrow-how">{reminderWhenWords(r, { terms, alterName: r.trigger_config?.alter_id && alterMap[r.trigger_config.alter_id] ? formatAlter(alterMap[r.trigger_config.alter_id]) : null, clock: clockHhmm, dateWords })}</span>
                      {alter?.is_archived ? <span className="hrm-rrow-warn">{`Tied to an archived ${terms.alter}, so it's paused`}</span> : null}
                    </span>
                    <span className="hrm-rrow-who" style={alter && !alter.is_archived && alter.color ? { color: alter.color } : undefined}>
                      {whoWords(r, alter, { terms, formatAlter })}
                    </span>
                  </Button>
                  <Button rank={on ? "primary" : "secondary"} className="hrm-tick" aria-pressed={on}
                    aria-label={on ? `Pause ${r.title}` : `Turn on ${r.title}`}
                    disabledReason={alter?.is_archived ? `Tied to an archived ${terms.alter}` : undefined}
                    onClick={() => toggle(r)}>{on ? "on" : ""}</Button>
                </li>
              );
            })}
          </ul>
        )}
        {phone ? <p className="hrm-foot">Tap one to change it. Tap the box to pause it or turn it on. Delivery: in the app, and as phone notifications where allowed.</p> : null}
      </div>
    </Panel>
  );

  const startPanel = nothingYet ? (
    <Panel className="hrm-pn hrm-old" title="Start with a few" tools={<span className="hrm-note">suggestions</span>}>
      <RemindersOnboarding onDone={invalidate} />
    </Panel>
  ) : null;

  const editor = editorOpen ? (
    <ReminderEditor key={editing?.id || "new"} existing={editing} phone={phone} onClose={closeEditor} onSaved={invalidate} onDelete={remove} />
  ) : null;

  if (phone) {
    return (
      <HouseScope tokens={tokens} className="hrm hrm--phone" data-house-size="phone" data-reminders-room="">
        <NotificationStatusCard onlyWhenIssues />
        {editorOpen ? <div className="hrm-floor">{editor}</div> : (
          <>
            <div className="hrm-tabs">
              <PageTabs label="Reminder views" value={tab} onChange={setTab}
                tabs={[{ id: "inbox", label: "Inbox", tour: "reminders-inbox-tab" }, { id: "manage", label: "Manage", tour: "reminders-manage-tab" }]} />
            </div>
            <div className="hrm-floor">
              {tab === "inbox" ? duePanel : <div className="hrm-bar hrm-bar--inline">{filterRow}</div>}
              {listPanel}
              {startPanel}
            </div>
          </>
        )}
        {acts.modals}
      </HouseScope>
    );
  }

  return (
    <HouseScope tokens={tokens} className="hrm hrm--studio" data-house-size={size} data-reminders-room="">
      <div className="hrm-bar">
        <div className="hrm-toolbar" role="toolbar" aria-label="Reminders">
          <h1 className="hrm-title">Reminders</h1>
          {filterRow}
          <span className="hrm-grow" />
          <Button rank="secondary" icon={SettingsIcon} onClick={() => navigate("/settings#reminders")}>Quiet hours</Button>
          <Button rank="primary" icon={Plus} data-tour="reminders-new" onClick={() => openEditor(null)}>New reminder</Button>
        </div>
      </div>
      <div className="hrm-scroll">
        <NotificationStatusCard onlyWhenIssues />
        <div className="hrm-floor" data-house-size={size}>
          <div className="hrm-col">{duePanel}</div>
          <div className="hrm-col">{listPanel}{startPanel}</div>
          <div className="hrm-col hrm-col--ed">
            {editor || (
              <Panel className="hrm-pn" title="Reminder">
                <EmptyBlock compact title="Pick a reminder to change it" body="Or make a new one."
                  action={{ label: "New reminder", icon: Plus, onClick: () => openEditor(null) }} />
              </Panel>
            )}
          </div>
        </div>
      </div>
      <div className="hrm-status" role="status">
        <span>{statusWords({ reminders, onCount, dueCount: dueShown.length })}</span>
        {quietText ? <span>{quietText.replace(/^quiet/, "Quiet hours")}</span> : <span>Quiet hours off</span>}
        <span className="hrm-grow" />
        <span>Delivery: in the app, and as notifications where allowed</span>
      </div>
      {acts.modals}
    </HouseScope>
  );
}

// ── One fired reminder (board 23's Due now rows) ─────────────────────────
function DueRow({ instance, reminder, alter, acts, terms, formatAlter, readOnly = false }) {
  if (!reminder) return null;
  const snoozed = instance.status === "snoozed";
  const actions = effectiveActionsFor(reminder);
  const snoozeOpts = reminder.snooze_options?.length ? reminder.snooze_options : DEFAULT_SNOOZE_OPTIONS;
  const when = readOnly ? (HANDLED_WORDS[instance.status] || instance.status) : dueWhenWords(instance, { clockOf });
  return (
    <div className="hrm-due" data-done={readOnly || undefined} data-highlight-id={instance.id}>
      <div className="hrm-due-top">
        <span className="hrm-sq" style={{ background: alter?.color || "var(--house-accent)" }} aria-hidden="true" />
        <span className="hrm-due-title">{reminder.title}</span>
        <span className="hrm-due-when">{when}</span>
      </div>
      {alter ? (
        <div className="hrm-due-for" style={alter.color ? { color: alter.color } : undefined}>
          {`For ${formatAlter(alter)}${reminder.alter_scope === "when_fronting" ? ` · when ${terms.fronting}` : ""}`}
        </div>
      ) : null}
      {reminder.body ? <div className="hrm-due-body">{reminder.body}</div> : null}
      {readOnly ? null : snoozed ? (
        <div className="hrm-due-acts">
          <Button rank="primary" onClick={() => acts.unsnooze(instance)}>Unsnooze now</Button>
          <Button rank="secondary" onClick={() => acts.dismiss(instance)}>Dismiss</Button>
        </div>
      ) : (
        <div className="hrm-due-acts">
          {actions.map((a, idx) => <Button key={idx} rank={idx === 0 ? "primary" : "secondary"} onClick={() => acts.run(instance, a)}>{a.label}</Button>)}
          <Button rank={actions.length ? "secondary" : "primary"} onClick={() => acts.done(instance)}>Done</Button>
          <Button rank="secondary" onClick={() => acts.snooze(instance, snoozeOpts[0])}>{`Snooze ${formatSnoozeLabel(snoozeOpts[0])}`}</Button>
          {snoozeOpts.length > 1 ? (
            <Menu label={`More snooze times for ${reminder.title}`} icon={ChevronDown} rank="secondary"
              items={snoozeOpts.map((o, k) => ({ id: `s${k}`, label: `Snooze ${formatSnoozeLabel(o)}`, onSelect: () => acts.snooze(instance, o) }))} />
          ) : null}
          <Button rank="secondary" onClick={() => acts.dismiss(instance)}>Dismiss</Button>
        </div>
      )}
    </div>
  );
}
