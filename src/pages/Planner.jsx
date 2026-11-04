// The planner page — the surface plus nothing else. Everything it does
// lives in PlannerSurface so the home-screen widgets behave identically.
//
// The planner is THE activities page now: the old activity tracker was
// merged into it, and /activities redirects here (see ActivitiesRedirect).
//
// Deep links: `?event=<id>` opens that planner event (with `?date=` the
// date it falls on). `?activityId=<id>` (or the older `?highlight=<id>`) opens
// that entry's details; `?date=YYYY-MM-DD` starts on that day's week (add `&view=month`
// or day / year to open on that zoom). The
// params are consumed once and stripped so a refresh or back-nav doesn't
// reopen the sheet.

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PlannerSurface from "@/components/planner/PlannerSurface";
import EventSheet from "@/components/planner/EventSheet";
import { usePlannerEvents } from "@/lib/plannerEvents";

function parseDay(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function Planner() {
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState(null);
  // ?event=<id> (search hits) opens that event on the ?date= it falls on.
  const [eventLink, setEventLink] = useState(null); // { id, key }
  const events = usePlannerEvents();
  const linkedEvent = eventLink ? events.find((e) => e.id === eventLink.id) : null;
  const eventRequest = useMemo(
    () => (linkedEvent ? { event: linkedEvent, occurrenceKey: eventLink.key } : null),
    [linkedEvent, eventLink]
  );
  // Read once on mount — the surface owns the anchor after that.
  const [initialAnchor] = useState(() => parseDay(params.get("date")));
  const [initialView] = useState(() => {
    const v = params.get("view");
    return ["day", "week", "month", "year"].includes(v) ? v : null;
  });

  useEffect(() => {
    const id = params.get("activityId") || params.get("highlight");
    const eventId = params.get("event");
    if (!id && !eventId && !params.has("date") && !params.has("view")) return;
    if (id) setOpenId(id);
    if (eventId) setEventLink({ id: eventId, key: params.get("date") || null });
    const next = new URLSearchParams(params);
    next.delete("activityId");
    next.delete("highlight");
    next.delete("date");
    next.delete("view");
    next.delete("event");
    setParams(next, { replace: true });
  }, [params, setParams]);

  return (
    <>
    {eventRequest && <EventSheet request={eventRequest} onClose={() => setEventLink(null)} />}
    <PlannerSurface
      dayCount={7}
      chrome
      initialAnchor={initialAnchor}
      initialView={initialView}
      openActivityId={openId}
      onOpenedActivity={() => setOpenId(null)}
    />
    </>
  );
}
