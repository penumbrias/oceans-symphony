// The pixel look's timeline dock and Info panel (computer, Home).
//
// The dock is the mockup's "Timeline" panel: one day drawn left to right,
// each kind of record on its own layer (one row per {alter} who was in
// front, then activities, feelings, symptoms, sleep, locations, statuses,
// journals). It only DISPLAYS — the day comes from the timeline's own data
// layer (useTimelineSources + sliceTimelineDay, the same slice the Timeline
// page and widget draw), and nothing here writes a record.
//
// Clicking an item opens the Info panel on the right: what it is, when,
// who, and doors into the places that already edit it (the plan sheet for
// activities, the Timeline page's editor for fronting sessions, the
// Timeline page on that day for the rest).
//
// Switch it on in Display options → Bars → Timeline dock, or with the tool
// rail's Timeline key on Home. Which layers show is set there too, and with
// the eye on each layer.

import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { addDays, format, isSameDay, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, Eye, EyeOff, X, CalendarClock } from "lucide-react";
import { useTimelineSources, sliceTimelineDay } from "@/lib/timelineData";
import { usePixelLook, PIXEL_DOCK_LAYERS } from "@/lib/uiLook";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { applyTerms } from "@/lib/dailyTaskSystem";
import { activityDate } from "@/lib/dateUtils";
import { statusFor, STATUS_LABELS } from "@/lib/activityStatus";
import { OPEN_PLAN_RESOLVE_EVENT } from "@/lib/planner/resolvePlan";
import { redactWhispers } from "@/lib/whisperRedact";
import { journalEntryDate } from "@/lib/journalDate";
import { getCategoryMeta } from "@/lib/locationCategories";

const DAY_MIN = 24 * 60;
const INFO_EVENT = "os-px-info";

// ── Info panel store ───────────────────────────────────────────────────
let currentInfo = null;
export function openPixelInfo(info) {
  currentInfo = info || null;
  try { window.dispatchEvent(new CustomEvent(INFO_EVENT)); } catch { /* ignore */ }
}
function usePixelInfo() {
  const [info, setInfo] = React.useState(currentInfo);
  React.useEffect(() => {
    const on = () => setInfo(currentInfo);
    window.addEventListener(INFO_EVENT, on);
    return () => window.removeEventListener(INFO_EVENT, on);
  }, []);
  return info;
}

const plain = (html) => redactWhispers(String(html || ""))
  .replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const clip = (text, n = 160) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);
const hm = (d) => format(d, "h:mm a");
const ms = (v) => (v instanceof Date ? v.getTime() : new Date(v).getTime());
const membersOf = (s) => (s.alter_id ? [s.alter_id] : [s.primary_alter_id, ...(s.co_fronter_ids || [])].filter(Boolean));
function parseList(v) {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string" || !v) return [];
  try { const out = JSON.parse(v); return Array.isArray(out) ? out : []; } catch { return []; }
}

// ── Dock ───────────────────────────────────────────────────────────────
export default function PixelTimelineDock() {
  const { px, write } = usePixelLook();
  const { pathname } = useLocation();
  const show = px.dock && pathname === "/";
  React.useEffect(() => {
    if (!show) return undefined;
    const el = document.documentElement;
    el.setAttribute("data-px-dock", "1");
    return () => el.removeAttribute("data-px-dock");
  }, [show]);
  if (!show) return null;
  return <Dock hidden={px.dockHidden} write={write} />;
}

