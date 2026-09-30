export type PlansUiLabels = {
  readonly createBudget: Readonly<Record<string, string>>;
  readonly title: string;
  readonly subtitle: string;
  readonly budgets: string;
  readonly all: string;
  readonly goals: string;
  readonly forecasts: string;
  readonly rules: string;
  readonly askPace: string;
  readonly newPlan: string;
  readonly monthlyBudgets: string;
  readonly monthlyBudgetsSubtitle: string;
  readonly budgeted: string;
  readonly spent: string;
  readonly remaining: string;
  readonly used: string;
  readonly overall: string;
  readonly status: string;
  readonly onTrack: string;
  readonly attention: string;
  readonly overBudget: string;
  readonly inactive: string;
  readonly savings: string;
  readonly savingsSubtitle: string;
  readonly seeAll: string;
  readonly target: string;
  readonly saved: string;
  readonly left: string;
  readonly targetDate: string;
  readonly budgetEmpty: string;
  readonly savingsEmpty: string;
  readonly planInsights: string;
  readonly insightOverBudget: string;
  readonly insightAttention: string;
  readonly insightOnTrack: string;
  readonly unavailable: string;
  readonly loading: string;
  readonly progress: string;
  readonly timeline: string;
  readonly transactions: string;
  readonly insights: string;
  readonly details: string;
  readonly emptyTransactions: string;
  readonly more: string;
  readonly actualSpending: string;
  readonly period: string;
  readonly category: string;
};

const createBudgetLabels = {
  close: "Close", title: "New budget", subtitle: "Set a spending limit for a category and track your progress.",
  basicInfo: "Basic info", budgetName: "Budget name", budgetNameValue: "Food & dining", budgetNameHint: "Choose a clear name for this budget.", iconAndColour: "Icon and colour",
  description: "Description", optional: "(optional)", descriptionValue: "Restaurants, groceries, cafés and get-togethers…", categoryScope: "Category & scope", mainCategory: "Main category", subcategories: "Subcategories", subcategoriesValue: "Restaurants · Groceries · Cafés",
  amountPeriod: "Amount & period", budgetAmount: "Budget amount", amountValue: "120,000", currency: "FCFA", period: "Period", monthly: "Monthly", weekly: "Weekly", custom: "Custom", periodValue: "September 2026",
  advancedOptions: "Advanced options", notifyTitle: "Notify me when I’m nearing the limit", notifyHint: "Receive a reminder at 80% of your budget.", resetTitle: "Automatic reset", resetHint: "Start fresh at the beginning of each period.",
  preview: "Preview", previewDescription: "Restaurants, groceries, cafés…", category: "Category", amount: "Amount", progressExample: "Progress example", progressValue: "86,400 / 120,000 FCFA", notice: "This budget will begin on 1 September 2026 and reset automatically on 1 October 2026.", cancel: "Cancel", create: "Create budget",
};

