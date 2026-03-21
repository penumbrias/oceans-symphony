import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const defaultCategories = [
      { name: 'Work', color: '#3b82f6', parent: null },
      { name: 'Recreation', color: '#8b5cf6', parent: null },
      { name: 'Sleep', color: '#06b6d4', parent: null },
      { name: 'Exercise', color: '#10b981', parent: null },
      { name: 'Eating', color: '#f59e0b', parent: null },
      { name: 'Social', color: '#ec4899', parent: null },
      { name: 'Self Care', color: '#6366f1', parent: null },
      { name: 'Learning', color: '#14b8a6', parent: null },
    ];

    const subCategories = [
      { name: 'Coding', parent: 'Work' },
      { name: 'Meetings', parent: 'Work' },
      { name: 'Admin', parent: 'Work' },
      
      { name: 'Gaming', parent: 'Recreation' },
      { name: 'Reading', parent: 'Recreation' },
      { name: 'Watching TV', parent: 'Recreation' },
      { name: 'Crafts', parent: 'Recreation' },
      { name: 'Drawing', parent: 'Recreation' },
      { name: 'Music', parent: 'Recreation' },
      
      { name: 'Walking', parent: 'Exercise' },
      { name: 'Running', parent: 'Exercise' },
      { name: 'Gym', parent: 'Exercise' },
      { name: 'Yoga', parent: 'Exercise' },
      { name: 'Stretching', parent: 'Exercise' },
      
      { name: 'Breakfast', parent: 'Eating' },
      { name: 'Lunch', parent: 'Eating' },
      { name: 'Dinner', parent: 'Eating' },
      { name: 'Snacking', parent: 'Eating' },
      
      { name: 'Friends', parent: 'Social' },
      { name: 'Family', parent: 'Social' },
      { name: 'Chat', parent: 'Social' },
      
      { name: 'Shower', parent: 'Self Care' },
      { name: 'Meditation', parent: 'Self Care' },
      { name: 'Grooming', parent: 'Self Care' },
      
      { name: 'Course', parent: 'Learning' },
      { name: 'Tutorial', parent: 'Learning' },
      { name: 'Research', parent: 'Learning' },
    ];

    // Create main categories
    const createdCategories = {};
    for (const cat of defaultCategories) {
      const existing = await base44.entities.ActivityCategory.filter({ name: cat.name });
      if (existing.length === 0) {
        const created = await base44.entities.ActivityCategory.create({
          name: cat.name,
          color: cat.color,
          parent_category_id: null,
          order: 0
        });
        createdCategories[cat.name] = created.id;
      } else {
        createdCategories[cat.name] = existing[0].id;
      }
    }

    // Create sub-categories
    for (const subCat of subCategories) {
      const existing = await base44.entities.ActivityCategory.filter({ name: subCat.name });
      if (existing.length === 0) {
        await base44.entities.ActivityCategory.create({
          name: subCat.name,
          color: '#9ca3af',
          parent_category_id: createdCategories[subCat.parent],
          order: 0
        });
      }
    }

    // Migrate existing activities - create custom categories from activity names
    const activities = await base44.entities.Activity.list();
    const activityNames = [...new Set(activities.map(a => a.activity_name))];
    
    for (const name of activityNames) {
      const existing = await base44.entities.ActivityCategory.filter({ name });
      if (existing.length === 0) {
        await base44.entities.ActivityCategory.create({
          name,
          color: '#a78bfa',
          parent_category_id: null,
          order: 1
        });
      }
    }

    return Response.json({ success: true, message: 'Activities initialized' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});