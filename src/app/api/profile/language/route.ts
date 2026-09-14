import { jsonError, parseJson } from "@/app/api/_lib/http";
import { requireAuthenticatedActor } from "@/authorization/session";
import { setPersistedUserLanguage } from "@/i18n/server";
import { updatePreferredLanguageSchema } from "@/modules/agent-actions/validation";

export async function PATCH(request: Request): Promise<Response> {
  try {
    const [actor, input] = await Promise.all([
      requireAuthenticatedActor(),
      parseJson(request, updatePreferredLanguageSchema),
    ]);
    const language = await setPersistedUserLanguage(actor.userId, input.language);
    return Response.json({ language });
  } catch (error) {
    return jsonError(error);
  }
}
