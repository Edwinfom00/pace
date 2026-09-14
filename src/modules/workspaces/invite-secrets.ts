import { createHmac, randomBytes } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SHORT_CODE_LENGTH = 12;

export function createInvitationSecrets(): InvitationSecrets {
  return {
    token: randomBytes(32).toString("base64url"),
    shortCode: Array.from({ length: SHORT_CODE_LENGTH }, () => {
      return CODE_ALPHABET[randomBytes(1)[0] % CODE_ALPHABET.length];
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
