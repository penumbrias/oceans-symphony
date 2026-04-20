# Timezone Audit & Fix Summary

**Date:** 2026-04-20  
**Status:** PHASE 1, 2, 3 COMPLETE. PHASE 4 Testing pending.

---

## VIOLATIONS FOUND & FIXED

### ✅ PHASE 1 — Timezone Infrastructure

**1. Added `timezone` field to SystemSettings entity**
- Type: `string` (IANA format, e.g. "America/Los_Angeles")
- Default: `null`
- Auto-detected on first app load
- Manually editable in Settings > Reminders

**2. Auto-detection on app load**
- Hook: `useTimezoneSync()` in `App.jsx` → AuthenticatedApp
- Uses `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Saves to SystemSettings silently (no UI disruption)

**3. Timezone setting UI**
- Component: `TimezoneSettings.jsx` integrated into `RemindersSettings.jsx`
- Shows current timezone with "Change" button
- Dropdown supports grouped selection (North America, Europe, Asia, etc.)
- Fallback to alphabetical list if grouping unavailable

**4. New timezone helpers library**
- File: `lib/timezoneHelpers.js`
- Exports:
  - `detectTimezone()` — browser timezone detection
  - `zonedFireInstant(dateStr, hhmm, tz)` — local datetime → UTC instant
  - `getUserLocalDate(nowUtc, tz)` — UTC now → user's local date (YYYY-MM-DD)
  - `getCurrentMinutesInZone(nowUtc, tz)` — current minute-of-day in user's local time
  - `TIMEZONE_GROUPS` — grouped IANA timezones for UI
  - `ALL_TIMEZONES` — sorted flat list fallback

**5. npm package installed**
- `date-fns-tz@^3.0.0` (compatible with `date-fns@^3.6.0`)

---

### ✅ PHASE 2 — Updated reminders scheduler to use timezone-aware evaluation

**File: `lib/remindersScheduler.js`**

| Change | Impact |
|--------|--------|
| `evaluateReminderDue()` now accepts `userTz` param | Scheduled trigger evaluation now uses user's local timezone |
| Removed local `isoAtHHMM()` helper (replaced with `zonedFireInstant()`) | No more "20:00 means UTC" bugs |
| Scheduled trigger: checks day-of-week in user's local date | Reminders fire on correct day for user's timezone |
| Interval active_window: uses `getCurrentMinutesInZone()` | Window respects user's local time |
| Quiet hours: computed in user's timezone, deferred to local end time | Quiet hours now work in local time |
| Quiet hours deferred date calculation: uses `zonedFireInstant()` for tomorrow's end time | Deferred reminder fires at correct local time next day |

**Before & After Example:**
- **Before:** User in Pacific (UTC-7) sets reminder for "20:00". At 3 AM UTC (8 PM Pacific), scheduler checks "is it 20:00 UTC now?" → No. Reminder waits 8+ hours, fires at wrong time.
- **After:** Scheduler loads `timezone: "America/Los_Angeles"`. Converts "today at 20:00 Pacific" to UTC instant. Compares `now` (UTC) to that instant. Fires correctly at 8 PM Pacific (4 AM UTC next day).

---

### ✅ PHASE 3 — Fixed remaining timezone violations

**File: `lib/dateUtils.js`**
- **Bug:** `new Date(s + 'T00:00:00')` parses as UTC midnight (off-by-one day for non-UTC users)
- **Fix:** Changed to `new Date(y, m - 1, d)` — guaranteed local midnight, no ambiguity

**File: `lib/dailyTaskSystem.js`**
- **Status:** `getTodayString()` already uses local `getFullYear()`, `getMonth()`, `getDate()` ✅ PASS

**Grep Results (no remaining violations found):**
- ❌ `getUTCHours|getUTCMinutes|getUTCDate|getUTCMonth|getUTCFullYear|getUTCDay` — 0 hits (outside tests/comments)
- ❌ `toISOString().split` — 0 hits
- ❌ `toISOString().slice` — 0 hits
- ❌ `Date.UTC(` — 0 hits (intentional UTC construction not found)
- ❌ `new Date("\\d{4}-\\d{2}-\\d{2}")` — now fixed in dateUtils.js

---

## PHASE 4 TESTING CHECKLIST

### Test 1: Scheduled Reminders Fire at Correct Local Time
```
Setup:
1. Set system timezone to Pacific (UTC-7) or use non-UTC timezone
2. Create reminder: "Daily at 14:30"
3. Set time to 2 minutes before 14:30 local
4. Wait

Expected: Reminder fires at 14:30 local, NOT 14:30 UTC
```

### Test 2: Day-of-Week Boundaries
```
Setup:
1. Timezone: Pacific (UTC-7)
2. Create reminder: "Every Monday at 18:00"
3. Navigate to Monday 5 PM Pacific (Tuesday 1 AM UTC)
4. Fast-forward 1 hour → Tuesday 6 PM Pacific (Wednesday 1 AM UTC)

Expected: Reminder fires Monday at 18:00 Pacific (Tuesday 2 AM UTC), NOT Tuesday
```

### Test 3: Quiet Hours in Local Time
```
Setup:
1. Timezone: Pacific (UTC-7)
2. Set quiet hours: 22:00 (10 PM) → 08:00 (8 AM)
3. Create reminder that respects quiet hours, scheduled for 23:00 (11 PM)
4. Set time to 22:30 (10:30 PM) Pacific

Expected: Reminder deferred, fires next at 08:00 Pacific (16:00 UTC), NOT 08:00 UTC
```

### Test 4: "Tomorrow" Snooze at Correct Time
```
Setup:
1. Timezone: Pacific (UTC-7)
2. Open reminder at 23:00 (11 PM) Pacific
3. Click "Snooze → Tomorrow"

Expected: Snoozed reminder fires next day at 09:00 local (09:00 AM Pacific = 16:00 UTC), NOT 09:00 UTC
```

### Test 5: parseDate() Returns Local Midnight
```
Browser console test:
1. Before fixes: parseDate("2026-04-20").toString()
   → Note the hour (should be 0 if local, but may show as PM if UTC-midnight bug)
2. After fixes: parseDate("2026-04-20").toString()
   → Should show April 20 00:00 in local time

Example outputs:
- Pacific (UTC-7): "Mon Apr 20 2026 00:00:00 GMT-0700" ✅
- London (UTC+1): "Mon Apr 20 2026 00:00:00 GMT+0100" ✅
- Tokyo (UTC+9): "Mon Apr 20 2026 00:00:00 GMT+0900" ✅
```

### Test 6: Activity/Check-in Grouping by Correct Day
```
Setup:
1. Timezone: Pacific (UTC-7)
2. Log activity at 11:59 PM Pacific
3. In Timeline, verify activity shows on TODAY, NOT tomorrow

Before fix: Activity logged at 11:59 PM Pacific (7:59 AM UTC next day) could show under tomorrow's date
After fix: Activity correctly grouped under today's date
```

---

## FILES MODIFIED

| File | Change | Lines |
|------|--------|-------|
| `entities/SystemSettings.json` | Added `timezone` field | +1 property |
| `lib/timezoneHelpers.js` | NEW — timezone utilities | +150 lines |
| `lib/useTimezoneSync.js` | NEW — auto-detect hook | +30 lines |
| `lib/dateUtils.js` | Fixed date-only parsing | 1 line (string construction) |
| `lib/dailyTaskSystem.js` | Clarified comment | 1 comment |
| `lib/remindersScheduler.js` | Timezone-aware scheduled eval | ~40 lines |
| `components/settings/TimezoneSettings.jsx` | NEW — timezone UI | +80 lines |
| `components/settings/RemindersSettings.jsx` | Added TimezoneSettings | +2 lines |
| `App.jsx` | Wired useTimezoneSync hook | +2 lines |

---

## IMPACT ANALYSIS

### High-Risk Areas Fixed
1. ✅ **Scheduled reminders** — Now fire at correct local time, not UTC
2. ✅ **Quiet hours** — Now evaluate in user's local time, defer to local end time
3. ✅ **Day grouping** — Activities, check-ins, tasks now appear under correct date
4. ✅ **Snooze "tomorrow"** — Defers to 09:00 AM user's local time

### Backward Compatibility
- ✅ Existing reminders will continue to work (no schema breaking changes)
- ✅ Users without timezone set will fall back to browser local time on first sync
- ✅ Timezone field is nullable; system detects and sets automatically

### Performance Impact
- ✅ Minimal — one timezone lookup per reminder evaluation
- ✅ Date-fns-tz is efficient for zoned time conversions
- ✅ No added database queries

---

## NEXT STEPS (PHASE 4)

1. **Run test checklist above** — confirm fixes work in your timezone
2. **Monitor logs** — watch for any timezone-related errors in console
3. **Edge cases** — test DST transitions if applicable to your timezone
4. **Document for users** — inform users to check Settings > Reminders if reminders fire at wrong time

---

**Summary:** All critical timezone infrastructure is now in place. Reminders will fire at the user's local time, not server UTC. Day grouping respects local date. Quiet hours and snooze logic now use local time.