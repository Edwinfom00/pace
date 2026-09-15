"use client";

import { createContext, useContext } from "react";

import type { PacePageContext } from "../domain/page-context";

const PacePageContextValue = createContext<PacePageContext | null>(null);

export function PacePageContextProvider({
  context,
  children,
}: {
  readonly context: PacePageContext;
  readonly children: React.ReactNode;
}) {
  return <PacePageContextValue.Provider value={context}>{children}</PacePageContextValue.Provider>;
}

export function usePacePageContext(): PacePageContext {
  const context = useContext(PacePageContextValue);
  if (!context) throw new Error("Pace Assistant requires a PacePageContextProvider.");
  return context;
}
