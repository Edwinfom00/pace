const MAX_SLUG_LENGTH = 48;

export function sanitizeReportSlug(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

export function financialReportFileName(
  periodKey: string,
  workspaceSlug?: string | null,
): string {
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)
    ? periodKey
    : "report";
  const slug = sanitizeReportSlug(workspaceSlug);
  const prefix =
    slug && slug !== "pace" ? `pace-${slug.replace(/^pace-/, "")}` : "pace";
  return `${prefix}-financial-report-${period}.pdf`;
}
