import assert from "node:assert/strict";
import test from "node:test";

import {
  createInvitationSecrets,
  formatInvitationCode,
  hashInvitationSecret,
} from "@/modules/workspaces/invite-secrets";

test("invite token and short code are distinct high-entropy secrets", () => {
  const secrets = createInvitationSecrets();

  assert.equal(secrets.token.length >= 43, true);
  assert.match(secrets.shortCode, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.match(formatInvitationCode(secrets.shortCode), /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});

test("stored invitation digests are purpose-bound and never equal the credential", () => {
  const token = "sample-token";
  const tokenHash = hashInvitationSecret("test-pepper", "token", token);
  const codeHash = hashInvitationSecret("test-pepper", "code", token);

  assert.notEqual(tokenHash, token);
  assert.notEqual(tokenHash, codeHash);
  assert.equal(tokenHash, hashInvitationSecret("test-pepper", "token", token));
});
