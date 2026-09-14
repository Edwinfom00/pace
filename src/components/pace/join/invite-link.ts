const JOIN_PATH_PATTERN = /^\/join\/([A-Za-z0-9_-]{43,128})$/;

export function extractPaceInviteToken(value: string, origin: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.origin !== origin) return null;

    return url.pathname.match(JOIN_PATH_PATTERN)?.[1] ?? null;
  } catch {
    return null;
  }
}
