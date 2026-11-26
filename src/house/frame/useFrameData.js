// The live bits the frame shows, read through the shared caches the old
// house already fills (no new queries of its own where one exists). READS
// ONLY: the frame never writes a record.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44, localEntities } from "@/api/base44Client";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { getSaveHealth } from "@/lib/localDb";
import { getLastRun, getSyncFolder } from "@/lib/deviceSyncRunner";
import { computePrescheduledFires } from "@/lib/nativeReminderScheduler";
import { isPreviewActive, subscribe as subscribePreview } from "@/lib/previewMode";
import { attributionPolicy } from "@/lib/emotionAttribution";
import { resolveFrontLevels } from "@/lib/frontLevels";
import { resolvePageTitle } from "@/house/frame/pageTitle";

export function useSettingsRow() {
  const { data: list = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  return pickPrimarySystemSettings(list);
}

/** Save health, kept live from localDb's own event. */
export function useSaveHealth() {
  const [health, setHealth] = useState(getSaveHealth);
  useEffect(() => {
    const on = (e) => setHealth(e.detail || getSaveHealth());
    window.addEventListener("symphony-save-health", on);
    return () => window.removeEventListener("symphony-save-health", on);
  }, []);
  return health;
}

// A tick a minute while the page is in sight; none while it's hidden (a
// background tab or the app in the background on a phone), and one at once
// on coming back, so the times shown catch up.
export function useMinuteTick() {
  const [n, tick] = useState(0);
  useEffect(() => {
    let id = 0;
    const start = () => { if (!id) id = setInterval(() => tick((x) => x + 1), 60000); };
    const stop = () => { clearInterval(id); id = 0; };
    const onVis = () => {
      if (document.visibilityState === "hidden") stop();
      else { tick((x) => x + 1); start(); }
    };
    if (typeof document === "undefined" || document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return n;
}

export function useLastSync() {
  useMinuteTick();
  return getSyncFolder() ? getLastRun() : "";
}

export function usePreviewOn() {
  const [on, setOn] = useState(isPreviewActive);
  useEffect(() => subscribePreview(() => setOn(isPreviewActive())), []);
  return on;
}

/** The next time a reminder will fire on its own (scheduled reminders), or null. */
export function useNextReminder() {
  const tick = useMinuteTick();
  const row = useSettingsRow();
  const { data: reminders = [] } = useQuery({
    queryKey: ["reminders", "all"],
    queryFn: () => base44.entities.Reminder.list(),
  });
  return useMemo(() => {
    const now = new Date();
    let best = null;
    for (const r of reminders) {
      if (!r || !r.is_active || r.trashed_at) continue;
      let next = null;
      try { next = computePrescheduledFires(r, row, now, {}, { horizonDays: 2, maxFires: 1 })[0]; } catch { next = null; }
      if (next && (!best || next < best.at)) best = { at: next, title: r.title || r.name || "Reminder" };
    }
    return best;
  }, [reminders, row, tick]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The person's "Entries belong to" rule (Manage check-ins → Feelings):
 * "all", "none" or "exclude:<level ids>", read through attributionPolicy with
 * the front levels, the same as the check-in save path. */
export function useAttributionPolicy() {
  const row = useSettingsRow();
  return attributionPolicy(row, resolveFrontLevels(row));
}

/** The page's real name, area and kind, for the route on screen. */
export function usePageTitle(pathname, search, { terms, formatAlter }) {
  const kind = (pathname.match(/^\/(alter|group|contacts|location)\//) || [])[1];
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list(), enabled: kind === "group" });
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts"], queryFn: () => base44.entities.Contact.list(), enabled: kind === "contacts" });
  const { data: places = [] } = useQuery({ queryKey: ["innerWorldLocations"], queryFn: () => base44.entities.InnerWorldLocation.list(), enabled: kind === "location" });
  return useMemo(
    () => resolvePageTitle(pathname, { search, terms, formatAlter, records: { alters, groups, contacts, innerWorldLocations: places } }),
    [pathname, search, terms, formatAlter, alters, groups, contacts, places],
  );
}

/** The newest Recent changes rows (the History tab). Only reads while asked. */
export function useRecentChanges(enabled) {
  return useQuery({
    queryKey: ["historyEvents"],
    queryFn: () => localEntities.HistoryEvent.list("-timestamp", 500),
    enabled,
  });
}
