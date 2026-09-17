import assert from "node:assert/strict";
import test from "node:test";

import { toCurrencyCode } from "@/money/currency";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createJSONStorage } from "zustand/middleware";
import { FiCreditCard } from "react-icons/fi";

import {
  getCountryDefaultCurrency,
  isSupportedCountry,
  isSupportedCurrency,
  isSupportedTimezone,
} from "@/modules/onboarding/metadata";
import {
  connectionMethodSchema,
  onboardingPreferencesSchema,
  isConnectionMethodAvailable,
  suggestedWorkspaceName,
  withSelectedWorkspaceType,
  onboardingInvitationSchema,
  workspaceStepSchema,
  type PaceUserProfileRecord,
  type ValidatedYourPace,
} from "@/modules/onboarding/profile-domain";
import {
  resolveConnectBackStep,
  resolveOnboardingRoute,
  resolveOnboardingViewedStep,
  resolveOnboardingWorkspaceStep,
} from "@/modules/onboarding/route-state";
import { createOnboardingServerSnapshot } from "@/modules/onboarding/server-snapshot";
import { createOnboardingReadySummary } from "@/modules/onboarding/ready-summary";
import {
  ConnectionMethodUnavailableError,
  createOnboardingInvitation,
  finalizeOnboarding,
  OnboardingFinalizationUnavailableError,
  persistConnectStep,
  persistPreferencesStep,
  persistTogetherStep,
  persistWorkspaceStep,
  persistYourPaceStep,
} from "@/modules/onboarding/server";
import type { PaceUserProfileRepository } from "@/modules/onboarding/repositories/pace-user-profile-repository";
import { getOnboardingTranslations } from "@/i18n/onboarding-messages";
import { getPaceCopyState } from "@/components/pace/shared/pace-copy-field";
import { PaceSelectionCard } from "@/components/pace/onboarding/pace-selection-card";
import { getFinancialConnectionCapabilities } from "@/modules/financial-connections/capabilities";
import { WorkspaceService } from "@/modules/workspaces/workspace-service";
import {
  createOnboardingStore,
  emptyOnboardingDraft,
  mergeOnboardingServerSnapshot,
  ONBOARDING_STORE_KEY,
  type OnboardingDraftState,
} from "@/stores/onboarding-store";

