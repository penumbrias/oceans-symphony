import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { event, data } = await req.json();

    if (!data) {
      return Response.json({ error: 'No data provided' }, { status: 400 });
    }

    // Tag embedded in notes to reliably identify the linked activity
    const sleepTag = `[sleep_id:${data.id}]`;

    const findLinkedActivity = async () => {
      // User-scoped search — respects RLS so results are visible in the UI
      const all = await base44.entities.Activity.list('-created_date', 500);
      return all.find(a => (a.notes || '').includes(sleepTag));
    };

    if (event.type === 'create') {
      if (!data.bedtime || !data.wake_time) {
        return Response.json({ success: true, message: 'Skipped — missing bedtime/wake_time' });
      }

      // Prevent duplicates: check if one already exists
      const existing = await findLinkedActivity();
      if (existing) {
        return Response.json({ success: true, message: 'Activity already exists, skipping' });
      }

      const bedtime = new Date(data.bedtime);
      const wakeTime = new Date(data.wake_time);
      const durationMinutes = Math.round((wakeTime - bedtime) / (1000 * 60));
      const notesStr = [
        data.notes ? data.notes : null,
        sleepTag,
      ].filter(Boolean).join(' ');

      await base44.entities.Activity.create({
        timestamp: bedtime.toISOString(),
        activity_name: 'Sleep',
        activity_category_ids: [],
        color: '#6366f1',
        duration_minutes: durationMinutes,
        notes: notesStr,
        source: 'sleep_tracker',
      });

    } else if (event.type === 'update') {
      if (!data.bedtime || !data.wake_time) {
        return Response.json({ success: true, message: 'Skipped — missing bedtime/wake_time' });
      }

      const bedtime = new Date(data.bedtime);
      const wakeTime = new Date(data.wake_time);
      const durationMinutes = Math.round((wakeTime - bedtime) / (1000 * 60));
      const notesStr = [
        data.notes ? data.notes : null,
        sleepTag,
      ].filter(Boolean).join(' ');

      const existing = await findLinkedActivity();
      if (existing) {
        await base44.entities.Activity.update(existing.id, {
          timestamp: bedtime.toISOString(),
          duration_minutes: durationMinutes,
          notes: notesStr,
        });
      } else {
        // Create if missing (e.g. backfill after migration)
        await base44.entities.Activity.create({
          timestamp: bedtime.toISOString(),
          activity_name: 'Sleep',
          activity_category_ids: [],
          color: '#6366f1',
          duration_minutes: durationMinutes,
          notes: notesStr,
          source: 'sleep_tracker',
        });
      }

    } else if (event.type === 'delete') {
      const existing = await findLinkedActivity();
      if (existing) {
        await base44.entities.Activity.delete(existing.id);
      }
    }

    return Response.json({ success: true, message: `Sleep activity ${event.type}d` });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});