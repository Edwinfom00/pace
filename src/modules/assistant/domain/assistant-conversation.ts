import type { EveDynamicToolPart, EveMessage } from "eve/react";

import {
  paceAssistantResponseSchema,
  type PaceAssistantBlock,
} from "@/modules/pace-assistant/types/pace-assistant";

export type AssistantActionRef = {
  readonly actionId: string;
  readonly approvalRequestId: string | null;
  readonly revision: string;
};

export type AssistantTurn =
  | { readonly id: string; readonly role: "user"; readonly text: string }
  | {
      readonly id: string;
      readonly role: "assistant";
      readonly text: string | null;
      readonly blocks: readonly PaceAssistantBlock[];
      readonly state: "working" | "complete" | "malformed";
      readonly actions: readonly AssistantActionRef[];
    };

export function toAssistantTurns(
  messages: readonly EveMessage[],
): readonly AssistantTurn[] {
  const actions = collectAssistantActions(messages);
  const knownActionIds = new Set(actions.keys());
  const claimed = new Set<string>();

  return messages.map((message): AssistantTurn => {
    const text = messageText(message);
    if (message.role === "user") return { id: message.id, role: "user", text };

    const ownActions: AssistantActionRef[] = [];
    for (const part of message.parts) {
      if (part.type !== "dynamic-tool") continue;
      const actionId = actionIdFromPart(part);
      if (!actionId || claimed.has(actionId)) continue;
      claimed.add(actionId);
      ownActions.push(actions.get(actionId)!);
    }

    const structured =
      parseBlocks(message.metadata?.result) ?? parseBlocks(text);
    const looksStructured = isStructuredPayloadText(text);
    const streaming = message.metadata?.status === "streaming";
    const blocks = (structured ?? []).filter((block) => {
      if (block.type === "action-proposal" || block.type === "approval")
        return !knownActionIds.has(block.actionId);
      if (block.type === "action-result") return ownActions.length === 0;
      return true;
    });
    const plainText =
      !structured && !looksStructured && text.trim() ? text : null;
    const hasContent =
      blocks.length > 0 || plainText !== null || ownActions.length > 0;
    const state = structured
      ? "complete"
      : looksStructured
        ? streaming
          ? "working"
          : "malformed"
        : !hasContent && streaming
          ? "working"
          : "complete";

    return {
      id: message.id,
      role: "assistant",
      text: plainText,
      blocks,
      state,
      actions: ownActions,
    };
  });
}

export function collectAssistantActions(
  messages: readonly EveMessage[],
): ReadonlyMap<string, AssistantActionRef> {
  const found = new Map<
    string,
    { approvalRequestId: string | null; states: string[] }
  >();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type !== "dynamic-tool") continue;
      const actionId = actionIdFromPart(part);
      if (!actionId) continue;
      const previous = found.get(actionId) ?? {
        approvalRequestId: null,
        states: [],
      };
      found.set(actionId, {
        approvalRequestId:
          part.state === "approval-requested"
            ? part.approval.id
            : previous.approvalRequestId,
        states: [...previous.states, part.state],
      });
    }
  }
  return new Map(
    [...found.entries()].map(([actionId, value]) => [
      actionId,
      {
        actionId,
        approvalRequestId: value.approvalRequestId,
        revision: value.states.join(","),
      },
    ]),
  );
}

function actionIdFromPart(part: EveDynamicToolPart): string | null {
  const candidate =
    part.state === "output-available"
      ? part.output
      : "input" in part
        ? part.input
        : undefined;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    return null;
  const record = candidate as Record<string, unknown>;
  if (typeof record.actionId === "string") return record.actionId;
  return typeof record.id === "string" && part.toolName.includes("draft")
    ? record.id
    : null;
}

function messageText(message: EveMessage): string {
  return message.parts
    .filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("");
}

function parseBlocks(value: unknown): readonly PaceAssistantBlock[] | null {
  const parsed = paceAssistantResponseSchema.safeParse(value);
  if (parsed.success) return parsed.data.blocks;
  if (typeof value !== "string") return null;
  try {
    const json = value
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const fromText = paceAssistantResponseSchema.safeParse(JSON.parse(json));
    return fromText.success ? fromText.data.blocks : null;
  } catch {
    return null;
  }
}

function isStructuredPayloadText(value: string): boolean {
  return /^(?:```(?:json)?\s*)?\{\s*"blocks"\s*:/.test(value.trim());
}
