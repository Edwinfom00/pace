import type { PacePageContext } from "./page-context";
import { paceAssistantResponseSchema } from "../types/pace-assistant";

/** Keeps lightweight screen context ephemeral and out of durable Eve history. */
export function createPaceAssistantTurnOptions(pageContext: PacePageContext, steer = false) {
  return {
    clientContext: { pacePageContext: pageContext },
    outputSchema: paceAssistantResponseSchema,
    ...(steer ? { turnPolicy: "steer" as const } : {}),
  };
}
