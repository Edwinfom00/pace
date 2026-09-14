import { DatabasePaceUserProfileRepository } from "./repositories/pace-user-profile-repository";

export function getPaceUserProfileRepository(): DatabasePaceUserProfileRepository {
  return new DatabasePaceUserProfileRepository();
}
