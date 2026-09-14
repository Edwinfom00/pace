import assert from "node:assert/strict";
import test from "node:test";

import { createJSONStorage } from "zustand/middleware";

import {
  getCountryDefaultCurrency,
  isSupportedCountry,
  isSupportedCurrency,
  isSupportedTimezone,
} from "@/modules/onboarding/metadata";
import {
  suggestedWorkspaceName,
  withSelectedWorkspaceType,
  workspaceStepSchema,
  type PaceUserProfileRecord,
  type ValidatedYourPace,
} from "@/modules/onboarding/profile-domain";
import { resolveOnboardingRoute, resolveOnboardingViewedStep } from "@/modules/onboarding/route-state";
import { createOnboardingServerSnapshot } from "@/modules/onboarding/server-snapshot";
import { persistWorkspaceStep, persistYourPaceStep } from "@/modules/onboarding/server";
import type { PaceUserProfileRepository } from "@/modules/onboarding/repositories/pace-user-profile-repository";
import { getOnboardingTranslations } from "@/i18n/onboarding-messages";
import { WorkspaceService } from "@/modules/workspaces/workspace-service";
import {
  createOnboardingStore,
  emptyOnboardingDraft,
  mergeOnboardingServerSnapshot,
  ONBOARDING_STORE_KEY,
  type OnboardingDraftState,
} from "@/stores/onboarding-store";

import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";

const actor = { userId: "user-1", email: "user@pace.test", name: "Pace User" };

