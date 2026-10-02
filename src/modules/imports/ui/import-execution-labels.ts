import type { DashboardLanguage } from "@/i18n/dashboard-messages";
import type { TransactionUiLabels } from "@/modules/transactions/ui/transaction-ui-labels";

import type { ImportField } from "../domain";
import type { ImportBlockingIssueCode } from "../review";
import { getImportMappingLabels } from "./import-mapping-labels";

export const IMPORT_EXECUTION_ERROR_CODES = [
  "IMPORT_ACCOUNT_UNAVAILABLE",
  "IMPORT_TRANSFER_ACCOUNT_INVALID",
  "IMPORT_SESSION_STALE",
  "IMPORT_NOT_READY",
  "IMPORT_STALLED",
  "INVALID_ROW_CORRECTION",
  "FORBIDDEN",
  "NETWORK",
  "GENERIC",
] as const;

export type ImportExecutionErrorCode = (typeof IMPORT_EXECUTION_ERROR_CODES)[number];

export type ImportExecutionStep = "prepare" | "validate" | "import" | "finalize";

export type ImportExecutionLabels = {
  readonly title: string;
  readonly description: string;
  readonly rowsOne: string;
  readonly rowsOther: string;
  readonly summaryTitle: string;
  readonly toImport: string;
  readonly toImportHint: string;
  readonly toInbox: string;
  readonly toInboxHint: string;
  readonly duplicates: string;
  readonly duplicatesHint: string;
  readonly blocking: string;
  readonly blockingHint: string;
  readonly dateRange: string;
  readonly accountTitle: string;
  readonly accountLabel: string;
  readonly accountHint: string;
  readonly transferAccountLabel: string;
  readonly transferAccountHint: string;
  readonly transferAccountNone: string;
  readonly updatingReview: string;
  readonly accountsTitle: string;
  readonly accountsDescription: string;
  readonly destinationsTitle: string;
  readonly destinationsDescription: string;
  readonly defaultAccountLabel: string;
  readonly defaultAccountHint: string;
  readonly paceAccount: string;
  readonly matchedByName: string;
  readonly notInPace: string;
  readonly suggestedAccount: string;
  readonly createSuggested: string;
  readonly chooseAccount: string;
  readonly fixTitle: string;
  readonly fixDescription: string;
  readonly fixInFile: string;
  readonly fixEmptyInFile: string;
  readonly accountBlockedOne: string;
  readonly accountBlockedOther: string;
  readonly accountBlockedHint: string;
  readonly fixApply: string;
  readonly fixSkip: string;
  readonly fixSaving: string;
  readonly fixApplied: string;
  readonly skippedSummaryOne: string;
  readonly skippedSummaryOther: string;
  readonly restoreSkipped: string;
  readonly accountCreated: string;
  readonly fields: Readonly<Record<ImportField, string>>;
  readonly blockingTitle: string;
  readonly blockingDescription: string;
  readonly blockingRow: string;
  readonly blockingMore: string;
  readonly fixMapping: string;
  readonly issues: Readonly<Record<ImportBlockingIssueCode, string>>;
  readonly nothingTitle: string;
  readonly nothingDescription: string;
  readonly safeTitle: string;
  readonly safeDescription: string;
  readonly back: string;
  readonly importActionOne: string;
  readonly importActionOther: string;
  readonly progressTitle: string;
  readonly progressDescription: string;
  readonly progressLabel: string;
  readonly progressRows: string;
  readonly progressWaiting: string;
  readonly progressKeepOpen: string;
  readonly steps: Readonly<Record<ImportExecutionStep, string>>;
  readonly stepDone: string;
  readonly stepActive: string;
  readonly stepPending: string;
  readonly resultTitle: string;
  readonly resultPartialTitle: string;
  readonly resultDescription: string;
  readonly resultPartialDescription: string;
  readonly resultImported: string;
  readonly resultInbox: string;
  readonly resultDuplicates: string;
  readonly resultFailed: string;
  readonly resultFailedRows: string;
  readonly resultDeferred: string;
  readonly viewTransactions: string;
  readonly openInbox: string;
  readonly importAnother: string;
  readonly retryFailed: string;
  readonly retry: string;
  readonly staleTitle: string;
  readonly staleDescription: string;
  readonly staleAction: string;
  readonly errors: Readonly<Record<ImportExecutionErrorCode, string>>;
};

