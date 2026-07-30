// UI v2 Home — designed from docs/function-tree.md, not from the old
// dashboard. With capture keys and Support living in the frame, Home's
// only job is orientation:
//
//   NOW    — who's fronting (branch 2), what's running (14.4)
//   TODAY  — today's plan items + due tasks + unresolved count (4.1.1)
//   RECENT — latest status note + last capture, for "what was I doing"
//
// Sketch-stage: three plain sections, text rows, no widgets, no
// decoration. Rendered by Dashboard.jsx when ui_v2 is enabled so every
// existing modal/handler (functioning) stays hosted there unchanged.

import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { getActiveActivities } from "@/lib/activitySession";
import { Page, Section, Row, Muted, TextAction, Dot } from "@/v2/primitives";

const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

export default function HomeV2() {
  const navigate = useNavigate();
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const now = Date.now();

  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"], queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const { data: symptomSessions = [] } = useQuery({
    queryKey: ["symptomSessions"], queryFn: () => base44.entities.SymptomSession.filter({ is_active: true }),
  });
  const { data: symptoms = [] } = useQuery({ queryKey: ["symptoms"], queryFn: () => base44.entities.Symptom.list() });
  const { data: sleeps = [] } = useQuery({ queryKey: ["sleep"], queryFn: () => base44.entities.Sleep.list() });
  const { data: activities = [] } = useQuery({ queryKey: ["activities"], queryFn: () => base44.entities.Activity.list() });
  const { data: tasks = [] } = useQuery({ queryKey: ["tasks"], queryFn: () => base44.entities.Task.list() });
  const { data: statusNotes = [] } = useQuery({ queryKey: ["statusNotes"], queryFn: () => base44.entities.StatusNote.list() });
  const { data: checkIns = [] } = useQuery({ queryKey: ["emotionCheckIns"], queryFn: () => base44.entities.EmotionCheckIn.list() });

  const altersById = useMemo(() => Object.fromEntries(alters.map((a) => [a.id, a])), [alters]);

  // NOW
  const fronters = activeSessions
    .map((s) => ({ s, alter: altersById[s.alter_id || s.primary_alter_id] }))
    .filter((x) => x.alter)
    .sort((a, b) => (b.s.is_primary === true) - (a.s.is_primary === true));
  const runningActivities = getActiveActivities();
  const activeSleep = sleeps.find((s) => s.bedtime && !s.wake_time);
  const symptomsById = useMemo(() => Object.fromEntries(symptoms.map((s) => [s.id, s])), [symptoms]);
  const runningSymptoms = symptomSessions
    .map((s) => ({ s, def: symptomsById[s.symptom_id || s.symptom_definition_id] }))
    .filter((x) => x.def);

  // TODAY
  const todayPlans = activities
    .filter((a) => a.status === "scheduled" && a.timestamp && sameDay(a.timestamp, now))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const unresolvedCount = activities
    .filter((a) => a.status === "scheduled" && a.timestamp && new Date(a.timestamp).getTime() < now - 3600000)
    .length;
  const dueTasks = tasks
    .filter((x) => !x.completed && x.due_date && new Date(x.due_date).getTime() < now + 24 * 3600000)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5);

  // RECENT
  const latestNote = [...statusNotes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  const lastCheckIn = [...checkIns].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

  return (
    <Page>
      <Section
        label="Now"
        action={
          <TextAction onClick={() => window.dispatchEvent(new CustomEvent("open-set-front"))}>
            {t.Switch}
          </TextAction>
        }
      >
        {fronters.length === 0 && <Muted>No {t.fronter} set.</Muted>}
        {fronters.map(({ s, alter }) => (
          <Row
            key={s.id}
            left={<Dot color={alter.color} />}
            primary={formatAlter(alter)}
            secondary={s.is_primary ? "primary" : undefined}
            right={s.start_time ? `since ${fmtTime(s.start_time)}` : undefined}
            onClick={() => navigate(`/alter/${alter.id}`)}
          />
        ))}
        {runningActivities.map((a) => (
          <Row key={a.id} left={<Dot color="var(--v2-accent)" />} primary={a.activity_name || "Activity"}
            secondary="running" right={a.start ? `since ${fmtTime(a.start)}` : undefined}
            onClick={() => navigate("/activities")} />
        ))}
        {runningSymptoms.map(({ s, def }) => (
          <Row key={s.id} left={<Dot color={def.color || "#a78bfa"} />} primary={def.label || def.name}
            secondary="ongoing" right={s.start_time ? `since ${fmtTime(s.start_time)}` : undefined}
            onClick={() => navigate("/system-checkin")} />
        ))}
        {activeSleep && (
          <Row left={<Dot color="#6a7bd6" />} primary="Sleep in progress"
            right={`since ${fmtTime(activeSleep.bedtime)}`} onClick={() => navigate("/sleep")} />
        )}
      </Section>

      <Section
        label="Today"
        action={<TextAction onClick={() => navigate("/activities")}>Planner</TextAction>}
      >
        {todayPlans.length === 0 && dueTasks.length === 0 && <Muted>Nothing scheduled or due.</Muted>}
        {todayPlans.map((a) => {
          const past = new Date(a.timestamp).getTime() < now;
          return (
            <Row key={a.id} primary={a.activity_name} secondary={past ? "unresolved" : undefined}
              right={fmtTime(a.timestamp)}
              onClick={() => navigate(`/activities?activityId=${a.id}`)} />
          );
        })}
        {dueTasks.map((x) => (
          <Row key={x.id} primary={x.title} secondary="task"
            right={sameDay(x.due_date, now) ? "today" : fmtTime(x.due_date)}
            onClick={() => navigate(`/todo?id=${x.id}`)} />
        ))}
        {unresolvedCount > 0 && (
          <Muted>
            {unresolvedCount} unresolved plan{unresolvedCount === 1 ? "" : "s"} —{" "}
            <TextAction onClick={() => navigate("/activities?tab=planned")}>review</TextAction>
          </Muted>
        )}
      </Section>

      <Section
        label="Recent"
        action={<TextAction onClick={() => navigate("/checkin-log")}>Records</TextAction>}
      >
        {latestNote ? (
          <Row primary={latestNote.note} right={fmtTime(latestNote.timestamp)}
            onClick={() => navigate(`/timeline?highlightStatus=${latestNote.id}`)} />
        ) : (
          <Muted>No status notes yet.</Muted>
        )}
        {lastCheckIn && (
          <Muted>Last check-in {fmtTime(lastCheckIn.timestamp)}{sameDay(lastCheckIn.timestamp, now) ? "" : ` (${new Date(lastCheckIn.timestamp).toLocaleDateString([], { month: "short", day: "numeric" })})`}.</Muted>
        )}
      </Section>
    </Page>
  );
}