import { InMemoryWorkspaceRepository } from "../../support/in-memory-workspace-repository";
import { InMemoryInsightRepository } from "../../support/in-memory-insight-repository";

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
    onboardingSkippedSteps: [],
    onboardingInvitationId: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
    onboardingStartingMethod: overrides.onboardingStartingMethod ?? null,
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
    async saveWorkspaceStep(_userId, workspaceId, progress) {
      record = profile({
        ...record,
        onboardingStatus: "IN_PROGRESS",
        onboardingStep: progress.nextStep,
        onboardingWorkspaceId: workspaceId,
        onboardingSkippedSteps: progress.skipTogether ? [3] : [],
      });
      return record;
    },
    async saveTogetherStep(_userId, skipped) {
      record = profile({
        ...record,
        onboardingStatus: "IN_PROGRESS",
        onboardingStep: 4,
        onboardingSkippedSteps: skipped ? [3] : [],
      });
      return record;
    },
    async saveConnectStep(_userId, method) {
      record = profile({
        ...record,
        onboardingStatus: "IN_PROGRESS",
        onboardingStep: 5,
        onboardingStartingMethod: method,
      });
      return record;
    },
    async markOnboardingReady() {
      record = profile({
        ...record,
        onboardingStatus: "IN_PROGRESS",
        onboardingStep: null,
        onboardingCompletedAt: null,
      });
      return record;
    },
    async completeOnboarding() {
      record = profile({
        ...record,
        onboardingStatus: "COMPLETED",
        onboardingStep: null,
        onboardingCompletedAt: record.onboardingCompletedAt ?? new Date(),
      });
      return record;
    },
    async claimOnboardingInvitationId(_userId, candidateInvitationId) {
      record = profile({
        ...record,
        onboardingInvitationId: record.onboardingInvitationId ?? candidateInvitationId,
      });
      return record;
    },
    async clearOnboardingInvitationId(_userId, invitationId) {
      record = profile({
        ...record,
        onboardingInvitationId: record.onboardingInvitationId === invitationId ? null : record.onboardingInvitationId,
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

  const ready = await resolveOnboardingRoute(
    "user-1",
    repository(profile({ onboardingStatus: "IN_PROGRESS", onboardingStep: null })),
    async () => "/w/my-home/overview",
  );
  assert.deepEqual(ready, { kind: "redirect", destination: "/onboarding/ready" });
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
    together: { skipped: false, hasExistingInvitation: false },
    connect: {
      selectedMethod: "MANUAL",
      capabilities: { manual: true, importStatement: true, bankConnection: false, mobileMoney: false },
    },
    preferences: { goals: ["TRACK_SPENDING"], proactivity: "BALANCED" },
    preferencesPersisted: false,
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
    together: { skipped: false, hasExistingInvitation: false },
    connect: {
      selectedMethod: "MANUAL",
      capabilities: { manual: true, importStatement: true, bankConnection: false, mobileMoney: false },
    },
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
  first.getState().setTogether({ inviteMethod: "link", skipped: false });
  first.getState().setCurrentStep(2);

  const second = createOnboardingStore({ storage, skipHydration: false });
  assert.equal(second.getState().currentStep, 2);
  assert.equal(second.getState().yourPace.country, "CM");
  assert.deepEqual(second.getState().workspace, { type: "COUPLE", name: "Our House", nameManuallyEdited: true });

  const serialized = records.get(ONBOARDING_STORE_KEY) ?? "";
  assert.match(serialized, /"country":"CM"/);
  assert.match(serialized, /"name":"Our House"/);
  assert.match(serialized, /"inviteMethod":"link"/);
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

  const input: ValidatedYourPace = { country: "DE", language: "de", currency: toCurrencyCode("EUR"), timezone: "Europe/Berlin" };
  const saved = await persistYourPaceStep("user-1", input, repository());
  store.getState().hydrateFromServer({
    currentStep: 2,
    yourPace: input,
    workspace: { type: "", name: "", nameManuallyEdited: false },
    together: { skipped: false, hasExistingInvitation: false },
    connect: {
      selectedMethod: "MANUAL",
      capabilities: { manual: true, importStatement: true, bankConnection: false, mobileMoney: false },
    },
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

test("PERSONAL skips Together in server state and cannot be forced back to Step 3", async () => {
  const profiles = repository(profile({
    onboardingStatus: "IN_PROGRESS",
    onboardingStep: 2,
    countryCode: "CM",
    currency: "XAF",
    timezone: "Africa/Douala",
  }));
  const workspaces = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(workspaces, "test-pepper");
  const persisted = await persistWorkspaceStep(actor, { type: "PERSONAL", name: "Private" }, profiles, service);

  assert.equal(persisted.profile.onboardingStep, 4);
  assert.deepEqual(persisted.profile.onboardingSkippedSteps, [3]);
  assert.equal(resolveOnboardingWorkspaceStep(3, "PERSONAL"), 4);
  assert.equal(resolveOnboardingWorkspaceStep(3, "COUPLE"), 3);
});

test("shared workspace types create MEMBER onboarding invitations and Step 3 can be skipped", async () => {
  for (const type of ["COUPLE", "FAMILY", "CUSTOM"] as const) {
    const profiles = repository(profile({
      onboardingStatus: "IN_PROGRESS",
      onboardingStep: 2,
      countryCode: "CM",
      currency: "XAF",
      timezone: "Africa/Douala",
    }));
    const workspaces = new InMemoryWorkspaceRepository();
    const service = new WorkspaceService(workspaces, "test-pepper");
    await persistWorkspaceStep(actor, { type, name: `${type} space` }, profiles, service);

    const created = await createOnboardingInvitation(actor, { method: "email", email: "partner@pace.test" }, profiles, service, () => `${type}-invite`);
    assert.equal(created.kind, "created");
    const invitation = created.kind === "created"
      ? await workspaces.findInvitationById(`${type}-invite`)
      : null;
    assert.equal(invitation?.role, "MEMBER");
    assert.equal(invitation?.invitedEmail, "partner@pace.test");

    const completed = await persistTogetherStep(actor, profiles, service);
    assert.equal(completed.onboardingStep, 4);
    assert.deepEqual(completed.onboardingSkippedSteps, []);
  }
});

test("onboarding invitation creation is idempotent and raw credentials never enter persisted state", async () => {
  const profiles = repository(profile({
    onboardingStatus: "IN_PROGRESS",
    onboardingStep: 2,
    countryCode: "CM",
    currency: "XAF",
    timezone: "Africa/Douala",
  }));
  const workspaces = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(workspaces, "test-pepper");
  await persistWorkspaceStep(actor, { type: "COUPLE", name: "House" }, profiles, service);

  const [first, second] = await Promise.all([
    createOnboardingInvitation(actor, { method: "link" }, profiles, service, () => "invite-one"),
    createOnboardingInvitation(actor, { method: "link" }, profiles, service, () => "invite-two"),
  ]);
  assert.equal([...workspaces.invitations.values()].length, 1);
  assert.equal([first.kind, second.kind].filter((kind) => kind === "created").length, 1);
  assert.equal([first.kind, second.kind].filter((kind) => kind === "rotation-required").length, 1);

  const storage = createJSONStorage<OnboardingDraftState>(() => ({
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  }));
  const store = createOnboardingStore({ storage, skipHydration: false });
  store.getState().setTogether({ inviteMethod: "link" });
  const serialized = JSON.stringify(store.getState());
  assert.doesNotMatch(serialized, /invite-one|invite-two|shortCode|inviteUrlToken/i);
});

test("email validation is strict and skipping creates no invitation before advancing", async () => {
  assert.equal(onboardingInvitationSchema.safeParse({ method: "email", email: "not-an-email" }).success, false);
  assert.equal(onboardingInvitationSchema.safeParse({ method: "email", email: "partner@pace.test" }).success, true);
  assert.equal(onboardingInvitationSchema.safeParse({ method: "link" }).success, true);

  const profiles = repository(profile({
    onboardingStatus: "IN_PROGRESS",
    onboardingStep: 2,
    countryCode: "CM",
    currency: "XAF",
    timezone: "Africa/Douala",
  }));
  const workspaces = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(workspaces, "test-pepper");
  await persistWorkspaceStep(actor, { type: "FAMILY", name: "Family" }, profiles, service);
  const completed = await persistTogetherStep(actor, profiles, service);

  assert.equal([...workspaces.invitations.values()].length, 0);
  assert.equal(completed.onboardingStep, 4);
  assert.deepEqual(completed.onboardingSkippedSteps, [3]);
});

test("copy fields expose copied and failed feedback only for their current credential", () => {
  assert.equal(getPaceCopyState("K7PX-4M2Q", "K7PX-4M2Q", null), "copied");
  assert.equal(getPaceCopyState("K7PX-4M2Q", null, "K7PX-4M2Q"), "error");
  assert.equal(getPaceCopyState("fresh-value", "K7PX-4M2Q", null), "idle");
});

test("Back selects a view without regressing the completed progress and workspace messages exist in EN, FR, and DE", () => {
  assert.equal(resolveOnboardingViewedStep("1", 2), 1);
  assert.equal(resolveOnboardingViewedStep("3", 2), 2);
  assert.equal(resolveOnboardingViewedStep(undefined, 3), 3);
  assert.equal(resolveConnectBackStep("PERSONAL"), 2);
  assert.equal(resolveConnectBackStep("COUPLE"), 3);

  for (const language of ["en", "fr", "de"] as const) {
    const t = getOnboardingTranslations(language);
    assert.ok(t("onboarding.workspace.title").length > 0);
    assert.ok(t("onboarding.workspace.types.couple.description").length > 0);
    assert.ok(t("onboarding.workspace.name.helper").length > 0);
    assert.ok(t("onboarding.together.title").length > 0);
    assert.ok(t("onboarding.together.copy").length > 0);
    assert.ok(t("onboarding.connect.title").length > 0);
    assert.ok(t("onboarding.connect.bank.comingSoon").length > 0);
    assert.ok(t("onboarding.connect.info").length > 0);
    assert.ok(t("onboarding.preferences.title").length > 0);
    assert.ok(t("onboarding.preferences.goals.trackSpending.description").length > 0);
    assert.ok(t("onboarding.preferences.proactivity.balanced.title").length > 0);
  }
});

test("connection capabilities are country-aware, provider-backed, and never inferred from display text", () => {
  const withoutProvider = getFinancialConnectionCapabilities({ country: "CM" });
  assert.deepEqual(withoutProvider, {
    manual: true,
    importStatement: true,
    bankConnection: false,
    mobileMoney: false,
  });
  assert.equal(connectionMethodSchema.safeParse("IMPORT_STATEMENT").success, true);
  assert.equal(connectionMethodSchema.safeParse("Import a statement").success, false);
  assert.equal(isConnectionMethodAvailable("BANK_CONNECTION", withoutProvider), false);

  const withBankProvider = getFinancialConnectionCapabilities(
    { country: "US" },
    [{ kind: "BANK_CONNECTION", countryCodes: ["US"], isConfigured: () => true }],
  );
  assert.equal(withBankProvider.bankConnection, true);
  assert.equal(getFinancialConnectionCapabilities(
    { country: "CM" },
    [{ kind: "BANK_CONNECTION", countryCodes: ["US"], isConfigured: () => true }],
  ).bankConnection, false);
});

test("connection draft defaults to MANUAL, survives refresh, and reconciles stale unavailable choices", () => {
  const records = new Map<string, string>();
  const storage = createJSONStorage<OnboardingDraftState>(() => ({
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key),
  }));
  const first = createOnboardingStore({ storage, skipHydration: false });
  assert.equal(first.getState().connect.selectedMethod, "MANUAL");
  first.getState().setConnect({ selectedMethod: "IMPORT_STATEMENT" });

  const restored = createOnboardingStore({ storage, skipHydration: false });
  assert.equal(restored.getState().connect.selectedMethod, "IMPORT_STATEMENT");

  const reconciled = mergeOnboardingServerSnapshot(
    { ...emptyOnboardingDraft, connect: { ...emptyOnboardingDraft.connect, selectedMethod: "BANK_CONNECTION" } },
    {
      currentStep: 4,
      yourPace: { country: "CM", language: "en", currency: "XAF", timezone: "Africa/Douala" },
      workspace: { type: "PERSONAL", name: "Private", nameManuallyEdited: true },
      together: { skipped: true, hasExistingInvitation: false },
      connect: {
        selectedMethod: "MANUAL",
        capabilities: { manual: true, importStatement: true, bankConnection: false, mobileMoney: false },
      },
    },
  );
  assert.equal(reconciled.connect.selectedMethod, "MANUAL");
});

test("Step 4 only persists a capability-approved method and advances to Step 5", async () => {
  const workspaces = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(workspaces, "test-pepper");
  const workspace = await service.createWorkspace(actor, { name: "Private", type: "PERSONAL" });
  const profiles = repository(profile({
    onboardingStatus: "IN_PROGRESS",
    onboardingStep: 4,
    countryCode: "CM",
    currency: "XAF",
    timezone: "Africa/Douala",
    onboardingWorkspaceId: workspace.id,
  }));

  const persisted = await persistConnectStep(actor, "IMPORT_STATEMENT", profiles, service);
  assert.equal(persisted.onboardingStartingMethod, "IMPORT_STATEMENT");
  assert.equal(persisted.onboardingStep, 5);

  await assert.rejects(
    () => persistConnectStep(actor, "BANK_CONNECTION", profiles, service),
    ConnectionMethodUnavailableError,
  );
  await assert.rejects(
    () => persistConnectStep(actor, "MOBILE_MONEY", profiles, service),
    ConnectionMethodUnavailableError,
  );
});

test("selection cards expose selected and unavailable semantics", () => {
  const unavailable = renderToStaticMarkup(createElement(PaceSelectionCard, {
    id: "bank",
    value: "BANK_CONNECTION",
    selected: false,
    icon: FiCreditCard,
    title: "Connect an account",
    description: "Automatically sync your transactions.",
    disabled: true,
    features: ["Secure and read-only connection"],
    onSelect: () => undefined,
  }));
  assert.match(unavailable, /role="radio"/);
  assert.match(unavailable, /aria-disabled="true"/);
  assert.match(unavailable, /disabled=""/);

  const selected = renderToStaticMarkup(createElement(PaceSelectionCard, {
    id: "manual",
    value: "MANUAL",
    selected: true,
    icon: FiCreditCard,
    title: "Start manually",
    description: "Add expenses as they happen.",
    onSelect: () => undefined,
  }));
  assert.match(selected, /aria-checked="true"/);
  assert.match(selected, /aria-label="Selected"/);

  const checkbox = renderToStaticMarkup(createElement(PaceSelectionCard, {
    id: "goal",
    value: "TRACK_SPENDING",
    selected: false,
    icon: FiCreditCard,
    title: "Track spending",
    description: "Keep an eye on your money.",
    onSelect: () => undefined,
    selectionMode: "multiple",
  }));
  assert.match(checkbox, /role="checkbox"/);
  assert.match(checkbox, /aria-checked="false"/);
});

test("preference enums require a goal, have restrained defaults, and survive a persisted draft refresh", () => {
  assert.equal(onboardingPreferencesSchema.safeParse({ goals: [], proactivity: "BALANCED" }).success, false);
  assert.equal(onboardingPreferencesSchema.safeParse({ goals: ["TRACK_SPENDING"], proactivity: "NOISY" }).success, false);
  assert.equal(onboardingPreferencesSchema.safeParse({ goals: ["TRACK_SPENDING", "TRACK_SPENDING"], proactivity: "BALANCED" }).success, false);
  assert.equal(onboardingPreferencesSchema.safeParse({ goals: ["TRACK_SPENDING", "BILLS"], proactivity: "PROACTIVE" }).success, true);

  const records = new Map<string, string>();
  const storage = createJSONStorage<OnboardingDraftState>(() => ({
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key),
  }));
  const first = createOnboardingStore({ storage, skipHydration: false });
  assert.deepEqual(first.getState().preferences, { goals: ["TRACK_SPENDING"], proactivity: "BALANCED" });
  first.getState().setPreferences({ goals: ["TRACK_SPENDING", "BILLS"], proactivity: "QUIET" });

  const restored = createOnboardingStore({ storage, skipHydration: false });
  assert.deepEqual(restored.getState().preferences, { goals: ["TRACK_SPENDING", "BILLS"], proactivity: "QUIET" });

  const serverWins = mergeOnboardingServerSnapshot(emptyOnboardingDraft, {
    currentStep: 5,
    yourPace: { country: "CM", language: "en", currency: "XAF", timezone: "Africa/Douala" },
    workspace: { type: "COUPLE", name: "House", nameManuallyEdited: true },
    together: { skipped: true, hasExistingInvitation: false },
    connect: {
      selectedMethod: "MANUAL",
      capabilities: { manual: true, importStatement: true, bankConnection: false, mobileMoney: false },
    },
    preferences: { goals: ["SAVE_FOR_SOMETHING"], proactivity: "PROACTIVE" },
    preferencesPersisted: true,
  });
  assert.deepEqual(serverWins.preferences, { goals: ["SAVE_FOR_SOMETHING"], proactivity: "PROACTIVE" });
});

test("Step 5 persists user-scoped goals and enters the resumable Ready state", async () => {
  const workspaces = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(workspaces, "test-pepper");
  const workspace = await service.createWorkspace(actor, { name: "House", type: "COUPLE" });
  const insights = new InMemoryInsightRepository();
  const profiles = repository(profile({
    onboardingStatus: "IN_PROGRESS",
    onboardingStep: 5,
    countryCode: "CM",
    currency: "XAF",
    timezone: "Africa/Douala",
    onboardingWorkspaceId: workspace.id,
    onboardingSkippedSteps: [3],
    onboardingStartingMethod: "MANUAL",
  }));

  const ready = await persistPreferencesStep(
    actor,
    { goals: ["TRACK_SPENDING", "MANAGE_TOGETHER"], proactivity: "QUIET" },
    profiles,
    service,
    insights,
  );
  assert.equal(ready.profile.onboardingStatus, "IN_PROGRESS");
  assert.equal(ready.profile.onboardingStep, null);
  assert.equal(ready.profile.onboardingCompletedAt, null);
  assert.deepEqual(ready.preferences, { paceGoals: ["TRACK_SPENDING", "MANAGE_TOGETHER"], proactivity: "QUIET" });
  assert.deepEqual(await insights.findPreference(workspace.id, actor.userId), {
    workspaceId: workspace.id,
    userId: actor.userId,
    paceGoals: ["TRACK_SPENDING", "MANAGE_TOGETHER"],
    proactivity: "QUIET",
    dailyEnabled: false,
    weeklyEnabled: true,
    monthlyEnabled: true,
    minimumSeverity: "WARNING",
    createdAt: (await insights.findPreference(workspace.id, actor.userId))?.createdAt,
    updatedAt: (await insights.findPreference(workspace.id, actor.userId))?.updatedAt,
  });

  const secondActor = { userId: "user-2", email: "other@pace.test", name: "Other Pace User" };
  workspaces.addMembership({ workspaceId: workspace.id, userId: secondActor.userId, role: "MEMBER", invitedByUserId: actor.userId, joinedAt: new Date() });
  const secondProfiles = repository(profile({
    onboardingStatus: "IN_PROGRESS",
    onboardingStep: 5,
    countryCode: "CM",
    currency: "XAF",
    timezone: "Africa/Douala",
    onboardingWorkspaceId: workspace.id,
    onboardingSkippedSteps: [3],
    onboardingStartingMethod: "MANUAL",
  }));
  await persistPreferencesStep(secondActor, { goals: ["BILLS"], proactivity: "PROACTIVE" }, secondProfiles, service, insights);
  assert.equal((await insights.findPreference(workspace.id, actor.userId))?.proactivity, "QUIET");
  assert.equal((await insights.findPreference(workspace.id, secondActor.userId))?.proactivity, "PROACTIVE");

  const incomplete = repository(profile({
    onboardingStatus: "IN_PROGRESS",
    onboardingStep: 4,
    countryCode: "CM",
    currency: "XAF",
    timezone: "Africa/Douala",
    onboardingWorkspaceId: workspace.id,
    onboardingStartingMethod: "MANUAL",
  }));
  await assert.rejects(() => persistPreferencesStep(actor, { goals: ["BILLS"], proactivity: "BALANCED" }, incomplete, service, insights));
});

test("Ready finalization verifies server state, completes once, and safely handles retries", async () => {
  const workspaces = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(workspaces, "test-pepper");
  const workspace = await service.createWorkspace(actor, { name: "House", type: "COUPLE" });
  const insights = new InMemoryInsightRepository();
  await insights.saveOnboardingPreference(workspace.id, actor.userId, {
    goals: ["TRACK_SPENDING", "MANAGE_TOGETHER"],
    proactivity: "BALANCED",
    dailyEnabled: true,
    weeklyEnabled: true,
    monthlyEnabled: true,
    minimumSeverity: "INFO",
  });

  const readyProfile = repository(profile({
    onboardingStatus: "IN_PROGRESS",
    onboardingStep: null,
    countryCode: "CM",
    currency: "XAF",
    timezone: "Africa/Douala",
    onboardingWorkspaceId: workspace.id,
    onboardingStartingMethod: "MANUAL",
  }));
  const finalized = await finalizeOnboarding(actor, readyProfile, service, insights);
  assert.equal(finalized.profile.onboardingStatus, "COMPLETED");
  assert.equal(finalized.profile.onboardingStep, null);
  assert.ok(finalized.profile.onboardingCompletedAt);
  assert.equal(finalized.workspaceSlug, workspace.slug);

  const retried = await finalizeOnboarding(actor, readyProfile, service, insights);
  assert.equal(retried.profile.onboardingCompletedAt, finalized.profile.onboardingCompletedAt);
  assert.equal(retried.workspaceSlug, workspace.slug);

  const incomplete = repository(profile({
    onboardingStatus: "IN_PROGRESS",
    onboardingStep: 5,
    countryCode: "CM",
    currency: "XAF",
    timezone: "Africa/Douala",
    onboardingWorkspaceId: workspace.id,
    onboardingStartingMethod: "MANUAL",
  }));
  await assert.rejects(
    () => finalizeOnboarding(actor, incomplete, service, insights),
    OnboardingFinalizationUnavailableError,
  );
});

test("Ready finalization accepts valid personal and shared Together outcomes", async () => {
  const workspaces = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(workspaces, "test-pepper");
  const insights = new InMemoryInsightRepository();
  const personal = await service.createWorkspace(actor, { name: "Private", type: "PERSONAL" });
  await insights.saveOnboardingPreference(personal.id, actor.userId, {
    goals: ["TRACK_SPENDING"],
    proactivity: "QUIET",
    dailyEnabled: false,
    weeklyEnabled: true,
    monthlyEnabled: true,
    minimumSeverity: "WARNING",
  });

  const personalProfile = repository(profile({
    onboardingStatus: "IN_PROGRESS",
    onboardingStep: null,
    countryCode: "CM",
    currency: "XAF",
    timezone: "Africa/Douala",
    onboardingWorkspaceId: personal.id,
    onboardingSkippedSteps: [3],
    onboardingStartingMethod: "MANUAL",
  }));
  assert.equal((await finalizeOnboarding(actor, personalProfile, service, insights)).profile.onboardingStatus, "COMPLETED");

  const shared = await service.createWorkspace(actor, { name: "House", type: "COUPLE" });
  await insights.saveOnboardingPreference(shared.id, actor.userId, {
    goals: ["TRACK_SPENDING", "MANAGE_TOGETHER"],
    proactivity: "PROACTIVE",
    dailyEnabled: true,
    weeklyEnabled: true,
    monthlyEnabled: true,
    minimumSeverity: "INFO",
  });
  const sharedProfile = repository(profile({
    onboardingStatus: "IN_PROGRESS",
    onboardingStep: null,
    countryCode: "CM",
    currency: "XAF",
    timezone: "Africa/Douala",
    onboardingWorkspaceId: shared.id,
    onboardingStartingMethod: "MANUAL",
  }));
  assert.equal((await finalizeOnboarding(actor, sharedProfile, service, insights)).profile.onboardingStatus, "COMPLETED");
});

test("Ready summaries use persisted values and localize every displayed enum", () => {
  const workspace = {
    id: "workspace-1",
    name: "House",
    slug: "house-workspace-1",
    type: "COUPLE" as const,
    createdByUserId: actor.userId,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
  };

  for (const language of ["en", "fr", "de"] as const) {
    const summary = createOnboardingReadySummary(
      profile({
        countryCode: "CM",
        currency: "XAF",
        onboardingStartingMethod: "IMPORT_STATEMENT",
        onboardingInvitationId: "invite-1",
      }),
      workspace,
      { proactivity: "BALANCED" },
      language,
    );
    const t = getOnboardingTranslations(language);
    assert.equal(summary.workspaceName, "House");
    assert.match(summary.countryCurrency, /XAF/);
    assert.equal(summary.workspaceType, "COUPLE");
    assert.equal(summary.proactivity, "BALANCED");
    assert.equal(summary.startingMethod, "IMPORT_STATEMENT");
    assert.ok(t("onboarding.ready.workspaceTypes.couple").length > 0);
    assert.ok(t("onboarding.ready.guidanceValues.balanced").length > 0);
    assert.ok(t("onboarding.ready.startingMethods.import_statement").length > 0);
    assert.ok(t("onboarding.ready.openPace").length > 0);
  }
});

test("PERSONAL Step 5 rejects MANAGE_TOGETHER even when a browser forges the enum", async () => {
  const workspaces = new InMemoryWorkspaceRepository();
  const service = new WorkspaceService(workspaces, "test-pepper");
  const workspace = await service.createWorkspace(actor, { name: "Private", type: "PERSONAL" });
  const profiles = repository(profile({
    onboardingStatus: "IN_PROGRESS",
    onboardingStep: 5,
    countryCode: "CM",
    currency: "XAF",
    timezone: "Africa/Douala",
    onboardingWorkspaceId: workspace.id,
    onboardingSkippedSteps: [3],
    onboardingStartingMethod: "MANUAL",
  }));

  await assert.rejects(
    () => persistPreferencesStep(actor, { goals: ["MANAGE_TOGETHER"], proactivity: "BALANCED" }, profiles, service, new InMemoryInsightRepository()),
  );
});
