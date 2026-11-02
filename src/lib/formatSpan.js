// Human wording for a length of time, longest unit first:
//   30 days or more → "10 years, 2 months, 5 days" (zero parts left out)
//   1–29 days       → "5 days"
//   under a day     → "3 hours" (+ "30 minutes" if any) / "45 minutes" / "20 seconds"
// A year counts as 365 days and a month as 365/12, so a year
// never reads as "12 months".
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const MONTH_DAYS = 365 / 12; // 12 months to a year, so months never reach 12
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function formatSpan(ms) {
  const t = Math.max(0, Math.abs(Number(ms) || 0));
  if (t < MIN) return plural(Math.floor(t / 1000), "second");
  if (t < HOUR) return plural(Math.floor(t / MIN), "minute");
  if (t < DAY) {
    const h = Math.floor(t / HOUR);
    const m = Math.floor((t % HOUR) / MIN);
    return m ? `${plural(h, "hour")}, ${plural(m, "minute")}` : plural(h, "hour");
  }
  const days = Math.floor(t / DAY);
  if (days < 30) return plural(days, "day");
  const years = Math.floor(days / 365);
  const rem = days - years * 365;
  const months = Math.floor(rem / MONTH_DAYS);
  const d = rem - Math.round(months * MONTH_DAYS);
  return [
    years ? plural(years, "year") : "",
    months ? plural(months, "month") : "",
    d ? plural(d, "day") : "",
  ].filter(Boolean).join(", ");
}

export const formatSpanMinutes = (minutes) => formatSpan((Number(minutes) || 0) * MIN);
