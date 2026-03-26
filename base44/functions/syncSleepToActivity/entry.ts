import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { event, data } = await req.json();

    if (!data || !data.bedtime || !data.wake_time) {
      return Response.json({ error: 'Invalid sleep data' }, { status: 400 });
    }

    const bedtime = new Date(data.bedtime);
    const wakeTime = new Date(data.wake_time);
    const durationMinutes = Math.round((wakeTime - bedtime) / (1000 * 60));

    // Tag embeds the sleep record id so we can reliably find+update/delete the linked activity
    const sleepTag = `[sleep_id:${data.id}]`;
    const notesStr = `${bedtime.toLocaleString()} - ${wakeTime.toLocaleString()} ${sleepTag}`;

    // Find any previously created activity for this sleep record (user-scoped query)
    const findSleepActivity = async () => {
      const all = await base44.entities.Activity.filter({ activity_name: 'Sleep' });
      return all.find(a => (a.notes || '').includes(sleepTag));
    };

    if (event.type === 'create') {
      // Guard against duplicate: only create if no linked activity exists yet
      const existing = await findSleepActivity();
      if (!existing) {
        await base44.entities.Activity.create({
          timestamp: bedtime.toISOString(),
          activity_name: 'Sleep',
          activity_category_ids: [],
          color: '#6366f1',
          duration_minutes: durationMinutes,
          notes: notesStr,
        });
      }
    } else if (event.type === 'update') {
      const existing = await findSleepActivity();
      if (existing) {
        await base44.entities.Activity.update(existing.id, {
          timestamp: bedtime.toISOString(),
          duration_minutes: durationMinutes,
          notes: notesStr,
        });
      } else {
        // Create if missing (e.g. if automation was added after initial records)
        await base44.entities.Activity.create({
          timestamp: bedtime.toISOString(),
          activity_name: 'Sleep',
          activity_category_ids: [],
          color: '#6366f1',
          duration_minutes: durationMinutes,
          notes: notesStr,
        });
      }
    } else if (event.type === 'delete') {
      const existing = await findSleepActivity();
      if (existing) {
        await base44.entities.Activity.delete(existing.id);
      }
    }

    return Response.json({ success: true, message: `Sleep activity ${event.type}d successfully` });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});