import type { AuthenticatedActor } from "@/authorization/session";

import { getAssistantSnapshot } from "../../queries/get-assistant-snapshot";
import type { AssistantMessages } from "../assistant-messages";
import { AssistantFinancialSnapshot } from "../components/assistant-financial-snapshot";

export async function AssistantSnapshotSection({
  actor,
  workspaceId,
  workspaceSlug,
  currency,
  locale,
  timeZone,
  messages,
}: {
  readonly actor: AuthenticatedActor;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
  readonly currency: string;
  readonly locale: string;
  readonly timeZone: string;
  readonly messages: AssistantMessages;
}) {
  const snapshot = await getAssistantSnapshot({
    actor,
    workspaceId,
    currency,
    locale,
    timeZone,
  }).catch(() => null);
  if (!snapshot) return null;

  return (
    <AssistantFinancialSnapshot
      messages={messages}
      snapshot={snapshot}
      workspaceSlug={workspaceSlug}
    />
  );
}
