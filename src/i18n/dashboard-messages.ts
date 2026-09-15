import type { WorkspaceType } from "@/modules/workspaces/domain";

export const DASHBOARD_LANGUAGES = ["en", "fr", "de"] as const;
export type DashboardLanguage = (typeof DASHBOARD_LANGUAGES)[number];

const dashboardMessages = {
  en: {
    "brand.name": "Pace",
    "brand.description": "Money tracking that takes care of itself.",
    "navigation.label": "Main navigation",
    "navigation.secondaryLabel": "Workspace navigation",
    "navigation.overview": "Overview",
    "navigation.inbox": "Inbox",
    "navigation.inboxCount": "Inbox, {count} unresolved",
    "navigation.transactions": "Transactions",
    "navigation.recurring": "Recurring",
    "navigation.plans": "Plans",
    "navigation.insights": "Insights",
    "navigation.import": "Import",
    "navigation.settings": "Settings",
    "workspace.switch": "Switch workspace",
    "workspace.create": "Create workspace",
    "workspace.join": "Join workspace",
    "workspace.create.title": "Create a workspace",
    "workspace.create.description": "Give your new workspace a name. You can change it later.",
    "workspace.create.preview": "Preview",
    "workspace.create.untitled": "Untitled workspace",
    "workspace.create.nameLabel": "Workspace name",
    "workspace.create.namePlaceholder": "e.g. House",
    "workspace.create.nameRequired": "Enter a workspace name.",
    "workspace.create.cancel": "Cancel",
    "workspace.create.submit": "Create workspace",
    "workspace.create.submitting": "Creating workspace…",
    "workspace.create.error": "We couldn’t create your workspace. Please try again.",
    "workspace.type.personal": "Personal workspace",
    "workspace.type.couple": "Couple workspace",
    "workspace.type.family": "Family workspace",
    "workspace.type.custom": "Workspace",
    "account.menu": "Open account menu",
    "account.profile": "Profile",
    "account.preferences": "Preferences",
    "account.signOut": "Sign out",
    "sidebar.expand": "Expand sidebar",
    "sidebar.collapse": "Collapse sidebar",
  },
  fr: {
    "brand.name": "Pace",
    "brand.description": "Suivez vos finances, simplement.",
    "navigation.label": "Navigation principale",
    "navigation.secondaryLabel": "Navigation de l’espace de travail",
    "navigation.overview": "Aperçu",
    "navigation.inbox": "Boîte de réception",
    "navigation.inboxCount": "Boîte de réception, {count} éléments non résolus",
    "navigation.transactions": "Transactions",
    "navigation.recurring": "Récurrent",
    "navigation.plans": "Plans",
    "navigation.insights": "Analyses",
    "navigation.import": "Importer",
    "navigation.settings": "Paramètres",
    "workspace.switch": "Changer d’espace de travail",
    "workspace.create": "Créer un espace de travail",
    "workspace.join": "Rejoindre un espace de travail",
    "workspace.create.title": "Créer un espace de travail",
    "workspace.create.description": "Donnez un nom à votre nouvel espace. Vous pourrez le modifier plus tard.",
    "workspace.create.preview": "Aperçu",
    "workspace.create.untitled": "Espace sans nom",
    "workspace.create.nameLabel": "Nom de l’espace",
    "workspace.create.namePlaceholder": "ex. Maison",
    "workspace.create.nameRequired": "Saisissez un nom pour l’espace.",
    "workspace.create.cancel": "Annuler",
    "workspace.create.submit": "Créer l’espace",
    "workspace.create.submitting": "Création de l’espace…",
    "workspace.create.error": "Impossible de créer votre espace. Réessayez.",
    "workspace.type.personal": "Espace personnel",
    "workspace.type.couple": "Espace couple",
    "workspace.type.family": "Espace famille",
    "workspace.type.custom": "Espace de travail",
    "account.menu": "Ouvrir le menu du compte",
    "account.profile": "Profil",
    "account.preferences": "Préférences",
    "account.signOut": "Se déconnecter",
    "sidebar.expand": "Développer la barre latérale",
    "sidebar.collapse": "Réduire la barre latérale",
  },
  de: {
    "brand.name": "Pace",
    "brand.description": "Finanzen einfach im Blick.",
    "navigation.label": "Hauptnavigation",
    "navigation.secondaryLabel": "Arbeitsbereich-Navigation",
    "navigation.overview": "Übersicht",
    "navigation.inbox": "Posteingang",
    "navigation.inboxCount": "Posteingang, {count} offene Elemente",
    "navigation.transactions": "Transaktionen",
    "navigation.recurring": "Wiederkehrend",
    "navigation.plans": "Pläne",
    "navigation.insights": "Einblicke",
    "navigation.import": "Importieren",
    "navigation.settings": "Einstellungen",
    "workspace.switch": "Arbeitsbereich wechseln",
    "workspace.create": "Arbeitsbereich erstellen",
    "workspace.join": "Arbeitsbereich beitreten",
    "workspace.create.title": "Arbeitsbereich erstellen",
    "workspace.create.description": "Geben Sie Ihrem neuen Arbeitsbereich einen Namen. Sie können ihn später ändern.",
    "workspace.create.preview": "Vorschau",
    "workspace.create.untitled": "Unbenannter Arbeitsbereich",
    "workspace.create.nameLabel": "Name des Arbeitsbereichs",
    "workspace.create.namePlaceholder": "z. B. Zuhause",
    "workspace.create.nameRequired": "Geben Sie einen Namen für den Arbeitsbereich ein.",
    "workspace.create.cancel": "Abbrechen",
    "workspace.create.submit": "Arbeitsbereich erstellen",
    "workspace.create.submitting": "Arbeitsbereich wird erstellt…",
    "workspace.create.error": "Ihr Arbeitsbereich konnte nicht erstellt werden. Versuchen Sie es erneut.",
    "workspace.type.personal": "Persönlicher Arbeitsbereich",
    "workspace.type.couple": "Arbeitsbereich für Paare",
    "workspace.type.family": "Familien-Arbeitsbereich",
    "workspace.type.custom": "Arbeitsbereich",
    "account.menu": "Kontomenü öffnen",
    "account.profile": "Profil",
    "account.preferences": "Einstellungen",
    "account.signOut": "Abmelden",
    "sidebar.expand": "Seitenleiste erweitern",
    "sidebar.collapse": "Seitenleiste reduzieren",
  },
} as const;

export type DashboardMessageKey = keyof (typeof dashboardMessages)["en"];
export type DashboardLabels = Readonly<Record<DashboardMessageKey, string>>;

export const workspaceTypeMessageKeys: Record<WorkspaceType, DashboardMessageKey> = {
  PERSONAL: "workspace.type.personal",
  COUPLE: "workspace.type.couple",
  FAMILY: "workspace.type.family",
  CUSTOM: "workspace.type.custom",
};

export function toDashboardLanguage(value: string | null | undefined): DashboardLanguage {
  return value === "fr" || value === "de" ? value : "en";
}

export function getDashboardLabels(language: string | null | undefined): DashboardLabels {
  return dashboardMessages[toDashboardLanguage(language)];
}

export function formatDashboardLabel(
  labels: DashboardLabels,
  key: DashboardMessageKey,
  variables: Record<string, string | number> = {},
): string {
  return Object.entries(variables).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    labels[key],
  );
}
