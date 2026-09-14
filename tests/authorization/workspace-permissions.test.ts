import assert from "node:assert/strict";
import test from "node:test";

import { AuthorizationError } from "@/authorization/errors";
import {
  assertWorkspacePermission,
  canAssignInvitationRole,
  canPerformWorkspaceAction,
} from "@/authorization/workspace-permissions";

test("members may read but cannot administer a workspace", () => {
  assert.equal(canPerformWorkspaceAction("MEMBER", "read"), true);
  assert.equal(canPerformWorkspaceAction("MEMBER", "create_invitation"), false);
  assert.throws(
    () => assertWorkspacePermission("VIEWER", "update_preferences"),
    AuthorizationError,
  );
});

test("only owners can grant administrator access and no invite can grant owner", () => {
  assert.equal(canAssignInvitationRole("OWNER", "ADMIN"), true);
  assert.equal(canAssignInvitationRole("ADMIN", "ADMIN"), false);
  assert.equal(canAssignInvitationRole("OWNER", "OWNER"), false);
});
