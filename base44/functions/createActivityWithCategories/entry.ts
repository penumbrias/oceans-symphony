import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { activity_category_ids, duration_minutes, fronting_alter_ids, notes, emotions, timestamp } = await req.json();

    // Fetch categories to build activity name
    const categories = await base44.entities.ActivityCategory.list();
    const categoryNames = (activity_category_ids || [])
      .map(id => categories.find(c => c.id === id)?.name)
      .filter(Boolean);
    
    const activity_name = categoryNames.length > 0 ? categoryNames.join(" + ") : "Activity";

    // Use color from the first matching category (or passed color)
    const firstCategory = categories.find(c => (activity_category_ids || []).includes(c.id));
    const color = firstCategory?.color || null;

    const activity = await base44.entities.Activity.create({
      timestamp: timestamp || new Date().toISOString(),
      activity_name,
      activity_category_ids: activity_category_ids || [],
      color,
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