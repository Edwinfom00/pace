import { DatabasePaceUserProfileRepository } from "./repositories/pace-user-profile-repository";
import { yourPaceSchema, type PaceUserProfileRecord } from "./profile-domain";
import type { PaceUserProfileRepository } from "./repositories/pace-user-profile-repository";

export function getPaceUserProfileRepository(): DatabasePaceUserProfileRepository {
  return new DatabasePaceUserProfileRepository();
}

/**
 * Persists Step 1 only after a meaningful user action. This is deliberately
 * separate from the browser draft store, which never carries authorization.
 */
export async function persistYourPaceStep(
  userId: string,
  input: unknown,
  repository: PaceUserProfileRepository = getPaceUserProfileRepository(),
): Promise<PaceUserProfileRecord> {
  const validated = yourPaceSchema.parse(input);
  return repository.saveYourPaceStep(userId, validated);
}
