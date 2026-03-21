import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { activity_name, activity_category_ids, duration_minutes, fronting_alter_ids, notes, emotions } = await req.json();

    const activity = await base44.entities.Activity.create({
      timestamp: new Date().toISOString(),
      activity_name,
      activity_category_ids: activity_category_ids || [],
      duration_minutes,
      fronting_alter_ids: fronting_alter_ids || [],
      notes,
      emotions: emotions || [],
    });

    return Response.json(activity);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});