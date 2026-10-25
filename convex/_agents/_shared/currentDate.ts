/**
 * Today's date for Studio prompts (#561). Without it, a model writing from a source treats the
 * source's "now" as current: deadlines that have passed read as upcoming, ended incentives as
 * available, and old figures as the latest.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The current date (UTC) and how to treat dated facts relative to it. */
export function currentDateInstruction(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  const long = `${MONTHS[now.getUTCMonth()]} ${now.getUTCDate()}, ${now.getUTCFullYear()}`;
  return `Today's date is ${long} (${iso}). Read dated facts in the sources relative to today:
- A deadline, offer, incentive, programme or event dated before today has passed. Describe it in the past tense, say it has ended or expired, and never advise acting on it.
- An event the sources call "upcoming" or "planned" may already have happened; say when it was scheduled rather than calling it upcoming.
- Give figures, prices and "latest" statistics with the date or period the source gives them, rather than presenting them as current.`;
}

/** Appends `currentDateInstruction` to a system prompt. */
export function withCurrentDate(systemPrompt: string, now?: Date): string {
  return `${systemPrompt}\n\n${currentDateInstruction(now)}`;
}