const labels: Record<"en" | "fr" | "de", PlansUiLabels> = {
  en: {
    createBudget: createBudgetLabels,
    title: "Plans",
    subtitle: "Plan your budgets and savings goals with clarity.",
    budgets: "Budgets",
    all: "All",
    goals: "Goals",
    forecasts: "Forecasts",
    rules: "Rules",
    askPace: "Ask Pace",
    newPlan: "New plan",
    monthlyBudgets: "Monthly budgets",
    monthlyBudgetsSubtitle: "Track your category spending this month.",
    budgeted: "Budgeted",
    spent: "Spent",
    remaining: "Remaining",
    used: "% used",
    overall: "Overall spending",
    status: "Status",
    onTrack: "On track",
    attention: "Attention",
    overBudget: "Over budget",
    inactive: "Inactive",
    savings: "Savings goals",
    savingsSubtitle: "Move your projects forward faster.",
    seeAll: "See all",
    target: "Target",
    saved: "saved",
    left: "left",
    targetDate: "Target date",
    budgetEmpty: "No active budgets for this period.",
    savingsEmpty: "No savings goals yet.",
    planInsights: "Plan insights",
    insightOverBudget: "A budget needs attention",
    insightAttention: "A category is nearing its budget",
    insightOnTrack: "Your budgets are on track",
    unavailable: "This section is not available yet.",
    loading: "Updating plan…",
    progress: "Budget progress", timeline: "Spending over time", transactions: "Budget transactions", insights: "Budget insights", details: "Budget details", emptyTransactions: "No contributing transactions yet.",
    more: "More options", actualSpending: "Actual posted spending", period: "Period", category: "Category",
  },
  fr: {
    createBudget: createBudgetLabels,
    title: "Plans",
    subtitle: "Planifiez vos budgets et objectifs d’épargne en toute clarté.",
    budgets: "Budgets",
    all: "Tout",
    goals: "Objectifs",
    forecasts: "Prévisions",
    rules: "Règles",
    askPace: "Demander à Pace",
    newPlan: "Nouveau plan",
    monthlyBudgets: "Budgets mensuels",
    monthlyBudgetsSubtitle:
      "Suivez vos dépenses par catégorie pour ce mois-ci.",
    budgeted: "Budgété",
    spent: "Dépensé",
    remaining: "Restant",
    used: "% utilisé",
    overall: "Dépenses globales",
    status: "Statut",
    onTrack: "Sur la bonne voie",
    attention: "Attention",
    overBudget: "Budget dépassé",
    inactive: "Inactif",
    savings: "Objectifs d’épargne",
    savingsSubtitle: "Avancez vers vos projets plus rapidement.",
    seeAll: "Tout voir",
    target: "Objectif",
    saved: "épargnés",
    left: "restant",
    targetDate: "Date cible",
    budgetEmpty: "Aucun budget actif pour cette période.",
    savingsEmpty: "Aucun objectif d’épargne pour le moment.",
    planInsights: "Aperçus du plan",
    insightOverBudget: "Un budget demande votre attention",
    insightAttention: "Une catégorie approche de son budget",
    insightOnTrack: "Vos budgets sont sur la bonne voie",
    unavailable: "Cette section n’est pas encore disponible.",
    loading: "Mise à jour du plan…",
    progress: "Progression du budget", timeline: "Dépenses dans le temps", transactions: "Transactions de ce budget", insights: "Aperçus du budget", details: "Détails du budget", emptyTransactions: "Aucune transaction contributrice pour le moment.",
    more: "Plus d’options", actualSpending: "Dépenses comptabilisées réelles", period: "Période", category: "Catégorie",
  },
  de: {
    createBudget: createBudgetLabels,
    title: "Pläne",
    subtitle: "Planen Sie Ihre Budgets und Sparziele mit Klarheit.",
    budgets: "Budgets",
    all: "Alle",
    goals: "Ziele",
    forecasts: "Prognosen",
    rules: "Regeln",
    askPace: "Pace fragen",
    newPlan: "Neuer Plan",
    monthlyBudgets: "Monatliche Budgets",
    monthlyBudgetsSubtitle:
      "Verfolgen Sie Ihre Ausgaben nach Kategorie in diesem Monat.",
    budgeted: "Budgetiert",
    spent: "Ausgegeben",
    remaining: "Verbleibend",
    used: "% verwendet",
    overall: "Gesamtausgaben",
    status: "Status",
    onTrack: "Im Plan",
    attention: "Achtung",
    overBudget: "Budget überschritten",
    inactive: "Inaktiv",
    savings: "Sparziele",
    savingsSubtitle: "Bringen Sie Ihre Projekte schneller voran.",
    seeAll: "Alle anzeigen",
    target: "Ziel",
    saved: "gespart",
    left: "übrig",
    targetDate: "Zieldatum",
    budgetEmpty: "Keine aktiven Budgets für diesen Zeitraum.",
    savingsEmpty: "Noch keine Sparziele.",
    planInsights: "Planübersicht",
    insightOverBudget: "Ein Budget braucht Aufmerksamkeit",
    insightAttention: "Eine Kategorie nähert sich ihrem Budget",
    insightOnTrack: "Ihre Budgets liegen im Plan",
    unavailable: "Dieser Bereich ist noch nicht verfügbar.",
    loading: "Plan wird aktualisiert…",
    progress: "Budgetfortschritt", timeline: "Ausgaben im Zeitverlauf", transactions: "Budgettransaktionen", insights: "Budgeteinblicke", details: "Budgetdetails", emptyTransactions: "Noch keine berücksichtigten Transaktionen.",
    more: "Weitere Optionen", actualSpending: "Tatsächlich gebuchte Ausgaben", period: "Zeitraum", category: "Kategorie",
  },
};

export function getPlansUiLabels(language: "en" | "fr" | "de"): PlansUiLabels {
  return labels[language];
}
