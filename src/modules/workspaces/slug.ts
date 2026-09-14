const MAX_SLUG_LENGTH = 140;
const RANDOM_SUFFIX_LENGTH = 12;

/**
 * Produces a URL-safe slug once, at workspace creation. The persisted value is
 * deliberately not recalculated when the workspace display name changes.
 */
export function createWorkspaceSlug(name: string, workspaceId: string): string {
  const suffix = workspaceId.replaceAll("-", "").toLowerCase().slice(-RANDOM_SUFFIX_LENGTH);
  const normalizedName = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = normalizedName || "workspace";
  const maxBaseLength = MAX_SLUG_LENGTH - suffix.length - 1;

  return `${base.slice(0, maxBaseLength).replace(/-+$/g, "") || "workspace"}-${suffix}`;
}

export function isWorkspaceSlugConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const databaseError = error as { code?: unknown; constraint?: unknown; message?: unknown };
  return (
    databaseError.code === "23505" &&
    (databaseError.constraint === "workspace_slug_unique" ||
      (typeof databaseError.message === "string" &&
        databaseError.message.includes("workspace_slug_unique")))
  );
}
