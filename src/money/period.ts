export interface Period {
  readonly start: Date;
  readonly end: Date;
}

export interface LocalDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
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

export function localDateKey(date: LocalDate): string {
  return `${date.year.toString().padStart(4, "0")}-${date.month.toString().padStart(2, "0")}-${date.day
    .toString()
    .padStart(2, "0")}`;
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
  assertValidTimeZone(timeZone);
  const requestedUtc = Date.UTC(date.year, date.month - 1, date.day);
  let instant = requestedUtc;

  // Time-zone offsets can change between the initial estimate and the resolved
  // instant. Two passes covers ordinary and daylight-saving transitions.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    instant = requestedUtc - offsetMilliseconds(new Date(instant), timeZone);
  }

  const resolved = new Date(instant);
  const resolvedDate = localDateForInstant(resolved, timeZone);
  if (compareLocalDates(resolvedDate, date) !== 0) {
    throw new Error(`The local date ${localDateKey(date)} does not exist in ${timeZone}.`);
  }
  return resolved;
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