function Dock({ hidden, write }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const navigate = useNavigate();
  const src = useTimelineSources();
  const [day, setDay] = React.useState(() => startOfDay(new Date()));
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const isToday = isSameDay(day, new Date(now));
  const d = React.useMemo(() => sliceTimelineDay(src, day), [src, day]);
  const dayStart = day.getTime();
  const dayEnd = dayStart + DAY_MIN * 60000;
  const dateStr = d.dateStr;

  const alterById = React.useMemo(() => Object.fromEntries((src.alters || []).map((a) => [a.id, a])), [src.alters]);
  const catById = React.useMemo(() => Object.fromEntries((src.categories || []).map((c) => [c.id, c])), [src.categories]);
  const symptomById = React.useMemo(() => Object.fromEntries((src.symptoms || []).map((s) => [s.id, s])), [src.symptoms]);
  const nameOf = (id) => (alterById[id] ? formatAlter(alterById[id]) : `Unknown ${terms.alter}`);
  const whoOf = (ids) => (ids || []).filter(Boolean).map(nameOf).join(", ");

  // A span on the 24-hour track, clamped to the day.
  const span = (startV, endV) => {
    const a = Math.max(dayStart, ms(startV));
    const b = Math.min(dayEnd, endV == null ? Math.min(now, dayEnd) : ms(endV));
    const left = ((a - dayStart) / 60000 / DAY_MIN) * 100;
    const width = Math.max(0, ((b - a) / 60000 / DAY_MIN) * 100);
    return { left, width };
  };
  const at = (v) => ({ left: ((ms(v) - dayStart) / 60000 / DAY_MIN) * 100 });
  const onTimeline = (extra = "") => () => navigate(`/timeline?date=${dateStr}${extra}`);
  const timelineAction = { label: "Show on timeline", run: onTimeline() };

  const layers = React.useMemo(() => {
    const out = [];
    // Fronting: one row per {alter} in front at any point this day.
    const byAlter = new Map();
    for (const s of d.sessions) {
      for (const id of membersOf(s)) {
        if (!byAlter.has(id)) byAlter.set(id, []);
        byAlter.get(id).push(s);
      }
    }
    out.push({
      id: "fronting", label: applyTerms("{{Fronting}}", terms),
      rows: [...byAlter.entries()].map(([id, list]) => ({
        id: `alter:${id}`, label: nameOf(id), color: alterById[id]?.color || null,
        items: list.map((s) => ({
          key: `${s.id}:${id}`, kind: "bar", ...span(s.start_time, s.end_time), label: nameOf(id), color: alterById[id]?.color,
          info: () => ({
            title: `${terms.Fronting}: ${nameOf(id)}`,
            rows: [
              ["From", hm(new Date(s.start_time))],
              ["Until", s.end_time ? hm(new Date(s.end_time)) : "Now"],
              ...(membersOf(s).length > 1 ? [["With", whoOf(membersOf(s).filter((x) => x !== id))]] : []),
              ...(parseList(s.note).length ? [["Notes", String(parseList(s.note).length)]] : []),
            ],
            actions: [{ label: "Edit on timeline", main: true, run: onTimeline(`&focusSessionId=${s.id}&edit=1`) }],
          }),
        })),
      })),
    });
    out.push({
      id: "activities", label: "Activities",
      items: d.activities.map((a) => {
        const start = activityDate(a);
        const mins = Math.max(0, a.actual_duration_minutes ?? a.duration_minutes ?? 0);
        const cat = catById[a.parent_category_id];
        const status = statusFor(a);
        return {
          key: a.id, kind: mins > 0 ? "bar" : "dot",
          ...(mins > 0 ? span(start, start.getTime() + mins * 60000) : at(start)),
          label: a.activity_name || "Activity", color: cat?.color,
          info: () => ({
            title: a.activity_name || "Activity",
            rows: [
              ["When", mins > 0 ? `${hm(start)} to ${hm(new Date(start.getTime() + mins * 60000))}` : hm(start)],
              ["Status", STATUS_LABELS[status] || status],
              ...(cat ? [["Category", cat.name]] : []),
              ...(a.alter_id ? [["Who", nameOf(a.alter_id)]] : []),
              ...(a.notes ? [["Notes", clip(plain(a.notes))]] : []),
            ],
            actions: [
              { label: "Open", main: true, run: () => window.dispatchEvent(new CustomEvent(OPEN_PLAN_RESOLVE_EVENT, { detail: { activityId: a.id } })) },
              timelineAction,
            ],
          }),
        };
      }),
    });
    out.push({
      id: "feelings", label: "Feelings",
      items: d.emotions.map((e) => {
        const names = (Array.isArray(e.emotions) ? e.emotions : []).map((x) => (typeof x === "string" ? x : x?.name || x?.label)).filter(Boolean);
        return {
          key: e.id, kind: "dot", ...at(e.timestamp), label: names.join(", ") || "Check-in",
          info: () => ({
            title: names.length ? names.join(", ") : "Check-in",
            rows: [
              ["When", hm(new Date(e.timestamp))],
              ...(e.intensity != null ? [["Intensity", String(e.intensity)]] : []),
              ...((e.fronting_alter_ids || (e.alter_id ? [e.alter_id] : [])).length ? [["Who", whoOf(e.fronting_alter_ids || [e.alter_id])]] : []),
              ...(e.note ? [["Note", clip(plain(e.note))]] : []),
            ],
            actions: [{ ...timelineAction, main: true }],
          }),
        };
      }),
    });
    out.push({
      id: "symptoms", label: "Symptoms",
      items: [
        ...d.symptomSessions.map((s) => {
          const def = symptomById[s.symptom_id || s.symptom_definition_id];
          const label = def?.name || def?.label || "Symptom";
          return {
            key: `ss:${s.id}`, kind: "bar", ...span(s.start_time, s.end_time), label,
            info: () => ({
              title: label,
              rows: [["From", hm(new Date(s.start_time))], ["Until", s.end_time ? hm(new Date(s.end_time)) : "Now"]],
              actions: [{ ...timelineAction, main: true }],
            }),
          };
        }),
        ...d.symptomCheckIns.map((c) => {
          const def = symptomById[c.symptom_id];
          const label = def?.name || def?.label || "Symptom";
          return {
            key: `sc:${c.id}`, kind: "dot", ...at(c.timestamp), label,
            info: () => ({
              title: label,
              rows: [["When", hm(new Date(c.timestamp))], ...(c.intensity != null ? [["Intensity", String(c.intensity)]] : [])],
              actions: [{ ...timelineAction, main: true }],
            }),
          };
        }),
      ],
    });
    out.push({
      id: "sleep", label: "Sleep",
      items: d.sleeps.filter((s) => s.bedtime).map((s) => ({
        key: s.id, kind: "bar", ...span(s.bedtime, s.wake_time), label: "Sleep",
        info: () => ({
          title: "Sleep",
          rows: [
            ["Bedtime", hm(new Date(s.bedtime))],
            ["Woke", s.wake_time ? hm(new Date(s.wake_time)) : "Still asleep"],
            ...(s.quality != null ? [["Quality", String(s.quality)]] : []),
          ],
          actions: [{ label: "Open sleep", main: true, run: () => navigate("/sleep") }, timelineAction],
        }),
      })),
    });
    out.push({
      id: "locations", label: "Locations",
      items: d.locations.map((l) => ({
        key: l.id, kind: "dot", ...at(l.timestamp), label: l.name || "Location",
        info: () => ({
          title: l.name || "Location",
          rows: [
            ["When", hm(new Date(l.timestamp))],
            ...(l.category ? [["Kind", getCategoryMeta(l.category)?.label || l.category]] : []),
            ...(l.notes ? [["Notes", clip(plain(l.notes))]] : []),
          ],
          actions: [
            ...(l.latitude != null && l.longitude != null
              ? [{ label: "Open in Maps", run: () => window.open(`https://www.google.com/maps?q=${l.latitude},${l.longitude}`, "_blank", "noopener") }]
              : []),
            { ...timelineAction, main: true },
          ],
        }),
      })),
    });
    out.push({
      id: "statuses", label: "Statuses",
      items: d.statusNotes.map((n) => ({
        key: n.id, kind: "dot", ...at(n.timestamp), label: clip(plain(n.note), 40),
        info: () => ({
          title: "Status",
          rows: [["When", hm(new Date(n.timestamp))], ["Status", clip(plain(n.note), 300)]],
          actions: [{ label: "Show on timeline", main: true, run: onTimeline(`&highlightStatus=${n.id}`) }],
        }),
      })),
    });
    out.push({
      id: "journals", label: "Journals",
      items: d.journals.map((j) => {
        const when = journalEntryDate(j);
        const title = j.is_encrypted ? "Locked journal" : (j.title || "Journal entry");
        return {
          key: j.id, kind: "dot", ...at(when), label: title,
          info: () => ({
            title,
            rows: [["When", hm(new Date(when))]],
            actions: [{ label: "Open journals", main: true, run: () => navigate("/journals") }, timelineAction],
          }),
        };
      }),
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, now, terms, alterById, catById, symptomById, formatAlter]);

  const toggleLayer = (id) => {
    const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
    write({ dockHidden: next.length ? next : "" });
  };
  const nowLeft = isToday ? ((now - dayStart) / 60000 / DAY_MIN) * 100 : null;
  const hours = [0, 3, 6, 9, 12, 15, 18, 21];

  const lane = (items) => (
    <div className="px-dock-lane">
      {nowLeft != null && <span className="px-dock-now" style={{ left: `${nowLeft}%` }} aria-hidden="true" />}
      {items.map((it) => (
        <button key={it.key} type="button"
          className={it.kind === "bar" ? "px-dock-item px-dock-bar" : "px-dock-item px-dock-dot"}
          style={{
            left: `${it.left}%`,
            ...(it.kind === "bar" ? { width: `max(6px, ${it.width}%)` } : null),
            ...(it.color ? { "--px-item": it.color } : null),
          }}
          title={it.label} aria-label={it.label}
          onClick={() => openPixelInfo({ key: it.key, ...it.info() })}>
          {it.kind === "bar" && <span className="px-dock-item-txt">{it.label}</span>}
        </button>
      ))}
    </div>
  );

  return (
    <section className="px-dock" aria-label="Timeline" data-tour="px-timeline-dock">
      <div className="px-dock-ttl">
        <span className="px-dock-name"><CalendarClock style={{ width: 14, height: 14 }} aria-hidden="true" /> Timeline</span>
        <span className="px-dock-nav">
          <button type="button" className="px-dock-btn" aria-label="Previous day" onClick={() => setDay((x) => addDays(x, -1))}>
            <ChevronLeft style={{ width: 14, height: 14 }} />
          </button>
          <span className="px-dock-date">{format(day, "EEE d MMM")}</span>
          <button type="button" className="px-dock-btn" aria-label="Next day" onClick={() => setDay((x) => addDays(x, 1))}>
            <ChevronRight style={{ width: 14, height: 14 }} />
          </button>
          <button type="button" className="px-dock-btn" disabled={isToday} onClick={() => setDay(startOfDay(new Date()))}>Today</button>
          <button type="button" className="px-dock-btn" onClick={onTimeline()}>Open page</button>
          <button type="button" className="px-dock-btn" aria-label="Hide the timeline dock" title="Hide the timeline dock"
            onClick={() => write({ dock: "" })}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </span>
      </div>
      <div className="px-dock-body">
        <div className="px-dock-row px-dock-axis" aria-hidden="true">
          <span className="px-dock-head" />
          <div className="px-dock-lane">
            {hours.map((h) => (
              <span key={h} className="px-dock-hour" style={{ left: `${(h / 24) * 100}%` }}>
                {format(new Date(2000, 0, 1, h), "h a")}
              </span>
            ))}
          </div>
        </div>
        {layers.map((layer) => {
          const off = hidden.includes(layer.id);
          const empty = layer.rows ? layer.rows.length === 0 : layer.items.length === 0;
          return (
            <React.Fragment key={layer.id}>
              <div className={`px-dock-row px-dock-layer${off ? " off" : ""}`}>
                <span className="px-dock-head">
                  <button type="button" className="px-dock-eye" aria-pressed={!off}
                    aria-label={off ? `Show ${layer.label}` : `Hide ${layer.label}`} onClick={() => toggleLayer(layer.id)}>
                    {off ? <EyeOff style={{ width: 12, height: 12 }} /> : <Eye style={{ width: 12, height: 12 }} />}
                  </button>
                  <span className="px-dock-label">{layer.label}</span>
                  {empty && !off && <span className="px-dock-none">none</span>}
                </span>
                {!off && !layer.rows ? lane(layer.items) : <div className="px-dock-lane" />}
              </div>
              {!off && layer.rows && layer.rows.map((row) => (
                <div key={row.id} className="px-dock-row">
                  <span className="px-dock-head px-dock-sub">
                    <span className="px-dock-swatch" style={row.color ? { background: row.color } : undefined} aria-hidden="true" />
                    <span className="px-dock-label os-alter-name">{row.label}</span>
                  </span>
                  {lane(row.items)}
                </div>
              ))}
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}

// ── Info panel ─────────────────────────────────────────────────────────
// What you clicked in the dock: its details and the doors that edit it.
// Sits where the page's help panel sits (and over it while open).
export function PixelInfoPanel() {
  const info = usePixelInfo();
  const { pathname } = useLocation();
  React.useEffect(() => { openPixelInfo(null); }, [pathname]);
  React.useEffect(() => {
    if (!info) return undefined;
    const el = document.documentElement;
    el.setAttribute("data-px-info", "1");
    const onKey = (e) => { if (e.key === "Escape") openPixelInfo(null); };
    window.addEventListener("keydown", onKey);
    return () => { el.removeAttribute("data-px-info"); window.removeEventListener("keydown", onKey); };
  }, [info]);
  if (!info) return null;
  return (
    <aside className="px-help px-info" aria-label={`Info: ${info.title}`}>
      <div className="px-help-ttl">
        <span className="truncate">Info: {info.title}</span>
        <button type="button" className="px-help-x" aria-label="Close info" onClick={() => openPixelInfo(null)}>
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>
      <div className="px-help-body">
        <dl className="px-info-rows">
          {info.rows.map(([k, v]) => (
            <div key={k} className="px-info-row"><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </div>
      {info.actions?.length > 0 && (
        <div className="px-help-foot px-info-foot">
          {info.actions.map((a) => (
            <button key={a.label} type="button" className={a.main ? "px-help-btn px-help-btn-main" : "px-help-btn"}
              onClick={() => { a.run(); if (!a.keepOpen) openPixelInfo(null); }}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
