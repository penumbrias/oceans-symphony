import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const db = base44.asServiceRole.entities;

    const allSessions = await db.FrontingSession.list('-start_time', 20000);
    const legacy = allSessions.filter(s => s.primary_alter_id && !s.alter_id);
    const alreadyMigrated = allSessions.filter(s => s.alter_id);

    if (legacy.length === 0) {
      return Response.json({ success: true, message: 'No legacy sessions to migrate.', migrated: 0 });
    }

    let migratedCount = 0;
    let emotionCheckInsCreated = 0;
    const now = new Date().toISOString();

    // Step 1: End active legacy sessions
    const activeLegacy = legacy.filter(s => s.is_active);
    for (const s of activeLegacy) {
      await db.FrontingSession.update(s.id, { is_active: false, end_time: now });
      s.end_time = now;
      s.is_active = false;
      await delay(50);
    }

    // Step 2: Migrate notes to EmotionCheckIn
    for (const session of legacy) {
      if (!session.note) continue;

      let noteEntries = [];
      try {
        const parsed = JSON.parse(session.note);
        noteEntries = Array.isArray(parsed)
          ? parsed
          : [{ text: session.note, timestamp: session.start_time }];
      } catch {
        noteEntries = [{ text: session.note, timestamp: session.start_time }];
      }

      for (const entry of noteEntries) {
        if (!entry.text) continue;
        const noteTs = new Date(entry.timestamp || session.start_time).getTime();
        const fronterIds = new Set<string>();

        for (const s of legacy) {
          const sStart = new Date(s.start_time).getTime();
          const sEnd = s.end_time ? new Date(s.end_time).getTime() : Date.now();
          if (sStart <= noteTs && noteTs <= sEnd) {
            if (s.primary_alter_id) fronterIds.add(s.primary_alter_id);
            (s.co_fronter_ids || []).forEach((id: string) => fronterIds.add(id));
          }
        }

        await db.EmotionCheckIn.create({
          timestamp: entry.timestamp || session.start_time,
          emotions: [],
          fronting_alter_ids: [...fronterIds],
          note: entry.text,
        });
        emotionCheckInsCreated++;
        await delay(80);
      }
    }

    // Step 3: Migrate to individual records and delete legacy
    // Process in batches of 10 to avoid timeout
    const BATCH_SIZE = 10;
    for (let i = 0; i < legacy.length; i += BATCH_SIZE) {
      const batch = legacy.slice(i, i + BATCH_SIZE);

      for (const session of batch) {
        const allIds = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);

        for (const alterId of allIds) {
          const alreadyExists = alreadyMigrated.some(
            s => s.alter_id === alterId &&
                 s.start_time === session.start_time &&
                 s.end_time === session.end_time
          );
          if (alreadyExists) continue;

          await db.FrontingSession.create({
            alter_id: alterId,
            is_primary: alterId === session.primary_alter_id,
            start_time: session.start_time,
            end_time: session.end_time || null,
            is_active: false,
          });
          migratedCount++;
          await delay(80);
        }

        await db.FrontingSession.delete(session.id);
        await delay(80);
      }

      // Pause between batches
      if (i + BATCH_SIZE < legacy.length) {
        await delay(500);
      }
    }

    return Response.json({
      success: true,
      message: `Migration complete.`,
      legacy_sessions_processed: legacy.length,
      individual_records_created: migratedCount,
      emotion_check_ins_created: emotionCheckInsCreated,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});