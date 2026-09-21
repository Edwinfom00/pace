import { randomUUID } from "node:crypto";

import type { AuthenticatedActor } from "@/authorization/session";
import type { LedgerAccountType } from "@/modules/ledger/domain";
import { LedgerService } from "@/modules/ledger/ledger-service";

export async function createAccountWithOpeningBalance(
  service: LedgerService,
  actor: AuthenticatedActor,
  workspaceId: string,
  input: {
    readonly name: string;
    readonly type: LedgerAccountType;
    readonly currency: string;
    readonly openingBalanceMinor?: bigint | string;
  },
) {
  const account = await service.createAccount(actor, workspaceId, {
    name: input.name,
    type: input.type,
    currency: input.currency,
  });
  const amountMinor = input.openingBalanceMinor === undefined
    ? 0n
    : BigInt(input.openingBalanceMinor);
  if (amountMinor !== 0n) {
    await service.setOpeningBalance(actor, {
      workspaceId,
      accountId: account.id,
      amountMinor,
      currency: input.currency,
      effectiveAt: new Date("2020-01-01T00:00:00.000Z"),
      idempotencyKey: randomUUID(),
    });
  }
  return account;
}
