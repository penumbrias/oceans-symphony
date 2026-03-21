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

    if (event.type === 'create') {
      // Create new activity for this sleep
      await base44.entities.Activity.create({
        timestamp: bedtime.toISOString(),
        activity_name: 'Sleep',
        activity_category_ids: [], // No categories needed for sleep
        color: '#3b82f6', // Blue color for sleep
        duration_minutes: durationMinutes,
        notes: `Sleep logged: ${bedtime.toLocaleTimeString()} - ${wakeTime.toLocaleTimeString()}`,
      });
    } else if (event.type === 'update') {
      // Find and update the existing sleep activity
      const sleepActivities = await base44.entities.Activity.filter({
        activity_name: 'Sleep',
      });

      // Find the activity that matches this sleep record's time
      const matchingActivity = sleepActivities.find(
        (a) => new Date(a.timestamp).getTime() === bedtime.getTime()
      );

      if (matchingActivity) {
        await base44.entities.Activity.update(matchingActivity.id, {
          duration_minutes: durationMinutes,
          notes: `Sleep logged: ${bedtime.toLocaleTimeString()} - ${wakeTime.toLocaleTimeString()}`,
        });
      }
    } else if (event.type === 'delete') {
      // Delete the corresponding activity
      const sleepActivities = await base44.entities.Activity.filter({
        activity_name: 'Sleep',
      });

      const matchingActivity = sleepActivities.find(
        (a) => new Date(a.timestamp).getTime() === bedtime.getTime()
      );

      if (matchingActivity) {
        await base44.entities.Activity.delete(matchingActivity.id);
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