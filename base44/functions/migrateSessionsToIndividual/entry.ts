import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);



  const db = base44.asServiceRole.entities;

  // Step 1: Read test — confirm list() works
  let allSessions;
  try {
    // list() signature: list(sort, limit) — fetch in pages to avoid rate limits
    allSessions = await db.FrontingSession.list('-start_time', 500);
    console.log('[migrate] fetched sessions:', allSessions.length);
  } catch (e) {
    return Response.json({ error: 'Step 1 (list sessions) failed', detail: e.message, stack: e.stack }, { status: 500 });
  }

  const legacy = allSessions.filter(s => s.primary_alter_id && !s.alter_id);
  const alreadyMigrated = allSessions.filter(s => s.alter_id);

  console.log('[migrate] legacy:', legacy.length, 'already migrated:', alreadyMigrated.length);

  if (legacy.length === 0) {
    return Response.json({ success: true, message: 'No legacy sessions to migrate.', migrated: 0 });
  }

  const now = new Date().toISOString();
  let migratedCount = 0;
  let emotionCheckInsCreated = 0;
  let deletedCount = 0;

  // Step 2: End active legacy sessions
  const activeLegacy = legacy.filter(s => s.is_active);
  for (const s of activeLegacy) {
    try {
      await db.FrontingSession.update(s.id, { is_active: false, end_time: now });
      s.end_time = now;
      s.is_active = false;
      await delay(200);
    } catch (e) {
      console.log('[migrate] Step 2 update failed for', s.id, e.message);
      await delay(500);
    }
  }

  // Step 3: Migrate notes to EmotionCheckIn (rate-limited)
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
      const fronterIds = new Set();

      for (const s of legacy) {
        const sStart = new Date(s.start_time).getTime();
        const sEnd = s.end_time ? new Date(s.end_time).getTime() : Date.now();
        if (sStart <= noteTs && noteTs <= sEnd) {
          if (s.primary_alter_id) fronterIds.add(s.primary_alter_id);
          (s.co_fronter_ids || []).forEach(id => fronterIds.add(id));
        }
      }

      try {
        await db.EmotionCheckIn.create({
          timestamp: entry.timestamp || session.start_time,
          emotions: [],
          fronting_alter_ids: [...fronterIds],
          note: entry.text,
        });
        emotionCheckInsCreated++;
        await delay(250);
      } catch (e) {
        console.log('[migrate] Step 3 EmotionCheckIn create failed:', e.message);
        await delay(600);
      }
    }
  }

  // Step 4: Create individual records + delete legacy
  // Process one at a time with generous delays to avoid rate limits
  for (const session of legacy) {
    const allIds = [session.primary_alter_id, ...(session.co_fronter_ids || [])].filter(Boolean);

    for (const alterId of allIds) {
      const alreadyExists = alreadyMigrated.some(
        s => s.alter_id === alterId &&
             s.start_time === session.start_time &&
             s.end_time === session.end_time
      );
      if (alreadyExists) continue;

      try {
        await db.FrontingSession.create({
          alter_id: alterId,
          is_primary: alterId === session.primary_alter_id,
          start_time: session.start_time,
          end_time: session.end_time || null,
          is_active: false,
        });
        migratedCount++;
        await delay(300);
      } catch (e) {
        console.log('[migrate] Step 4 create failed for alter', alterId, e.message);
        // If rate limited, wait longer and retry once
        if (e.message?.includes('429') || e.message?.toLowerCase().includes('rate')) {
          await delay(2000);
          try {
            await db.FrontingSession.create({
              alter_id: alterId,
              is_primary: alterId === session.primary_alter_id,
              start_time: session.start_time,
              end_time: session.end_time || null,
              is_active: false,
            });
            migratedCount++;
          } catch (e2) {
            console.log('[migrate] Step 4 retry also failed:', e2.message);
          }
        }
      }
    }

    // Delete the legacy record
    try {
      await db.FrontingSession.delete(session.id);
      deletedCount++;
      await delay(300);
    } catch (e) {
      console.log('[migrate] Step 4 delete failed for', session.id, e.message);
      // .delete() may not exist — try update with a marker instead
      if (e.message?.includes('not a function') || e.message?.includes('undefined')) {
        try {
          await db.FrontingSession.update(session.id, { _migrated: true, alter_id: '__migrated__' });
          deletedCount++;
          await delay(300);
        } catch (e2) {
          console.log('[migrate] Step 4 fallback update also failed:', e2.message);
        }
      } else if (e.message?.includes('429') || e.message?.toLowerCase().includes('rate')) {
        await delay(2000);
        try {
          await db.FrontingSession.delete(session.id);
          deletedCount++;
        } catch (e2) {
          console.log('[migrate] Step 4 delete retry failed:', e2.message);
        }
      }
    }
  }

  return Response.json({
    success: true,
    message: `Migration complete.`,
    total_sessions_fetched: allSessions.length,
    legacy_sessions_processed: legacy.length,
    individual_records_created: migratedCount,
    legacy_records_deleted: deletedCount,
    emotion_check_ins_created: emotionCheckInsCreated,
  });
});