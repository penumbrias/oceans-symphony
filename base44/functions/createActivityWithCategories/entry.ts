import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { activity_category_ids, duration_minutes, fronting_alter_ids, notes, emotions, timestamp } = await req.json();

    // Fetch categories for names and colors
    const categories = await base44.entities.ActivityCategory.list();

    // Create ONE Activity per category — categories ARE the activities
    const created = await Promise.all(
      (activity_category_ids || []).map(async (catId) => {
        const cat = categories.find(c => c.id === catId);
        return base44.entities.Activity.create({
          timestamp: timestamp || new Date().toISOString(),
          activity_name: cat?.name || "Activity",
          activity_category_ids: [catId],
          color: cat?.color || null,
          duration_minutes,
          fronting_alter_ids: fronting_alter_ids || [],
          notes,
          emotions: emotions || [],
        });
      })
    );

    return Response.json(created);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});