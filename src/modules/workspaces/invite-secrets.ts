import { createHmac, randomBytes } from "node:crypto";

import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from "./invite-code";

export function createInvitationSecrets(): InvitationSecrets {
  return {
    token: randomBytes(32).toString("base64url"),
    shortCode: Array.from({ length: INVITE_CODE_LENGTH }, () => {
      return INVITE_CODE_ALPHABET[randomBytes(1)[0] % INVITE_CODE_ALPHABET.length];
    }).join(""),
  };
}

export interface InvitationSecrets {
  token: string;
  shortCode: string;
}

export function hashInvitationSecret(
  pepper: string,
  purpose: "token" | "code",
  value: string,
): string {
  return createHmac("sha256", pepper).update(`${purpose}:${value}`).digest("hex");
}

export function formatInvitationCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}
