export interface Period {
  readonly start: Date;
  readonly end: Date;
}

export interface LocalDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface LocalTime {
  readonly hour: number;
  readonly minute: number;
}

/** Returns a half-open calendar-month period in the supplied IANA time zone. */
export function calendarMonthPeriod(
  instant: Date,
  timeZone: string,
  monthOffset = 0,
): Period {
  const local = localDateForInstant(instant, timeZone);
  const shifted = new Date(Date.UTC(local.year, local.month - 1 + monthOffset, 1));
  const next = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1));
  return periodForLocalDates(
    formatLocalDate({
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: 1,
    }),
    formatLocalDate({
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: 1,
    }),
    timeZone,
  );
}

export function createPeriod(start: Date, end: Date): Period {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new Error("A period must have valid start and end instants with start before end.");
  }
  return { start: new Date(start), end: new Date(end) };
}

/** Creates a half-open period from local calendar-date boundaries in an IANA time zone. */
export function periodForLocalDates(
  startInclusive: string,
  endExclusive: string,
  timeZone: string,
): Period {
  const start = parseLocalDate(startInclusive);
  const end = parseLocalDate(endExclusive);
  if (compareLocalDates(start, end) >= 0) {
    throw new Error("The end local date must be after the start local date.");
  }
  return createPeriod(
    zonedMidnightToInstant(start, timeZone),
    zonedMidnightToInstant(end, timeZone),
  );
}

export function localDateForInstant(instant: Date, timeZone: string): LocalDate {
  assertValidTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  return {
    year: Number(part(parts, "year")),
    month: Number(part(parts, "month")),
    day: Number(part(parts, "day")),
  };
}

/**
 * Resolves a wall-clock date and time in an IANA time zone to one UTC instant.
 * Repeated times during a backward daylight-saving transition resolve to their
 * earlier occurrence; skipped local times are rejected instead of adjusted.
 */
export function zonedLocalDateTimeToInstant(date: LocalDate, time: LocalTime, timeZone: string): Date {
  if (time.hour < 0 || time.hour > 23 || time.minute < 0 || time.minute > 59) {
    throw new Error("Invalid local time.");
  }

  assertValidTimeZone(timeZone);
  const requestedUtc = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute);
  let instant = requestedUtc;

  // Time-zone offsets can change between the initial estimate and the resolved
  // instant. The initial UTC wall-clock estimate resolves repeated times to
  // their earlier occurrence, which is our deterministic DST policy.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    instant = requestedUtc - offsetMilliseconds(new Date(instant), timeZone);
  }

  const resolved = new Date(instant);
  const resolvedDate = localDateForInstant(resolved, timeZone);
  const resolvedTime = localTimeForInstant(resolved, timeZone);
  if (compareLocalDates(resolvedDate, date) !== 0 || resolvedTime.hour !== time.hour || resolvedTime.minute !== time.minute) {
    throw new Error(`The local time does not exist in ${timeZone}.`);
  }
  return resolved;
}

export function localDateKey(date: LocalDate): string {
  return `${date.year.toString().padStart(4, "0")}-${date.month.toString().padStart(2, "0")}-${date.day
    .toString()
    .padStart(2, "0")}`;
}

function formatLocalDate(date: LocalDate): string {
  return localDateKey(date);
}

export function countCalendarDays(start: Date, end: Date, timeZone: string): number {
  const period = createPeriod(start, end);
  const first = localDateForInstant(period.start, timeZone);
  const last = localDateForInstant(new Date(period.end.getTime() - 1), timeZone);
  return calendarDayDistance(first, last) + 1;
}

function parseLocalDate(value: string): LocalDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Local dates must use YYYY-MM-DD.");

  const date: LocalDate = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (
    utc.getUTCFullYear() !== date.year ||
    utc.getUTCMonth() !== date.month - 1 ||
    utc.getUTCDate() !== date.day
  ) {
    throw new Error(`Invalid local date: ${value}.`);
  }
  return date;
}

function zonedMidnightToInstant(date: LocalDate, timeZone: string): Date {
  return zonedLocalDateTimeToInstant(date, { hour: 0, minute: 0 }, timeZone);
}

function localTimeForInstant(instant: Date, timeZone: string): LocalTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  return { hour: Number(part(parts, "hour")), minute: Number(part(parts, "minute")) };
}

function offsetMilliseconds(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const wallClockUtc = Date.UTC(
    Number(part(parts, "year")),
    Number(part(parts, "month")) - 1,
    Number(part(parts, "day")),
    Number(part(parts, "hour")),
    Number(part(parts, "minute")),
    Number(part(parts, "second")),
  );
  return wallClockUtc - instant.getTime();
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const value = parts.find((candidate) => candidate.type === type)?.value;
  if (!value) throw new Error(`Unable to read ${type} from time-zone formatter.`);
  return value;
}

function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format();
  } catch {
    throw new Error(`Invalid IANA time zone: ${timeZone}.`);
  }
}

function compareLocalDates(left: LocalDate, right: LocalDate): number {
  return calendarDayNumber(left) - calendarDayNumber(right);
}

function calendarDayDistance(left: LocalDate, right: LocalDate): number {
  return calendarDayNumber(right) - calendarDayNumber(left);
}

function calendarDayNumber(value: LocalDate): number {
  return Math.floor(Date.UTC(value.year, value.month - 1, value.day) / 86_400_000);
}