const en: Omit<ImportExecutionLabels, "fields"> = {
  title: "Review import",
  description: "Check what Pace will do with your file before anything is added.",
  rowsOne: "{count} row",
  rowsOther: "{count} rows",
  summaryTitle: "What happens to each row",
  toImport: "To import",
  toImportHint: "Added as Pace transactions",
  toInbox: "Sent to Inbox",
  toInboxHint: "Likely matches to review, never merged",
  duplicates: "Duplicates ignored",
  duplicatesHint: "Already in Pace or repeated in the file",
  blocking: "Blocking errors",
  blockingHint: "Must be fixed before importing",
  dateRange: "{start} – {end}",
  accountTitle: "Destination",
  accountLabel: "Import into",
  accountHint: "Every row is added to this account.",
  transferAccountLabel: "Transfers go to",
  transferAccountHint: "Rows marked as transfers move money into this account.",
  transferAccountNone: "Choose an account",
  updatingReview: "Updating review…",
  accountsTitle: "Accounts in your file",
  accountsDescription: "Each row goes to the Pace account matching its file account.",
  destinationsTitle: "Transfer destinations",
  destinationsDescription: "Where your file's transfers send the money.",
  defaultAccountLabel: "Rows without an account",
  defaultAccountHint: "Rows that don't name an account are added here.",
  paceAccount: "Pace account",
  matchedByName: "Matched by name",
  notInPace: "Not in Pace yet",
  suggestedAccount: "Suggested: {type} · {currency}",
  createSuggested: "Create “{name}”",
  chooseAccount: "Choose an account",
  fixTitle: "Fix rows",
  fixDescription: "Correct a value here or skip the row — your file isn't changed.",
  fixInFile: "In file: {value}",
  fixEmptyInFile: "Empty in file",
  accountBlockedOne: "{count} row is waiting for its account",
  accountBlockedOther: "{count} rows are waiting for their account",
  accountBlockedHint: "Link or create the accounts in the Accounts panel — these rows fix themselves.",
  fixApply: "Apply",
  fixSkip: "Skip row",
  fixSaving: "Saving…",
  fixApplied: "Row {row} updated.",
  skippedSummaryOne: "{count} row skipped",
  skippedSummaryOther: "{count} rows skipped",
  restoreSkipped: "Restore",
  accountCreated: "{name} created and selected.",
  blockingTitle: "Some rows need fixing",
  blockingDescription: "Pace can't import this file until these rows are fixed in the file or the column mapping.",
  blockingRow: "Row {row}",
  blockingMore: "+{count} more",
  fixMapping: "Edit column mapping",
  issues: {
    ACCOUNT_UNASSIGNED: "Account isn't linked to Pace yet",
    TRANSFER_CURRENCY_MISMATCH: "Transfer accounts use different currencies",
    ACCOUNT_CURRENCY_MISMATCH: "Currency doesn't match the account",
    AMBIGUOUS_DATE: "Date could be day/month or month/day",
    BOTH_DEBIT_AND_CREDIT: "Has both a debit and a credit",
    INVALID_AMOUNT: "Amount can't be read",
    INVALID_CURRENCY: "Currency code isn't valid",
    INVALID_DATE: "Date can't be read",
    MISSING_AMOUNT: "Amount is missing",
    MISSING_CURRENCY: "Currency is missing",
    MISSING_DATE: "Date is missing",
    MISSING_DESCRIPTION: "Description is missing",
    SIGNED_DIRECTION_REQUIRED: "Amount direction is unclear",
    TEXT_TOO_LONG: "Text is too long",
    TRANSFER_ACCOUNT_REQUIRED: "Transfer needs a destination account",
    TRANSFER_SAME_ACCOUNT: "Transfer can't go to the same account",
    OTHER: "Row can't be imported",
  },
  nothingTitle: "Nothing new to import",
  nothingDescription: "Every row in this file is already in Pace.",
  safeTitle: "Your existing data is safe",
  safeDescription: "Exact duplicates are skipped automatically. Likely matches are imported and sent to Inbox for you to decide.",
  back: "Back",
  importActionOne: "Import {count} transaction",
  importActionOther: "Import {count} transactions",
  progressTitle: "Importing your transactions",
  progressDescription: "Pace is adding each row through the same checks as a manual transaction.",
  progressLabel: "Import progress",
  progressRows: "{processed} of {total} rows",
  progressWaiting: "Waiting for Pace…",
  progressKeepOpen: "Keep this page open until the import finishes.",
  steps: { prepare: "Prepare", validate: "Validate", import: "Import", finalize: "Finalize" },
  stepDone: "done",
  stepActive: "in progress",
  stepPending: "waiting",
  resultTitle: "Import complete",
  resultPartialTitle: "Import finished with issues",
  resultDescription: "Your transactions are in Pace and your balances are up to date.",
  resultPartialDescription: "Some rows couldn't be imported. Everything else is in Pace.",
  resultImported: "Imported",
  resultInbox: "Sent to Inbox",
  resultDuplicates: "Duplicates skipped",
  resultFailed: "Failed",
  resultFailedRows: "Rows that failed: {rows}",
  resultDeferred: "Some transactions are still being categorized. They'll appear in Inbox shortly if they need you.",
  viewTransactions: "View transactions",
  openInbox: "Open Inbox",
  importAnother: "Import another file",
  retryFailed: "Retry failed rows",
  retry: "Try again",
  staleTitle: "This import is no longer available",
  staleDescription: "Temporary import data expires after 24 hours or when an import is cancelled. Upload the file again to continue.",
  staleAction: "Upload a file",
  errors: {
    IMPORT_ACCOUNT_UNAVAILABLE: "The selected account is no longer available. Choose another account.",
    IMPORT_TRANSFER_ACCOUNT_INVALID: "Choose a different account with the same currency for transfers.",
    IMPORT_SESSION_STALE: "This import changed or expired. Upload the file again.",
    IMPORT_NOT_READY: "This import isn't ready yet. Fix the blocking errors and try again.",
    INVALID_ROW_CORRECTION: "This value couldn't be applied. Refresh the page and try again.",
    IMPORT_STALLED: "The import stopped responding. Try again — rows already imported won't be added twice.",
    FORBIDDEN: "You don't have permission to import transactions in this workspace.",
    NETWORK: "Pace couldn't be reached. Check your connection and try again.",
    GENERIC: "Something went wrong. Please try again.",
  },
};

