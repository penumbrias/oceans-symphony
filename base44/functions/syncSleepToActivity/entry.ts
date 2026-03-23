import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

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

    // Check if an activity already exists for this sleep record
    const existingActivities = await base44.entities.Activity.list();
    const sleepActivity = existingActivities.find(
      (a) => a.id === `sleep_${data.id}`
    );

    // Tag notes with sleep record id for reliable matching on update/delete
    const sleepTag = `[sleep_id:${data.id}]`;
    const notesStr = `Sleep: ${bedtime.toLocaleString()} - ${wakeTime.toLocaleString()} ${sleepTag}`;

    const findSleepActivity = async () => {
      const all = await base44.asServiceRole.entities.Activity.filter({ activity_name: 'Sleep' });
      return all.find(a => (a.notes || '').includes(sleepTag));
    };

    if (event.type === 'create') {
      await base44.asServiceRole.entities.Activity.create({
        timestamp: bedtime.toISOString(),
        activity_name: 'Sleep',
        activity_category_ids: [],
        color: '#6366f1',
        duration_minutes: durationMinutes,
        notes: notesStr,
      });
    } else if (event.type === 'update') {
      const existing = await findSleepActivity();
      if (existing) {
        await base44.asServiceRole.entities.Activity.update(existing.id, {
          timestamp: bedtime.toISOString(),
          duration_minutes: durationMinutes,
          notes: notesStr,
        });
      } else {
        // Fallback: create if missing
        await base44.asServiceRole.entities.Activity.create({
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
        await base44.asServiceRole.entities.Activity.delete(existing.id);
      }
    }

    return Response.json({
      success: true,
      message: `Sleep activity ${event.type}d successfully`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});