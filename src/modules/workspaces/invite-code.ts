export const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;

export function normalizeInvitationCode(value: string): string {
  return value
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]/g, "")
    .replaceAll(/[IO01]/g, "")
    .slice(0, INVITE_CODE_LENGTH);
}

export function isInvitationCode(value: string): boolean {
  return new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`).test(value);
}