const fr: Omit<ImportExecutionLabels, "fields"> = {
  title: "Vérifier l'import",
  description: "Vérifiez ce que Pace va faire de votre fichier avant tout ajout.",
  rowsOne: "{count} ligne",
  rowsOther: "{count} lignes",
  summaryTitle: "Ce qui arrive à chaque ligne",
  toImport: "À importer",
  toImportHint: "Ajoutées comme transactions Pace",
  toInbox: "Envoyées dans la boîte",
  toInboxHint: "Correspondances probables à vérifier, jamais fusionnées",
  duplicates: "Doublons ignorés",
  duplicatesHint: "Déjà dans Pace ou répétées dans le fichier",
  blocking: "Erreurs bloquantes",
  blockingHint: "À corriger avant l'import",
  dateRange: "{start} – {end}",
  accountTitle: "Destination",
  accountLabel: "Importer dans",
  accountHint: "Chaque ligne est ajoutée à ce compte.",
  transferAccountLabel: "Les virements vont vers",
  transferAccountHint: "Les lignes marquées comme virements transfèrent l'argent vers ce compte.",
  transferAccountNone: "Choisir un compte",
  updatingReview: "Mise à jour…",
  accountsTitle: "Comptes dans votre fichier",
  accountsDescription: "Chaque ligne va vers le compte Pace correspondant à son compte dans le fichier.",
  destinationsTitle: "Destinations des virements",
  destinationsDescription: "Où les virements de votre fichier envoient l'argent.",
  defaultAccountLabel: "Lignes sans compte",
  defaultAccountHint: "Les lignes qui ne précisent pas de compte sont ajoutées ici.",
  paceAccount: "Compte Pace",
  matchedByName: "Associé par le nom",
  notInPace: "Pas encore dans Pace",
  suggestedAccount: "Suggestion : {type} · {currency}",
  createSuggested: "Créer « {name} »",
  chooseAccount: "Choisir un compte",
  fixTitle: "Corriger les lignes",
  fixDescription: "Corrigez une valeur ici ou ignorez la ligne — votre fichier n'est pas modifié.",
  fixInFile: "Dans le fichier : {value}",
  fixEmptyInFile: "Vide dans le fichier",
  accountBlockedOne: "{count} ligne attend son compte",
  accountBlockedOther: "{count} lignes attendent leur compte",
  accountBlockedHint: "Reliez ou créez les comptes dans le panneau Comptes — ces lignes se corrigent automatiquement.",
  fixApply: "Appliquer",
  fixSkip: "Ignorer la ligne",
  fixSaving: "Enregistrement…",
  fixApplied: "Ligne {row} mise à jour.",
  skippedSummaryOne: "{count} ligne ignorée",
  skippedSummaryOther: "{count} lignes ignorées",
  restoreSkipped: "Restaurer",
  accountCreated: "{name} créé et sélectionné.",
  blockingTitle: "Certaines lignes doivent être corrigées",
  blockingDescription: "Pace ne peut pas importer ce fichier tant que ces lignes ne sont pas corrigées dans le fichier ou la correspondance des colonnes.",
  blockingRow: "Ligne {row}",
  blockingMore: "+{count} autres",
  fixMapping: "Modifier la correspondance",
  issues: {
    ACCOUNT_UNASSIGNED: "Compte pas encore relié à Pace",
    TRANSFER_CURRENCY_MISMATCH: "Les comptes du virement ont des devises différentes",
    ACCOUNT_CURRENCY_MISMATCH: "La devise ne correspond pas au compte",
    AMBIGUOUS_DATE: "La date peut être jour/mois ou mois/jour",
    BOTH_DEBIT_AND_CREDIT: "Contient un débit et un crédit",
    INVALID_AMOUNT: "Montant illisible",
    INVALID_CURRENCY: "Code devise invalide",
    INVALID_DATE: "Date illisible",
    MISSING_AMOUNT: "Montant manquant",
    MISSING_CURRENCY: "Devise manquante",
    MISSING_DATE: "Date manquante",
    MISSING_DESCRIPTION: "Description manquante",
    SIGNED_DIRECTION_REQUIRED: "Sens du montant incertain",
    TEXT_TOO_LONG: "Texte trop long",
    TRANSFER_ACCOUNT_REQUIRED: "Le virement nécessite un compte de destination",
    TRANSFER_SAME_ACCOUNT: "Le virement ne peut pas aller vers le même compte",
    OTHER: "Ligne impossible à importer",
  },
  nothingTitle: "Rien de nouveau à importer",
  nothingDescription: "Toutes les lignes de ce fichier sont déjà dans Pace.",
  safeTitle: "Vos données existantes sont protégées",
  safeDescription: "Les doublons exacts sont ignorés automatiquement. Les correspondances probables sont importées et envoyées dans la boîte pour que vous décidiez.",
  back: "Retour",
  importActionOne: "Importer {count} transaction",
  importActionOther: "Importer {count} transactions",
  progressTitle: "Import de vos transactions",
  progressDescription: "Pace ajoute chaque ligne avec les mêmes contrôles qu'une transaction manuelle.",
  progressLabel: "Progression de l'import",
  progressRows: "{processed} sur {total} lignes",
  progressWaiting: "En attente de Pace…",
  progressKeepOpen: "Gardez cette page ouverte jusqu'à la fin de l'import.",
  steps: { prepare: "Préparer", validate: "Valider", import: "Importer", finalize: "Finaliser" },
  stepDone: "terminé",
  stepActive: "en cours",
  stepPending: "en attente",
  resultTitle: "Import terminé",
  resultPartialTitle: "Import terminé avec des problèmes",
  resultDescription: "Vos transactions sont dans Pace et vos soldes sont à jour.",
  resultPartialDescription: "Certaines lignes n'ont pas pu être importées. Tout le reste est dans Pace.",
  resultImported: "Importées",
  resultInbox: "Envoyées dans la boîte",
  resultDuplicates: "Doublons ignorés",
  resultFailed: "Échecs",
  resultFailedRows: "Lignes en échec : {rows}",
  resultDeferred: "Certaines transactions sont encore en cours de catégorisation. Elles apparaîtront bientôt dans la boîte si elles ont besoin de vous.",
  viewTransactions: "Voir les transactions",
  openInbox: "Ouvrir la boîte",
  importAnother: "Importer un autre fichier",
  retryFailed: "Réessayer les lignes en échec",
  retry: "Réessayer",
  staleTitle: "Cet import n'est plus disponible",
  staleDescription: "Les données d'import temporaires expirent après 24 heures ou lorsqu'un import est annulé. Importez à nouveau le fichier pour continuer.",
  staleAction: "Importer un fichier",
  errors: {
    IMPORT_ACCOUNT_UNAVAILABLE: "Le compte sélectionné n'est plus disponible. Choisissez un autre compte.",
    IMPORT_TRANSFER_ACCOUNT_INVALID: "Choisissez un autre compte dans la même devise pour les virements.",
    IMPORT_SESSION_STALE: "Cet import a changé ou a expiré. Importez à nouveau le fichier.",
    IMPORT_NOT_READY: "Cet import n'est pas encore prêt. Corrigez les erreurs bloquantes et réessayez.",
    INVALID_ROW_CORRECTION: "Cette valeur n'a pas pu être appliquée. Actualisez la page et réessayez.",
    IMPORT_STALLED: "L'import ne répond plus. Réessayez : les lignes déjà importées ne seront pas ajoutées deux fois.",
    FORBIDDEN: "Vous n'avez pas l'autorisation d'importer des transactions dans cet espace.",
    NETWORK: "Impossible de joindre Pace. Vérifiez votre connexion et réessayez.",
    GENERIC: "Un problème est survenu. Veuillez réessayer.",
  },
};

