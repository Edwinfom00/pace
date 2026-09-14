import assert from "node:assert/strict";
import test from "node:test";

import { createJSONStorage } from "zustand/middleware";

import {
  getCountryDefaultCurrency,
  isSupportedCountry,
  isSupportedCurrency,
  isSupportedTimezone,
} from "@/modules/onboarding/metadata";
import type { PaceUserProfileRecord, ValidatedYourPace } from "@/modules/onboarding/profile-domain";
import { resolveOnboardingRoute } from "@/modules/onboarding/route-state";
import { createOnboardingServerSnapshot } from "@/modules/onboarding/server-snapshot";
import { persistYourPaceStep } from "@/modules/onboarding/server";
import type { PaceUserProfileRepository } from "@/modules/onboarding/repositories/pace-user-profile-repository";
import {
  createOnboardingStore,
  emptyOnboardingDraft,
  mergeOnboardingServerSnapshot,
  ONBOARDING_STORE_KEY,
  type OnboardingDraftState,
} from "@/stores/onboarding-store";

function profile(overrides: Partial<PaceUserProfileRecord> = {}): PaceUserProfileRecord {
  return {
    userId: "user-1",
    onboardingStatus: "NOT_STARTED",
    onboardingStep: null,
    onboardingCompletedAt: null,
    countryCode: null,
    currency: null,
    timezone: null,
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
        onboardingStep: 2,
        countryCode: input.country,
        currency: input.currency,
        timezone: input.timezone,
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
  first.getState().setCurrentStep(2);

  const second = createOnboardingStore({ storage, skipHydration: false });
  assert.equal(second.getState().currentStep, 2);
  assert.equal(second.getState().yourPace.country, "CM");

  const serialized = records.get(ONBOARDING_STORE_KEY) ?? "";
  assert.match(serialized, /"country":"CM"/);
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
  store.getState().hydrateFromServer({ currentStep: 2, yourPace: input });
  assert.equal(saved.onboardingStep, 2);
  assert.equal(store.getState().currentStep, 2);
});
