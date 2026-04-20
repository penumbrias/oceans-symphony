import { format } from 'date-fns';

/**
 * Detects user's timezone from the browser.
 * Returns IANA timezone string (e.g. "America/Los_Angeles")
 */
export function detectTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Converts a local date string (YYYY-MM-DD) + time string (HH:MM)
 * to a UTC Date using the user's timezone.
 * Uses Intl API to convert local → UTC.
 */
export function zonedFireInstant(dateStr, hhmm, tz) {
  // Parse date and time
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mm] = hhmm.split(':').map(Number);
  
  // Create a local date in the target timezone
  // Strategy: create a date, format it in the target tz, see the offset, adjust
  const testDate = new Date(y, m - 1, d, h, mm, 0, 0);
  
  // Get the UTC offset for this timezone on this date
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(testDate);
  const tzDate = {};
  parts.forEach(p => { if (p.type !== 'literal') tzDate[p.type] = p.value; });
  
  // Calculate offset: what local time does UTC testDate represent in tz?
  const tzTime = new Date(
    parseInt(tzDate.year),
    parseInt(tzDate.month) - 1,
    parseInt(tzDate.day),
    parseInt(tzDate.hour),
    parseInt(tzDate.minute),
    parseInt(tzDate.second)
  ).getTime();
  
  const offset = testDate.getTime() - tzTime;
  
  // Now construct the actual UTC time: local time - offset = UTC
  return new Date(testDate.getTime() - offset);
}

/**
 * Gets the user's local date in YYYY-MM-DD format given a UTC now.
 * Used to determine "what's today for this user"
 */
export function getUserLocalDate(nowUtc, tz) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const parts = formatter.formatToParts(nowUtc);
  let year = '', month = '', day = '';
  parts.forEach(p => {
    if (p.type === 'year') year = p.value;
    if (p.type === 'month') month = p.value;
    if (p.type === 'day') day = p.value;
  });
  
  return `${year}-${month}-${day}`;
}

/**
 * Gets current minutes into the day (0-1439) in user's local timezone.
 * Used for quiet hours and interval active_window checks.
 */
export function getCurrentMinutesInZone(nowUtc, tz) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(nowUtc);
  let hour = 0, minute = 0;
  parts.forEach(p => {
    if (p.type === 'hour') hour = parseInt(p.value);
    if (p.type === 'minute') minute = parseInt(p.value);
  });
  
  return hour * 60 + minute;
}

/**
 * Common IANA timezones, grouped by region for UI display.
 */
export const TIMEZONE_GROUPS = {
  'North America': [
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
  ],
  'South America': [
    'America/Buenos_Aires',
    'America/Sao_Paulo',
  ],
  'Europe': [
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Moscow',
  ],
  'Africa': [
    'Africa/Cairo',
    'Africa/Johannesburg',
    'Africa/Lagos',
  ],
  'Asia': [
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Bangkok',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Asia/Seoul',
  ],
  'Oceania': [
    'Australia/Sydney',
    'Pacific/Auckland',
  ],
  'UTC': [
    'UTC',
  ],
};

/**
 * Flattened list of all IANA timezones for fallback (sorted alphabetically).
 * This is a curated list of the most common ones; a full list would be much longer.
 */
export const ALL_TIMEZONES = [
  'UTC',
  'America/Anchorage',
  'America/Boise',
  'America/Buenos_Aires',
  'America/Chicago',
  'America/Chihuahua',
  'America/Dawson',
  'America/Denver',
  'America/Edmonton',
  'America/El_Salvador',
  'America/Godthab',
  'America/Guatemala',
  'America/Guayaquil',
  'America/Halifax',
  'America/Hermosillo',
  'America/Juneau',
  'America/La_Paz',
  'America/Lima',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/Miquelon',
  'America/Montevideo',
  'America/New_York',
  'America/Noronha',
  'America/Panama',
  'America/Phoenix',
  'America/Puerto_Rico',
  'America/Regina',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/St_Johns',
  'America/Toronto',
  'America/Vancouver',
  'America/Whitehorse',
  'America/Winnipeg',
  'America/Yellowknife',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Asia/Bangkok',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Hobart',
  'Australia/Melbourne',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Athens',
  'Europe/Belfast',
  'Europe/Belgrade',
  'Europe/Berlin',
  'Europe/Bratislava',
  'Europe/Brussels',
  'Europe/Bucharest',
  'Europe/Budapest',
  'Europe/Chisinau',
  'Europe/Copenhagen',
  'Europe/Dublin',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/Kaliningrad',
  'Europe/Kiev',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Malta',
  'Europe/Minsk',
  'Europe/Moscow',
  'Europe/Paris',
  'Europe/Prague',
  'Europe/Riga',
  'Europe/Rome',
  'Europe/Samara',
  'Europe/Simferopol',
  'Europe/Sofia',
  'Europe/Stockholm',
  'Europe/Tallinn',
  'Europe/Tirane',
  'Europe/Uzhgorod',
  'Europe/Vaduz',
  'Europe/Vienna',
  'Europe/Vilnius',
  'Europe/Volgograd',
  'Europe/Warsaw',
  'Europe/Zurich',
  'Pacific/Auckland',
  'Pacific/Chatham',
  'Pacific/Fiji',
  'Pacific/Galapagos',
  'Pacific/Honolulu',
  'Pacific/Kiritimati',
  'Pacific/Marquesas',
  'Pacific/Tongatapu',
].sort();