export function formatOverviewActivityHeaderDate(
  instant: string,
  locale: string,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(instant));
}

export function formatOverviewActivityDate(
  instant: string,
  now: string,
  locale: string,
  timeZone: string,
  yesterdayLabel: string,
): string {
  const date = new Date(instant);
  const dayDistance = localDayNumber(now, timeZone) - localDayNumber(instant, timeZone);

  if (dayDistance === 0) {
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(date);
  }

  if (dayDistance === 1) return yesterdayLabel;

  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(date);
}

function localDayNumber(instant: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value;
  return Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day"))) / 86_400_000;
}
