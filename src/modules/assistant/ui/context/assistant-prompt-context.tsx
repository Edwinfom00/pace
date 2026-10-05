"use client";

import { createContext, useContext } from "react";

type AssistantPrompt = {
  readonly ask: (prompt: string) => void;
  readonly disabled: boolean;
};

const AssistantPromptContext = createContext<AssistantPrompt | null>(null);

export const AssistantPromptProvider = AssistantPromptContext.Provider;

export function useAssistantPrompt(): AssistantPrompt {
  const value = useContext(AssistantPromptContext);
  if (!value)
    throw new Error("useAssistantPrompt requires an AssistantPromptProvider.");
  return value;
}
