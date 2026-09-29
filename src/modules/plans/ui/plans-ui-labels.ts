export type PlansUiLabels = {
  readonly title: string;
  readonly subtitle: string;
  readonly budgets: string;
  readonly savings: string;
  readonly overall: string;
  readonly period: string;
  readonly amount: string;
  readonly spent: string;
  readonly remaining: string;
  readonly progress: string;
  readonly target: string;
  readonly current: string;
  readonly targetDate: string;
  readonly active: string;
  readonly onTrack: string;
  readonly overBudget: string;
  readonly inactive: string;
  readonly budgetEmpty: string;
  readonly savingsEmpty: string;
};

const labels: Record<"en" | "fr" | "de", PlansUiLabels> = {
  en: {
    title: "Plans",
    subtitle: "Keep your monthly budgets and savings targets in view.",
    budgets: "Active budgets",
    savings: "Savings plans",
    overall: "Overall spending",
    period: "Period",
    amount: "Budget",
    spent: "Spent",
    remaining: "Remaining",
    progress: "Progress",
    target: "Target",
    current: "Current progress",
    targetDate: "Target date",
    active: "Active",
    onTrack: "On track",
    overBudget: "Over budget",
    inactive: "Inactive this period",
    budgetEmpty: "No active budgets for this period.",
    savingsEmpty: "No savings plans yet.",
  },
  fr: {
    title: "Plans",
    subtitle: "Gardez vos budgets mensuels et objectifs d’épargne à portée de vue.",
    budgets: "Budgets actifs",
    savings: "Plans d’épargne",
    overall: "Dépenses globales",
    period: "Période",
    amount: "Budget",
    spent: "Dépensé",
    remaining: "Restant",
    progress: "Progression",
    target: "Objectif",
    current: "Épargne actuelle",
    targetDate: "Date cible",
    active: "Actif",
    onTrack: "Dans les temps",
    overBudget: "Budget dépassé",
    inactive: "Inactif pour cette période",
    budgetEmpty: "Aucun budget actif pour cette période.",
    savingsEmpty: "Aucun plan d’épargne pour le moment.",
  },
  de: {
    title: "Pläne",
    subtitle: "Behalten Sie Ihre Monatsbudgets und Sparziele im Blick.",
    budgets: "Aktive Budgets",
    savings: "Sparpläne",
    overall: "Gesamtausgaben",
    period: "Zeitraum",
    amount: "Budget",
    spent: "Ausgegeben",
    remaining: "Verbleibend",
    progress: "Fortschritt",
    target: "Ziel",
    current: "Aktueller Stand",
    targetDate: "Zieldatum",
    active: "Aktiv",
    onTrack: "Im Plan",
    overBudget: "Budget überschritten",
    inactive: "In diesem Zeitraum inaktiv",
    budgetEmpty: "Keine aktiven Budgets für diesen Zeitraum.",
    savingsEmpty: "Noch keine Sparpläne.",
  },
};

export function getPlansUiLabels(language: "en" | "fr" | "de"): PlansUiLabels {
  return labels[language];
}