const de: Omit<ImportExecutionLabels, "fields"> = {
  title: "Import prüfen",
  description: "Prüfen Sie, was Pace mit Ihrer Datei macht, bevor etwas hinzugefügt wird.",
  rowsOne: "{count} Zeile",
  rowsOther: "{count} Zeilen",
  summaryTitle: "Was mit jeder Zeile passiert",
  toImport: "Zu importieren",
  toImportHint: "Als Pace-Transaktionen hinzugefügt",
  toInbox: "An Inbox gesendet",
  toInboxHint: "Wahrscheinliche Treffer zur Prüfung, nie zusammengeführt",
  duplicates: "Ignorierte Duplikate",
  duplicatesHint: "Bereits in Pace oder in der Datei wiederholt",
  blocking: "Blockierende Fehler",
  blockingHint: "Vor dem Import zu beheben",
  dateRange: "{start} – {end}",
  accountTitle: "Ziel",
  accountLabel: "Importieren in",
  accountHint: "Jede Zeile wird diesem Konto hinzugefügt.",
  transferAccountLabel: "Überweisungen gehen an",
  transferAccountHint: "Als Überweisung markierte Zeilen bewegen Geld auf dieses Konto.",
  transferAccountNone: "Konto wählen",
  updatingReview: "Wird aktualisiert…",
  accountsTitle: "Konten in Ihrer Datei",
  accountsDescription: "Jede Zeile geht an das Pace-Konto, das zu ihrem Konto in der Datei passt.",
  destinationsTitle: "Überweisungsziele",
  destinationsDescription: "Wohin die Überweisungen Ihrer Datei das Geld schicken.",
  defaultAccountLabel: "Zeilen ohne Konto",
  defaultAccountHint: "Zeilen ohne Kontoangabe werden hier hinzugefügt.",
  paceAccount: "Pace-Konto",
  matchedByName: "Nach Name zugeordnet",
  notInPace: "Noch nicht in Pace",
  suggestedAccount: "Vorschlag: {type} · {currency}",
  createSuggested: "„{name}“ erstellen",
  chooseAccount: "Konto wählen",
  fixTitle: "Zeilen korrigieren",
  fixDescription: "Korrigieren Sie hier einen Wert oder überspringen Sie die Zeile – Ihre Datei bleibt unverändert.",
  fixInFile: "In der Datei: {value}",
  fixEmptyInFile: "In der Datei leer",
  accountBlockedOne: "{count} Zeile wartet auf ihr Konto",
  accountBlockedOther: "{count} Zeilen warten auf ihr Konto",
  accountBlockedHint: "Verknüpfen oder erstellen Sie die Konten im Bereich Konten – diese Zeilen werden dann automatisch korrigiert.",
  fixApply: "Übernehmen",
  fixSkip: "Zeile überspringen",
  fixSaving: "Wird gespeichert…",
  fixApplied: "Zeile {row} aktualisiert.",
  skippedSummaryOne: "{count} Zeile übersprungen",
  skippedSummaryOther: "{count} Zeilen übersprungen",
  restoreSkipped: "Wiederherstellen",
  accountCreated: "{name} erstellt und ausgewählt.",
  blockingTitle: "Einige Zeilen müssen korrigiert werden",
  blockingDescription: "Pace kann diese Datei erst importieren, wenn diese Zeilen in der Datei oder in der Spaltenzuordnung korrigiert sind.",
  blockingRow: "Zeile {row}",
  blockingMore: "+{count} weitere",
  fixMapping: "Spaltenzuordnung bearbeiten",
  issues: {
    ACCOUNT_UNASSIGNED: "Konto noch nicht mit Pace verknüpft",
    TRANSFER_CURRENCY_MISMATCH: "Überweisungskonten haben unterschiedliche Währungen",
    ACCOUNT_CURRENCY_MISMATCH: "Währung passt nicht zum Konto",
    AMBIGUOUS_DATE: "Datum kann Tag/Monat oder Monat/Tag sein",
    BOTH_DEBIT_AND_CREDIT: "Enthält Soll und Haben",
    INVALID_AMOUNT: "Betrag nicht lesbar",
    INVALID_CURRENCY: "Ungültiger Währungscode",
    INVALID_DATE: "Datum nicht lesbar",
    MISSING_AMOUNT: "Betrag fehlt",
    MISSING_CURRENCY: "Währung fehlt",
    MISSING_DATE: "Datum fehlt",
    MISSING_DESCRIPTION: "Beschreibung fehlt",
    SIGNED_DIRECTION_REQUIRED: "Richtung des Betrags unklar",
    TEXT_TOO_LONG: "Text zu lang",
    TRANSFER_ACCOUNT_REQUIRED: "Überweisung braucht ein Zielkonto",
    TRANSFER_SAME_ACCOUNT: "Überweisung kann nicht auf dasselbe Konto gehen",
    OTHER: "Zeile kann nicht importiert werden",
  },
  nothingTitle: "Nichts Neues zu importieren",
  nothingDescription: "Alle Zeilen dieser Datei sind bereits in Pace.",
  safeTitle: "Ihre vorhandenen Daten sind sicher",
  safeDescription: "Exakte Duplikate werden automatisch übersprungen. Wahrscheinliche Treffer werden importiert und zur Entscheidung an die Inbox gesendet.",
  back: "Zurück",
  importActionOne: "{count} Transaktion importieren",
  importActionOther: "{count} Transaktionen importieren",
  progressTitle: "Ihre Transaktionen werden importiert",
  progressDescription: "Pace fügt jede Zeile mit denselben Prüfungen wie eine manuelle Transaktion hinzu.",
  progressLabel: "Importfortschritt",
  progressRows: "{processed} von {total} Zeilen",
  progressWaiting: "Warten auf Pace…",
  progressKeepOpen: "Lassen Sie diese Seite geöffnet, bis der Import abgeschlossen ist.",
  steps: { prepare: "Vorbereiten", validate: "Prüfen", import: "Importieren", finalize: "Abschließen" },
  stepDone: "erledigt",
  stepActive: "läuft",
  stepPending: "wartet",
  resultTitle: "Import abgeschlossen",
  resultPartialTitle: "Import mit Problemen abgeschlossen",
  resultDescription: "Ihre Transaktionen sind in Pace und Ihre Salden sind aktuell.",
  resultPartialDescription: "Einige Zeilen konnten nicht importiert werden. Alles andere ist in Pace.",
  resultImported: "Importiert",
  resultInbox: "An Inbox gesendet",
  resultDuplicates: "Übersprungene Duplikate",
  resultFailed: "Fehlgeschlagen",
  resultFailedRows: "Fehlgeschlagene Zeilen: {rows}",
  resultDeferred: "Einige Transaktionen werden noch kategorisiert. Sie erscheinen bald in der Inbox, falls sie Sie brauchen.",
  viewTransactions: "Transaktionen ansehen",
  openInbox: "Inbox öffnen",
  importAnother: "Weitere Datei importieren",
  retryFailed: "Fehlgeschlagene Zeilen erneut versuchen",
  retry: "Erneut versuchen",
  staleTitle: "Dieser Import ist nicht mehr verfügbar",
  staleDescription: "Temporäre Importdaten verfallen nach 24 Stunden oder wenn ein Import abgebrochen wird. Laden Sie die Datei erneut hoch, um fortzufahren.",
  staleAction: "Datei hochladen",
  errors: {
    IMPORT_ACCOUNT_UNAVAILABLE: "Das gewählte Konto ist nicht mehr verfügbar. Wählen Sie ein anderes Konto.",
    IMPORT_TRANSFER_ACCOUNT_INVALID: "Wählen Sie für Überweisungen ein anderes Konto mit derselben Währung.",
    IMPORT_SESSION_STALE: "Dieser Import hat sich geändert oder ist abgelaufen. Laden Sie die Datei erneut hoch.",
    IMPORT_NOT_READY: "Dieser Import ist noch nicht bereit. Beheben Sie die blockierenden Fehler und versuchen Sie es erneut.",
    INVALID_ROW_CORRECTION: "Dieser Wert konnte nicht übernommen werden. Laden Sie die Seite neu und versuchen Sie es erneut.",
    IMPORT_STALLED: "Der Import reagiert nicht mehr. Versuchen Sie es erneut – bereits importierte Zeilen werden nicht doppelt hinzugefügt.",
    FORBIDDEN: "Sie sind nicht berechtigt, in diesem Arbeitsbereich Transaktionen zu importieren.",
    NETWORK: "Pace ist nicht erreichbar. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
    GENERIC: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
  },
};

