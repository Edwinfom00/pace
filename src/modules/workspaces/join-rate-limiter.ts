import { RateLimitError } from "@/authorization/errors";

const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();


export function assertManualInviteLookupAllowed(userId: string, now = Date.now()): void {
  const existing = attempts.get(userId);
  const current = !existing || existing.resetAt <= now
    ? { count: 0, resetAt: now + WINDOW_MS }
    : existing;

  if (current.count >= MAX_ATTEMPTS) {
    throw new RateLimitError();
  }

  attempts.set(userId, { ...current, count: current.count + 1 });
}

export function resetManualInviteLookupLimiterForTests(): void {
  attempts.clear();
}
