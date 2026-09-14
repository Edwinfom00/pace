import { DatabaseWorkspaceRepository } from "./repositories/workspace-repository";
import { WorkspaceService } from "./workspace-service";

function getInvitationPepper(): string {
  const pepper = process.env.INVITATION_TOKEN_PEPPER;

  if (!pepper) {
    throw new Error("INVITATION_TOKEN_PEPPER is required for invitation flows.");
  }

  return pepper;
}

export function getWorkspaceService(): WorkspaceService {
  return new WorkspaceService(new DatabaseWorkspaceRepository(), getInvitationPepper());
}
