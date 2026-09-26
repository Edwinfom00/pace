import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDashboardLabel,
  getDashboardLabels,
  toDashboardLanguage,
  workspaceTypeMessageKeys,
} from "@/i18n/dashboard-messages";

test("dashboard navigation labels are available in English, French, and German", () => {
  assert.equal(getDashboardLabels("en")["navigation.overview"], "Overview");
  assert.equal(getDashboardLabels("fr")["navigation.overview"], "Aperçu");
  assert.equal(getDashboardLabels("de")["navigation.overview"], "Übersicht");
});

test("dashboard locale resolution preserves German and safely falls back to English", () => {
  assert.equal(toDashboardLanguage("de"), "de");
  assert.equal(toDashboardLanguage("fr"), "fr");
  assert.equal(toDashboardLanguage("es"), "en");
});

test("dashboard labels format the inbox count and workspace types", () => {
  const labels = getDashboardLabels("en");

  assert.equal(
    formatDashboardLabel(labels, "navigation.inboxCount", { count: 4 }),
    "Inbox, 4 unresolved",
  );
  assert.equal(labels[workspaceTypeMessageKeys.COUPLE], "Couple workspace");
});

test("Inbox category resolution copy is available in English, French, and German", () => {
  assert.equal(getDashboardLabels("en")["inbox.category.chooseAnother"], "Choose another category");
  assert.equal(getDashboardLabels("fr")["inbox.category.dialog.title"], "Choisir une catégorie");
  assert.equal(getDashboardLabels("de")["inbox.category.save"], "Kategorie speichern");
});