const importExecutionLabels: Readonly<Record<DashboardLanguage, Omit<ImportExecutionLabels, "fields">>> = { en, fr, de };

export function getImportExecutionLabels(language: DashboardLanguage): ImportExecutionLabels {
  return { ...importExecutionLabels[language], fields: getImportMappingLabels(language).fields };
}

export type ImportAccountLabels = Pick<
  TransactionUiLabels,
  | "accountsEmptyTitle"
  | "accountsEmptyDescription"
  | "accountsSearchNoResults"
  | "accountsCreate"
  | "accountsCreateFirst"
  | "formAccountSearch"
  | "balance"
  | "createAccountForm"
  | "accountCreateTitle"
  | "accountCreateSubtitle"
  | "accountCreateErrorGeneric"
  | "accountCreateErrorWorkspaceForbidden"
>;

export function importAccountLabels(labels: TransactionUiLabels): ImportAccountLabels {
  return {
    accountsEmptyTitle: labels.accountsEmptyTitle,
    accountsEmptyDescription: labels.accountsEmptyDescription,
    accountsSearchNoResults: labels.accountsSearchNoResults,
    accountsCreate: labels.accountsCreate,
    accountsCreateFirst: labels.accountsCreateFirst,
    formAccountSearch: labels.formAccountSearch,
    balance: labels.balance,
    createAccountForm: labels.createAccountForm,
    accountCreateTitle: labels.accountCreateTitle,
    accountCreateSubtitle: labels.accountCreateSubtitle,
    accountCreateErrorGeneric: labels.accountCreateErrorGeneric,
    accountCreateErrorWorkspaceForbidden: labels.accountCreateErrorWorkspaceForbidden,
  };
}
