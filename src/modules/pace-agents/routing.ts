import type { PaceRoute, PaceRoutePlan, PaceSubAgentDefinition, PaceSubAgentId } from "./domain";
import type { PaceSubAgentRegistry } from "./registry";

const WRITE_SIGNALS = [
  "add", "record", "log", "create", "set", "change", "update", "edit", "pause", "archive", "unarchive", "restore", "rename",
  "transfer", "move", "correct", "fix", "was actually", "resume", "unpause", "ignore", "confirm",
  "categorize*", "categorise*", "accept", "resolve",
  "i spent", "i paid", "i bought", "i received", "i earned",
  "ajoute*", "enregistre*", "cree*", "creer", "modifie*", "change*", "definis", "mets",
  "suspend*", "reprendre", "reprends", "ignore*", "confirme*", "accepte*", "resoudre", "resous",
  "j ai depense", "j ai paye", "j ai achete", "j ai recu",
  "hinzufug*", "fuge", "erstell*", "ander*", "buche*", "setze", "pausier*", "fortsetz*", "ignorier*", "bestatig*",
  "kategorisier*", "akzeptier*",
  "ich habe",
] as const;

const PAGE_SUB_AGENTS: Readonly<Record<string, PaceSubAgentId>> = {
  overview: "insights",
  transactions: "transactions",
  accounts: "accounts",
  recurring: "recurring",
  inbox: "inbox",
  plans: "plans",
  insights: "insights",
};

export function subAgentForPage(page: string | null | undefined): PaceSubAgentId | null {
  return page ? (PAGE_SUB_AGENTS[page] ?? null) : null;
}

export function normalizeRequestTokens(text: string): readonly string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Routing is a pure function of the request text and the registry: no model
 * call, no clock, no randomness. The same request always yields the same plan.
 */
export function routePaceRequest(
  registry: PaceSubAgentRegistry,
  request: string,
  options: { readonly preferredAgent?: PaceSubAgentId | null } = {},
): PaceRoutePlan {
  const tokens = normalizeRequestTokens(request);
  const intent = WRITE_SIGNALS.some((signal) => matchesSignal(tokens, signal)) ? "write" : "read";

  const routes = registry.agents
    .map((agent, order) => ({ order, route: scoreSubAgent(agent, tokens) }))
    .filter(({ route }) => route.score > 0)
    .sort((left, right) => right.route.score - left.route.score || left.order - right.order)
    .map(({ route }) => route);

  if (routes.length > 0) {
    return freezePlan({
      status: "routed",
      composition: routes.length === 1 ? "single" : "multi",
      intent,
      routes,
      fallback: null,
    });
  }

  const preferred = options.preferredAgent ? registry.get(options.preferredAgent) : null;
  if (preferred && tokens.length > 0) {
    return freezePlan({
      status: "routed",
      composition: "single",
      intent,
      routes: [{ agentId: preferred.id, score: 0, matched: [], reason: "context" }],
      fallback: null,
    });
  }

  return freezePlan({
    status: "fallback",
    composition: "none",
    intent,
    routes: [],
    fallback: { kind: "clarify", availableAgents: registry.agents.map((agent) => agent.id) },
  });
}

function scoreSubAgent(agent: PaceSubAgentDefinition, tokens: readonly string[]): PaceRoute {
  const signals = [...agent.intents.en, ...agent.intents.fr, ...agent.intents.de];
  const matched = [...new Set(signals.filter((signal) => matchesSignal(tokens, signal)))];
  return { agentId: agent.id, score: matched.length, matched, reason: "intent" };
}

function matchesSignal(tokens: readonly string[], signal: string): boolean {
  const parts = signal.split(" ");
  for (let start = 0; start + parts.length <= tokens.length; start += 1) {
    if (parts.every((part, offset) => matchesToken(tokens[start + offset]!, part))) return true;
  }
  return false;
}

function matchesToken(token: string, part: string): boolean {
  return part.endsWith("*") ? token.startsWith(part.slice(0, -1)) : token === part;
}

function freezePlan(plan: PaceRoutePlan): PaceRoutePlan {
  return Object.freeze({
    ...plan,
    routes: Object.freeze(plan.routes.map((route) => Object.freeze({ ...route, matched: Object.freeze([...route.matched]) }))),
  });
}
