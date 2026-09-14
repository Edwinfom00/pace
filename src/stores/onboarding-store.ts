"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type PersistStorage } from "zustand/middleware";
import { createStore } from "zustand/vanilla";

import type { OnboardingServerSnapshot } from "@/modules/onboarding/server-snapshot";
import type {
  OnboardingInviteMethod,
  OnboardingStep,
  WorkspaceDraft,
  YourPaceDraft,
} from "@/modules/onboarding/profile-domain";

export const ONBOARDING_STORE_KEY = "pace:onboarding:v1";

export type OnboardingDraftState = {
  currentStep: OnboardingStep;
  yourPace: YourPaceDraft;
  workspace: WorkspaceDraft;
  together: { skipped: boolean; inviteMethod: OnboardingInviteMethod };
  connect: { selectedMethod: string };
  preferences: { goals: string[]; proactivity: string };
};

export type OnboardingStore = OnboardingDraftState & {
  hydrated: boolean;
  setYourPace: (values: Partial<YourPaceDraft>) => void;
  setWorkspace: (values: Partial<WorkspaceDraft>) => void;
  setTogether: (values: Partial<OnboardingDraftState["together"]>) => void;
  setCurrentStep: (step: OnboardingStep) => void;
  reset: () => void;
  hydrateFromServer: (snapshot: OnboardingServerSnapshot) => void;
  setHydrated: (hydrated: boolean) => void;
};

export const emptyOnboardingDraft: OnboardingDraftState = {
  currentStep: 1,
  yourPace: { country: "", language: "en", currency: "", timezone: "" },
  workspace: { type: "", name: "", nameManuallyEdited: false },
  together: { skipped: false, inviteMethod: "email" },
  connect: { selectedMethod: "" },
  preferences: { goals: [], proactivity: "" },
};

/**
 * Server values replace a locally stale completed step. While Step 1 remains
 * unsubmitted, only non-empty server values win and safe local draft fields
 * survive a browser refresh.
 */
export function mergeOnboardingServerSnapshot(
  local: OnboardingDraftState,
  server: OnboardingServerSnapshot,
): OnboardingDraftState {
  const serverHasCompletedYourPace = server.currentStep > 1;
  const serverHasCompletedWorkspace = server.currentStep > 2;
  const mergeField = (key: keyof YourPaceDraft) =>
    server.yourPace[key] || local.yourPace[key] || "";

  return {
    ...local,
    // The server owns progress. Browser state may only restore unsaved fields.
    currentStep: server.currentStep,
    yourPace: serverHasCompletedYourPace
      ? server.yourPace
      : {
          country: mergeField("country"),
          language: (mergeField("language") || "en") as YourPaceDraft["language"],
          currency: mergeField("currency"),
          timezone: mergeField("timezone"),
        },
    workspace: serverHasCompletedWorkspace ? server.workspace : local.workspace,
    together: server.currentStep >= 3
      ? { ...local.together, skipped: server.together.skipped }
      : local.together,
  };
}

type StoreOptions = {
  storage?: PersistStorage<OnboardingDraftState>;
  skipHydration?: boolean;
};

function makeStore(options: StoreOptions = {}) {
  return persist<OnboardingStore, [], [], OnboardingDraftState>(
    (set) => ({
      ...emptyOnboardingDraft,
      hydrated: false,
      setYourPace: (values) =>
        set((state) => ({ yourPace: { ...state.yourPace, ...values } })),
      setWorkspace: (values) =>
        set((state) => ({ workspace: { ...state.workspace, ...values } })),
      setTogether: (values) =>
        set((state) => ({ together: { ...state.together, ...values } })),
      setCurrentStep: (currentStep) => set({ currentStep }),
      reset: () => set({ ...emptyOnboardingDraft, hydrated: true }),
      hydrateFromServer: (snapshot) =>
        set((state) => ({ ...mergeOnboardingServerSnapshot(state, snapshot), hydrated: true })),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: ONBOARDING_STORE_KEY,
      version: 1,
      storage: options.storage ?? createJSONStorage(() => localStorage),
      skipHydration: options.skipHydration ?? true,
      partialize: (state) => ({
        currentStep: state.currentStep,
        yourPace: state.yourPace,
        workspace: state.workspace,
        together: state.together,
        connect: state.connect,
        preferences: state.preferences,
      }),
    },
  );
}

export const useOnboardingStore = create<OnboardingStore>()(makeStore());

/** Test seam for persisted-refresh behavior with an in-memory storage adapter. */
export function createOnboardingStore(options: StoreOptions = {}) {
  return createStore<OnboardingStore>()(makeStore(options));
}