function profile(overrides: Partial<PaceUserProfileRecord> = {}): PaceUserProfileRecord {
  return {
    userId: "user-1",
    onboardingStatus: "NOT_STARTED",
    onboardingStep: null,
    onboardingCompletedAt: null,
    countryCode: null,
    currency: null,
    timezone: null,
    onboardingWorkspaceId: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function repository(record = profile()): PaceUserProfileRepository {
  return {
    async getOrCreate() {
      return record;
    },
    async saveYourPaceStep(_userId, input) {
      record = profile({
        ...record,
        onboardingStatus: "IN_PROGRESS",
        onboardingStep: Math.max(record.onboardingStep ?? 1, 2),
        countryCode: input.country,
        currency: input.currency,
        timezone: input.timezone,
      });
      return record;
    },
    async claimOnboardingWorkspaceId(_userId, candidateWorkspaceId) {
      record = profile({
        ...record,
        onboardingWorkspaceId: record.onboardingWorkspaceId ?? candidateWorkspaceId,
      });
      return record;
    },
    async saveWorkspaceStep(_userId, workspaceId) {
      record = profile({
        ...record,
        onboardingStatus: "IN_PROGRESS",
        onboardingStep: Math.max(record.onboardingStep ?? 1, 3),
        onboardingWorkspaceId: workspaceId,
      });
      return record;
    },
  };
}

test("onboarding access redirects unauthenticated and completed users from server state", async () => {
  const unauthenticated = await resolveOnboardingRoute(null, repository(), async () => "/unused");
  assert.deepEqual(unauthenticated, {
    kind: "redirect",
    destination: "/login?returnTo=%2Fonboarding",
  });

  const completed = await resolveOnboardingRoute(
    "user-1",
    repository(profile({ onboardingStatus: "COMPLETED", onboardingCompletedAt: new Date() })),
    async () => "/w/my-home/overview",
  );
  assert.deepEqual(completed, { kind: "redirect", destination: "/w/my-home/overview" });
});

test("server hydration creates a typed Step 1 resume snapshot", () => {
  const snapshot = createOnboardingServerSnapshot(
    profile({
      onboardingStatus: "IN_PROGRESS",
      onboardingStep: 2,
      countryCode: "CM",
      currency: "XAF",
      timezone: "Africa/Douala",
    }),
    "fr",
  );

  assert.deepEqual(snapshot, {
    currentStep: 2,
    yourPace: { country: "CM", language: "fr", currency: "XAF", timezone: "Africa/Douala" },
    workspace: { type: "", name: "", nameManuallyEdited: false },
  });
});

test("server-completed Step 1 values override stale persisted browser state", () => {
  const local: OnboardingDraftState = {
    ...emptyOnboardingDraft,
    currentStep: 5,
    yourPace: { country: "US", language: "en", currency: "USD", timezone: "America/New_York" },
  };
  const merged = mergeOnboardingServerSnapshot(local, {
    currentStep: 2,
    yourPace: { country: "CM", language: "fr", currency: "XAF", timezone: "Africa/Douala" },
    workspace: { type: "", name: "", nameManuallyEdited: false },
  });

  assert.equal(merged.currentStep, 2);
  assert.deepEqual(merged.yourPace, {
    country: "CM",
    language: "fr",
    currency: "XAF",
    timezone: "Africa/Douala",
  });
});

test("the versioned Zustand store restores a safe Step 1 draft without auth data", () => {
  const records = new Map<string, string>();
  const storage = createJSONStorage<OnboardingDraftState>(() => ({
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key),
  }));

  assert.ok(storage);
  const first = createOnboardingStore({ storage, skipHydration: false });
  first.getState().setYourPace({ country: "CM", language: "fr", currency: "XAF", timezone: "Africa/Douala" });
  first.getState().setWorkspace({ type: "COUPLE", name: "Our House", nameManuallyEdited: true });
  first.getState().setCurrentStep(2);

  const second = createOnboardingStore({ storage, skipHydration: false });
  assert.equal(second.getState().currentStep, 2);
  assert.equal(second.getState().yourPace.country, "CM");
  assert.deepEqual(second.getState().workspace, { type: "COUPLE", name: "Our House", nameManuallyEdited: true });

  const serialized = records.get(ONBOARDING_STORE_KEY) ?? "";
  assert.match(serialized, /"country":"CM"/);
  assert.match(serialized, /"name":"Our House"/);
  assert.doesNotMatch(serialized, /token|session|credential|password/i);
});

test("international metadata and server validation use stable country, currency, and IANA values", async () => {
  assert.equal(isSupportedCountry("CM"), true);
  assert.equal(isSupportedCountry("Cameroon"), false);
  assert.equal(getCountryDefaultCurrency("CM"), "XAF");
  assert.equal(isSupportedCurrency("XAF"), true);
  assert.equal(isSupportedTimezone("Africa/Douala"), true);
  assert.equal(isSupportedTimezone("Douala"), false);

  const repo = repository();
  const persisted = await persistYourPaceStep(
    "user-1",
    { country: "CM", language: "fr", currency: "XAF", timezone: "Africa/Douala" },
    repo,
  );
  assert.equal(persisted.onboardingStatus, "IN_PROGRESS");
  assert.equal(persisted.onboardingStep, 2);
  assert.equal(persisted.countryCode, "CM");

  await assert.rejects(
    () => persistYourPaceStep("user-1", { country: "Cameroon", language: "fr", currency: "CFA", timezone: "Douala" }, repo),
  );
});

test("language changes immediately in the draft and Step 1 progresses to 2 on persistence", async () => {
  const store = createOnboardingStore({
    storage: createJSONStorage<OnboardingDraftState>(() => ({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined })),
    skipHydration: true,
  });
  store.getState().setYourPace({ language: "de" });
  assert.equal(store.getState().yourPace.language, "de");

  const input: ValidatedYourPace = { country: "DE", language: "de", currency: "EUR", timezone: "Europe/Berlin" };
  const saved = await persistYourPaceStep("user-1", input, repository());
  store.getState().hydrateFromServer({
    currentStep: 2,
    yourPace: input,
    workspace: { type: "", name: "", nameManuallyEdited: false },
  });
  assert.equal(saved.onboardingStep, 2);
  assert.equal(store.getState().currentStep, 2);
});

test("workspace selection uses domain values, deterministic suggestions, and preserves custom names", () => {
  assert.deepEqual(
    ["PERSONAL", "COUPLE", "FAMILY", "CUSTOM"].map((type) => workspaceStepSchema.safeParse({ type, name: "A workspace" }).success),
    [true, true, true, true],
  );
  assert.equal(workspaceStepSchema.safeParse({ type: "Couple", name: "House" }).success, false);
  assert.equal(workspaceStepSchema.safeParse({ type: "COUPLE", name: "   " }).success, false);
  assert.equal(suggestedWorkspaceName("PERSONAL"), "Personal");
  assert.equal(suggestedWorkspaceName("COUPLE"), "House");
  assert.equal(suggestedWorkspaceName("FAMILY"), "Family");
  assert.equal(suggestedWorkspaceName("CUSTOM"), "My Workspace");

  const automatic = withSelectedWorkspaceType(
    { type: "COUPLE", name: "House", nameManuallyEdited: false },
    "FAMILY",
  );
  assert.equal(automatic.name, "Family");
  const custom = withSelectedWorkspaceType(
    { type: "COUPLE", name: "The Nfor Home", nameManuallyEdited: true },
    "FAMILY",
  );
  assert.equal(custom.name, "The Nfor Home");
});

test("workspace Step 2 persistence is idempotent, creates an owner, and advances the progress boundary", async () => {
  const profiles = repository(profile({
    onboardingStatus: "IN_PROGRESS",
    onboardingStep: 2,
    countryCode: "CM",
    currency: "XAF",
    timezone: "Africa/Douala",
  }));
  const workspaces = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(workspaces, "test-pepper");

  const [first, retry] = await Promise.all([
    persistWorkspaceStep(actor, { type: "COUPLE", name: "House" }, profiles, service),
    persistWorkspaceStep(actor, { type: "COUPLE", name: "House" }, profiles, service),
  ]);
  const second = await persistWorkspaceStep(actor, { type: "FAMILY", name: "Family finances" }, profiles, service);
  const stored = [...workspaces.workspaces.values()];

  assert.equal(first.profile.onboardingStep, 3);
  assert.equal(retry.profile.onboardingStep, 3);
  assert.equal(second.profile.onboardingStep, 3);
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.type, "FAMILY");
  assert.equal(stored[0]?.name, "Family finances");
  assert.ok(stored[0]?.slug);
  assert.equal((await workspaces.findMembership(stored[0]!.id, actor.userId))?.role, "OWNER");

  await assert.rejects(
    service.createOrUpdateOnboardingWorkspace(
      { userId: "other-user", email: "other@pace.test", name: "Other" },
      stored[0]!.id,
      { type: "PERSONAL", name: "Not mine" },
    ),
  );
});

test("Back selects a view without regressing the completed progress and workspace messages exist in EN, FR, and DE", () => {
  assert.equal(resolveOnboardingViewedStep("1", 2), 1);
  assert.equal(resolveOnboardingViewedStep("3", 2), 2);
  assert.equal(resolveOnboardingViewedStep(undefined, 3), 3);

  for (const language of ["en", "fr", "de"] as const) {
    const t = getOnboardingTranslations(language);
    assert.ok(t("onboarding.workspace.title").length > 0);
    assert.ok(t("onboarding.workspace.types.couple.description").length > 0);
    assert.ok(t("onboarding.workspace.name.helper").length > 0);
  }
});
