import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all activities
    const activities = await base44.entities.Activity.list();

    // Group by date and category
    const grouped = {};
    activities.forEach((act) => {
      const dateStr = act.timestamp.split('T')[0];
      if (!grouped[dateStr]) grouped[dateStr] = {};

      // Use first category as key for grouping
      const catKey = act.activity_category_ids?.[0] || 'none';
      if (!grouped[dateStr][catKey]) grouped[dateStr][catKey] = [];
      grouped[dateStr][catKey].push(act);
    });

    let merged = 0;
    
    // Process each group for overlaps
    for (const [dateStr, catGroups] of Object.entries(grouped)) {
      for (const [catKey, acts] of Object.entries(catGroups)) {
        if (acts.length < 2) continue;

        // Sort by start time
        acts.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Merge overlapping
        for (let i = 0; i < acts.length - 1; i++) {
          const current = acts[i];
          const next = acts[i + 1];

          const currentEnd = new Date(current.timestamp).getTime() + (current.duration_minutes || 30) * 60000;
          const nextStart = new Date(next.timestamp).getTime();

          // Check if overlapping
          if (nextStart <= currentEnd) {
            // Merge next into current
            const newEnd = new Date(new Date(next.timestamp).getTime() + (next.duration_minutes || 30) * 60000);
            const newDuration = Math.round((newEnd - new Date(current.timestamp)) / 60000);

            // Combine alters and emotions
            const allAlters = [...new Set([
              ...(current.fronting_alter_ids || []),
              ...(next.fronting_alter_ids || [])
            ])];
            const allEmotions = [...new Set([
              ...(current.emotions || []),
              ...(next.emotions || [])
            ])];

            // Update current
            await base44.entities.Activity.update(current.id, {
              duration_minutes: newDuration,
              fronting_alter_ids: allAlters,
              emotions: allEmotions,
            });

            // Delete next
            await base44.entities.Activity.delete(next.id);

            merged++;
            acts.splice(i + 1, 1);
            i--;
          }
        }
      }
    }

    return Response.json({ merged });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});