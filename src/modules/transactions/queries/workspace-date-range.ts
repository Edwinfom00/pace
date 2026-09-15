
export function startOfWorkspaceDay(date: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const naiveUtc = Date.UTC(year, (month ?? 1) - 1, day ?? 1);
  const safeTimeZone = supportsTimeZone(timeZone) ? timeZone : "UTC";
  const firstPass = naiveUtc - offsetAt(new Date(naiveUtc), safeTimeZone);
  const corrected = naiveUtc - offsetAt(new Date(firstPass), safeTimeZone);
  return new Date(corrected);
}

function offsetAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    calendar: "gregory",
    hourCycle: "h23",
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  );
  return Date.UTC(values.year!, values.month! - 1, values.day!, values.hour!, values.minute!, values.second!) - instant.getTime();
}

function supportsTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
