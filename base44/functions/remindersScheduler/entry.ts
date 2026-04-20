import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import webpush from 'npm:web-push@3.6.7';

// ── helpers ───────────────────────────────────────────────────────────────────

function nowISO() { return new Date().toISOString(); }

function parseHHMM(str) {
  const [h, m] = (str || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function currentMinutes(now) {
  return now.getHours() * 60 + now.getMinutes();
}

/** True if `minuteOfDay` falls in [start, end) — wraps midnight if start > end */
function inQuietWindow(minuteOfDay, start, end) {
  if (start <= end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end;
}

function isoAtHHMM(date, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Returns ISO string for the end of today's quiet window */
function quietWindowEnd(now, endHHMM) {
  const d = new Date(now);
  const [h, m] = endHHMM.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1); // wrap to tomorrow if past
  return d.toISOString();
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── trigger evaluators ────────────────────────────────────────────────────────

async function evaluateReminderDue(reminder, now, base44, existingInstances) {
  const { trigger_type, trigger_config: cfg, last_fired_at } = reminder;
  const nowMs = now.getTime();
  const WINDOW = 60 * 1000; // 60-second match window

  if (trigger_type === "scheduled") {
    const times = cfg?.times || [];
    const days = cfg?.days; // undefined = every day
    const todayDow = now.getDay();
    if (days && !days.includes(todayDow)) return null;

    for (const timeStr of times) {
      const fireDate = isoAtHHMM(now, timeStr);
      const diff = nowMs - fireDate.getTime();
      if (diff >= 0 && diff < WINDOW) {
        // idempotency: no instance with scheduled_for on same calendar-minute
        const alreadyFired = existingInstances.some(i =>
          i.reminder_id === reminder.id &&
          Math.abs(new Date(i.scheduled_for).getTime() - fireDate.getTime()) < WINDOW
        );
        if (!alreadyFired) return { scheduled_for: fireDate.toISOString() };
      }
    }
    return null;
  }

  if (trigger_type === "interval") {
    const everyMs = (cfg?.every_minutes || 60) * 60 * 1000;
    let baseline = last_fired_at ? new Date(last_fired_at) : null;

    if (cfg?.after_last === "check_in") {
      const recentCheckIn = await base44.asServiceRole.entities.EmotionCheckIn.list("-created_date", 1);
      if (recentCheckIn?.length) baseline = new Date(recentCheckIn[0].created_date || recentCheckIn[0].timestamp);
    }

    if (!baseline) return { scheduled_for: now.toISOString() }; // never fired

    const elapsed = nowMs - baseline.getTime();
    if (elapsed < everyMs) return null;

    if (cfg?.active_window) {
      const winStart = parseHHMM(cfg.active_window.start);
      const winEnd = parseHHMM(cfg.active_window.end);
      if (!inQuietWindow(currentMinutes(now), winStart, winEnd)) return null;
    }

    return { scheduled_for: now.toISOString() };
  }

  if (trigger_type === "contextual") {
    const on = cfg?.on;

    if (on === "no_front_update") {
      const threshold = (cfg?.threshold_minutes || 120) * 60 * 1000;
      const sessions = await base44.asServiceRole.entities.FrontingSession.list("-created_date", 1);
      if (!sessions?.length) return null;
      const s = sessions[0];
      const lastActivity = Math.max(
        new Date(s.start_time || 0).getTime(),
        new Date(s.end_time || 0).getTime(),
        new Date(s.created_date || 0).getTime()
      );
      if (nowMs - lastActivity >= threshold) {
        const alreadyFired = existingInstances.some(i =>
          i.reminder_id === reminder.id &&
          nowMs - new Date(i.scheduled_for).getTime() < threshold
        );
        if (!alreadyFired) return { scheduled_for: now.toISOString() };
      }
      return null;
    }

    if (on === "emotion_logged") {
      const delayMs = (cfg?.delay_minutes || 0) * 60 * 1000;
      const matches = cfg?.matches || [];
      const windowStart = new Date(nowMs - delayMs - WINDOW);
      const checkIns = await base44.asServiceRole.entities.EmotionCheckIn.list("-created_date", 20);
      for (const ci of (checkIns || [])) {
        const ciTime = new Date(ci.timestamp || ci.created_date).getTime();
        if (ciTime < windowStart.getTime()) break;
        const hasMatch = matches.length === 0 || (ci.emotions || []).some(e => matches.includes(e));
        if (!hasMatch) continue;
        const fireAt = ciTime + delayMs;
        if (nowMs >= fireAt && nowMs - fireAt < WINDOW) {
          const alreadyFired = existingInstances.some(i =>
            i.reminder_id === reminder.id &&
            Math.abs(new Date(i.scheduled_for).getTime() - fireAt) < WINDOW
          );
          if (!alreadyFired) return { scheduled_for: new Date(fireAt).toISOString() };
        }
      }
      return null;
    }

    if (on === "sleep_ended") {
      const activities = await base44.asServiceRole.entities.Activity.list("-created_date", 20);
      for (const act of (activities || [])) {
        const name = (act.activity_name || "").toLowerCase();
        if (!name.includes("sleep")) continue;
        const startMs = new Date(act.timestamp).getTime();
        const endMs = startMs + (act.duration_minutes || 0) * 60 * 1000;
        if (nowMs - endMs >= 0 && nowMs - endMs < WINDOW) {
          const alreadyFired = existingInstances.some(i =>
            i.reminder_id === reminder.id &&
            Math.abs(new Date(i.scheduled_for).getTime() - endMs) < WINDOW
          );
          if (!alreadyFired) return { scheduled_for: new Date(endMs).toISOString() };
        }
      }
      return null;
    }

    return null; // unknown contextual sub-type
  }

  if (trigger_type === "event") {
    const when = cfg?.when ? new Date(cfg.when).getTime() : null;
    if (!when) return null;
    const preAlerts = [0, ...(cfg?.pre_alerts || [])];
    for (const offsetMins of preAlerts) {
      const fireAt = when - offsetMins * 60 * 1000;
      if (nowMs >= fireAt && nowMs - fireAt < WINDOW) {
        const alreadyFired = existingInstances.some(i =>
          i.reminder_id === reminder.id &&
          Math.abs(new Date(i.scheduled_for).getTime() - fireAt) < WINDOW
        );
        if (!alreadyFired) return { scheduled_for: new Date(fireAt).toISOString() };
      }
    }
    return null;
  }

  return null;
}

// ── auto-resolve check ────────────────────────────────────────────────────────

async function checkAutoResolve(reminder, base44) {
  const rule = reminder.auto_resolve_rule;
  if (!rule) return false;
  const since = reminder.last_fired_at ? new Date(reminder.last_fired_at) : new Date(0);

  if (rule.on === "check_in") {
    const items = await base44.asServiceRole.entities.EmotionCheckIn.list("-created_date", 5);
    return (items || []).some(i => new Date(i.timestamp || i.created_date) > since);
  }
  if (rule.on === "symptom_checkin") {
    const items = await base44.asServiceRole.entities.SymptomCheckIn.list("-created_date", 20);
    return (items || []).some(i =>
      i.symptom_id === rule.symptom_id && new Date(i.timestamp || i.created_date) > since
    );
  }
  if (rule.on === "activity") {
    const items = await base44.asServiceRole.entities.Activity.list("-created_date", 20);
    return (items || []).some(i => {
      const catIds = i.activity_category_ids || [];
      return catIds.includes(rule.category_id) && new Date(i.timestamp || i.created_date) > since;
    });
  }
  if (rule.on === "front_update") {
    const items = await base44.asServiceRole.entities.FrontingSession.list("-created_date", 5);
    return (items || []).some(i => new Date(i.created_date) > since || (i.end_time && new Date(i.end_time) > since));
  }
  return false;
}

// ── main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();

    // Load all active reminders
    const reminders = await base44.asServiceRole.entities.Reminder.filter({ is_active: true });
    const activeReminders = (reminders || []).filter(r => {
      if (!r.end_date) return true;
      return new Date(r.end_date) > now;
    });

    if (!activeReminders.length) return Response.json({ processed: 0 });

    // Load existing instances from the past 25 hours for idempotency
    const cutoff = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const allInstances = await base44.asServiceRole.entities.ReminderInstance.list("-created_date", 500);
    const recentInstances = (allInstances || []).filter(i => (i.created_date || "") >= cutoff);

    // Load settings for quiet hours (keyed per created_by — best effort, one per user in cron)
    const settingsList = await base44.asServiceRole.entities.SystemSettings.list();
    const settings = settingsList?.[0] || {};
    if (settings.reminders_paused) return Response.json({ ok: true, processed: 0, paused: true });

    const quietHours = settings.quiet_hours || {};

    // Load push subscriptions and alters
    const pushSubs = await base44.asServiceRole.entities.PushSubscription.filter({ is_active: true });
    const alters = await base44.asServiceRole.entities.Alter.list();
    const alterMap = Object.fromEntries((alters || []).map(a => [a.id, a]));

    // Load active fronting sessions for alter scope gate
    const activeFrontingSessions = await base44.asServiceRole.entities.FrontingSession.filter({ is_active: true });

    let processed = 0;

    // Promote catchup instances whose alter is now fronting, expire stale ones
    const catchupInstances = (allInstances || []).filter(i =>
      i.status === "pending" && i.pending_note === "waiting_for_alter_front"
    );
    for (const inst of catchupInstances) {
      const reminder = activeReminders.find(r => r.id === inst.reminder_id);
      if (!reminder?.alter_id) continue;
      const createdMs = new Date(inst.created_date || 0).getTime();
      if (now.getTime() - createdMs > 24 * 60 * 60 * 1000) {
        await base44.asServiceRole.entities.ReminderInstance.update(inst.id, {
          status: "auto_resolved",
          skipped_reason: "alter_not_fronting",
        });
        continue;
      }
      const isNowFronting = (activeFrontingSessions || []).some(s => {
        if (s.alter_id) return s.alter_id === reminder.alter_id;
        return s.primary_alter_id === reminder.alter_id || (s.co_fronter_ids || []).includes(reminder.alter_id);
      });
      if (isNowFronting) {
        await base44.asServiceRole.entities.ReminderInstance.update(inst.id, {
          status: "fired",
          fired_at: nowISO(),
          delivery_attempted: ["in_app"],
          pending_note: null,
        });
        processed++;
      }
    }

    for (const reminder of activeReminders) {
      try {
        // Skip if scoped to an archived alter
        if (reminder.alter_id) {
          const alter = alterMap[reminder.alter_id];
          if (alter?.is_archived) continue;
        }

        const due = await evaluateReminderDue(reminder, now, base44, recentInstances);
        if (!due) continue;

        // Check auto-resolve
        const autoResolved = await checkAutoResolve(reminder, base44);
        if (autoResolved) {
          await base44.asServiceRole.entities.ReminderInstance.create({
            reminder_id: reminder.id,
            scheduled_for: due.scheduled_for,
            fired_at: now.toISOString(),
            status: "auto_resolved",
            skipped_reason: "auto_resolved_rule",
            delivery_attempted: [],
          });
          processed++;
          continue;
        }

        // Alter scope gate
        if (reminder.alter_id && reminder.alter_scope === "when_fronting") {
          const isAlterFronting = (activeFrontingSessions || []).some(s => {
            if (s.alter_id) return s.alter_id === reminder.alter_id;
            return s.primary_alter_id === reminder.alter_id || (s.co_fronter_ids || []).includes(reminder.alter_id);
          });
          if (!isAlterFronting) {
            if (reminder.alter_scope_catchup) {
              // Don't create duplicate catchup instances
              const alreadyPending = recentInstances.some(i =>
                i.reminder_id === reminder.id &&
                i.status === "pending" &&
                i.pending_note === "waiting_for_alter_front"
              );
              if (!alreadyPending) {
                await base44.asServiceRole.entities.ReminderInstance.create({
                  reminder_id: reminder.id,
                  scheduled_for: due.scheduled_for,
                  status: "pending",
                  pending_note: "waiting_for_alter_front",
                  delivery_attempted: [],
                });
                processed++;
              }
            } else {
              await base44.asServiceRole.entities.ReminderInstance.create({
                reminder_id: reminder.id,
                scheduled_for: due.scheduled_for,
                fired_at: now.toISOString(),
                status: "auto_resolved",
                skipped_reason: "alter_not_fronting",
                delivery_attempted: [],
              });
              await base44.asServiceRole.entities.Reminder.update(reminder.id, { last_fired_at: now.toISOString() });
              processed++;
            }
            continue;
          }
        }

        // Check quiet hours
        if (reminder.quiet_hours_respect && quietHours.enabled) {
          const qStart = parseHHMM(quietHours.start || "22:00");
          const qEnd = parseHHMM(quietHours.end || "08:00");
          if (inQuietWindow(currentMinutes(now), qStart, qEnd)) {
            await base44.asServiceRole.entities.ReminderInstance.create({
              reminder_id: reminder.id,
              scheduled_for: quietWindowEnd(now, quietHours.end || "08:00"),
              status: "pending",
              delivery_attempted: [],
            });
            processed++;
            continue;
          }
        }

        // Create fired instance
        const deliveryAttempted = [];
        if ((reminder.delivery_channels || ["in_app"]).includes("in_app")) {
          deliveryAttempted.push("in_app");
        }

        const instance = await base44.asServiceRole.entities.ReminderInstance.create({
          reminder_id: reminder.id,
          scheduled_for: due.scheduled_for,
          fired_at: now.toISOString(),
          status: "fired",
          delivery_attempted: deliveryAttempted,
        });

        // Update last_fired_at on the reminder
        await base44.asServiceRole.entities.Reminder.update(reminder.id, {
          last_fired_at: now.toISOString(),
        });

        // Push delivery
        if ((reminder.delivery_channels || []).includes("push") && pushSubs?.length) {
          const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
          const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
          const vapidEmail = Deno.env.get("VAPID_EMAIL") || "mailto:admin@example.com";

          if (vapidPublic && vapidPrivate) {
            webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate);
            const payload = JSON.stringify({
              title: reminder.title,
              body: reminder.body || "",
              reminderInstanceId: instance.id,
              inlineActions: reminder.inline_actions || [],
            });

            for (const sub of pushSubs) {
              try {
                await webpush.sendNotification(
                  { endpoint: sub.endpoint, keys: sub.keys },
                  payload
                );
                if (!deliveryAttempted.includes("push")) deliveryAttempted.push("push");
              } catch (pushErr) {
                if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
                  await base44.asServiceRole.entities.PushSubscription.update(sub.id, { is_active: false });
                }
              }
            }

            // Update delivery_attempted if push succeeded
            if (deliveryAttempted.includes("push")) {
              await base44.asServiceRole.entities.ReminderInstance.update(instance.id, {
                delivery_attempted: deliveryAttempted,
              });
            }
          }
        }

        processed++;
      } catch (reminderErr) {
        console.error(`Error evaluating reminder ${reminder.id}:`, reminderErr.message);
      }
    }

    return Response.json({ ok: true, processed, ts: now.toISOString() });
  } catch (err) {
    console.error("remindersScheduler fatal:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
});