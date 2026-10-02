import type { DashboardLanguage } from "@/i18n/dashboard-messages";

import type { ImportField } from "../domain";
import type { ImportRequiredGroupId } from "../mapping/column-mapping";

export const IMPORT_MAPPING_ERROR_CODES = [
  "REQUIRED_FIELDS_MISSING",
  "AMOUNT_MODE_CONFLICT",
  "INVALID_COLUMN_MAPPING",
  "IMPORT_FILE_CHANGED",
  "IMPORT_SESSION_STALE",
  "FORBIDDEN",
  "NETWORK",
  "GENERIC",
] as const;

export type ImportMappingErrorCode = (typeof IMPORT_MAPPING_ERROR_CODES)[number];

export const IMPORT_COLUMN_STATUSES = ["DETECTED", "MAPPED", "OPTIONAL", "IGNORED", "UNMAPPED"] as const;
export type ImportColumnStatus = (typeof IMPORT_COLUMN_STATUSES)[number];

export type ImportMappingLabels = {
  readonly title: string;
  readonly description: string;
  readonly rowsOne: string;
  readonly rowsOther: string;
  readonly columnCount: string;
  readonly previewTitle: string;
  readonly previewHint: string;
  readonly previewMissing: string;
  readonly previewRaw: string;
  readonly slotsTitle: string;
  readonly slotsDescription: string;
  readonly requiredBadge: string;
  readonly optionalBadge: string;
  readonly optionalTitle: string;
  readonly slotColumnLabel: string;
  readonly slotNone: string;
  readonly slotDetected: string;
  readonly slotManual: string;
  readonly slotMissing: string;
  readonly slotCovered: string;
  readonly optionUsedBy: string;
  readonly optionEmptySample: string;
  readonly amountSplit: string;
  readonly amountSingle: string;
  readonly fields: Readonly<Record<ImportField, string>>;
  readonly fieldHints: Readonly<Record<ImportField, string>>;
  readonly requiredGroups: Readonly<Record<ImportRequiredGroupId, string>>;
  readonly requiredCount: string;
  readonly requiredMet: string;
  readonly requiredMissing: string;
  readonly columnsTitle: string;
  readonly columnsSummary: string;
  readonly columnPosition: string;
  readonly columnUsedAs: string;
  readonly columnNotUsed: string;
  readonly columnIgnored: string;
  readonly ignoreColumn: string;
  readonly restoreColumn: string;
  readonly ignoreRemaining: string;
  readonly remainingIgnored: string;
  readonly fieldMoved: string;
  readonly safeTitle: string;
  readonly safeDescription: string;
  readonly back: string;
  readonly continue: string;
  readonly saving: string;
  readonly staleTitle: string;
  readonly staleDescription: string;
  readonly staleAction: string;
  readonly errors: Readonly<Record<ImportMappingErrorCode, string>>;
};

const en: ImportMappingLabels = {
  title: "Map columns",
  description: "Tell Pace where each piece of information lives in your file.",
  rowsOne: "{count} row",
  rowsOther: "{count} rows",
  columnCount: "{count} columns",
  previewTitle: "Live preview",
  previewHint: "Your first rows, as Pace will read them",
  previewMissing: "{field}?",
  previewRaw: "Values are shown exactly as in your file. Nothing is converted or imported yet.",
  slotsTitle: "Pace fields",
  slotsDescription: "Pick the column from your file for each field.",
  requiredBadge: "Required",
  optionalBadge: "Optional",
  optionalTitle: "Optional details",
  slotColumnLabel: "File column for {field}",
  slotNone: "No column",
  slotDetected: "Detected by Pace",
  slotManual: "Chosen by you",
  slotMissing: "Choose a column",
  slotCovered: "Covered by {field}",
  optionUsedBy: "→ {field}",
  optionEmptySample: "empty",
  amountSplit: "My file has separate debit and credit columns",
  amountSingle: "Use a single amount column",
  fields: {
    transactionDate: "Date",
    bookingDate: "Booking date",
    description: "Description",
    merchant: "Merchant",
    amount: "Amount",
    debit: "Debit",
    credit: "Credit",
    currency: "Currency",
    accountReference: "Account",
    transferAccount: "Transfer destination",
    transactionType: "Type",
  },
  fieldHints: {
    transactionDate: "When the transaction happened",
    bookingDate: "When your bank recorded it",
    description: "What the transaction was for",
    merchant: "Store, person or payee",
    amount: "One column, negative for money out",
    debit: "Money leaving the account",
    credit: "Money coming in",
    currency: "Currency code, such as XAF",
    accountReference: "Which account it belongs to",
    transferAccount: "Where a transfer sends the money",
    transactionType: "Expense, income or transfer",
  },
  requiredGroups: { date: "Date", amount: "Amount", description: "Description" },
  requiredCount: "{count} / {total} required",
  requiredMet: "{field}: mapped",
  requiredMissing: "{field}: not mapped yet",
  columnsTitle: "Your file's columns",
  columnsSummary: "{used} used · {unused} not used",
  columnPosition: "Column {letter}",
  columnUsedAs: "→ {field}",
  columnNotUsed: "Not used",
  columnIgnored: "Ignored",
  ignoreColumn: "Ignore {column}",
  restoreColumn: "Restore {column}",
  ignoreRemaining: "Ignore unused columns",
  remainingIgnored: "Unused columns are now ignored.",
  fieldMoved: "{column} now fills {field}.",
  safeTitle: "Nothing is imported yet",
  safeDescription: "You'll review every transaction before anything is added to Pace.",
  back: "Back",
  continue: "Continue",
  saving: "Saving…",
  staleTitle: "This file is no longer available",
  staleDescription: "Temporary import data expires after 24 hours or once the import moves on. Upload the file again to continue.",
  staleAction: "Upload a file",
  errors: {
    REQUIRED_FIELDS_MISSING: "Map {fields} to continue.",
    AMOUNT_MODE_CONFLICT: "Use either one amount column or debit/credit columns, not both.",
    INVALID_COLUMN_MAPPING: "Each file column can be mapped to one Pace field only.",
    IMPORT_FILE_CHANGED: "This import now refers to a different file. Upload it again.",
    IMPORT_SESSION_STALE: "This file is no longer available for mapping. Upload it again.",
    FORBIDDEN: "You don't have permission to import transactions in this workspace.",
    NETWORK: "Your mapping couldn't be saved. Check your connection and try again.",
    GENERIC: "Your mapping couldn't be saved. Please try again.",
  },
};

const fr: ImportMappingLabels = {
  title: "Correspondance des colonnes",
  description: "Indiquez à Pace où se trouve chaque information dans votre fichier.",
  rowsOne: "{count} ligne",
  rowsOther: "{count} lignes",
  columnCount: "{count} colonnes",
  previewTitle: "Aperçu en direct",
  previewHint: "Vos premières lignes, telles que Pace les lira",
  previewMissing: "{field} ?",
  previewRaw: "Les valeurs sont affichées telles quelles. Rien n’est encore converti ni importé.",
  slotsTitle: "Champs Pace",
  slotsDescription: "Choisissez la colonne de votre fichier pour chaque champ.",
  requiredBadge: "Requis",
  optionalBadge: "Optionnel",
  optionalTitle: "Détails optionnels",
  slotColumnLabel: "Colonne du fichier pour {field}",
  slotNone: "Aucune colonne",
  slotDetected: "Détecté par Pace",
  slotManual: "Choisi par vous",
  slotMissing: "Choisissez une colonne",
  slotCovered: "Couvert par {field}",
  optionUsedBy: "→ {field}",
  optionEmptySample: "vide",
  amountSplit: "Mon fichier a des colonnes débit et crédit séparées",
  amountSingle: "Utiliser une seule colonne de montant",
  fields: {
    transactionDate: "Date",
    bookingDate: "Date comptable",
    description: "Description",
    merchant: "Marchand",
    amount: "Montant",
    debit: "Débit",
    credit: "Crédit",
    currency: "Devise",
    accountReference: "Compte",
    transferAccount: "Compte de destination",
    transactionType: "Type",
  },
  fieldHints: {
    transactionDate: "Quand la transaction a eu lieu",
    bookingDate: "Quand votre banque l’a enregistrée",
    description: "À quoi correspond la transaction",
    merchant: "Magasin, personne ou bénéficiaire",
    amount: "Une colonne, négative pour les sorties",
    debit: "Argent qui sort du compte",
    credit: "Argent qui entre",
    currency: "Code devise, par exemple XAF",
    accountReference: "Compte concerné",
    transferAccount: "Où un virement envoie l'argent",
    transactionType: "Dépense, revenu ou virement",
  },
  requiredGroups: { date: "Date", amount: "Montant", description: "Description" },
  requiredCount: "{count} / {total} requis",
  requiredMet: "{field} : associé",
  requiredMissing: "{field} : pas encore associé",
  columnsTitle: "Colonnes de votre fichier",
  columnsSummary: "{used} utilisées · {unused} non utilisées",
  columnPosition: "Colonne {letter}",
  columnUsedAs: "→ {field}",
  columnNotUsed: "Non utilisée",
  columnIgnored: "Ignorée",
  ignoreColumn: "Ignorer {column}",
  restoreColumn: "Rétablir {column}",
  ignoreRemaining: "Ignorer les colonnes non utilisées",
  remainingIgnored: "Les colonnes non utilisées sont maintenant ignorées.",
  fieldMoved: "{column} remplit maintenant {field}.",
  safeTitle: "Rien n’est encore importé",
  safeDescription: "Vous vérifierez chaque transaction avant tout ajout dans Pace.",
  back: "Retour",
  continue: "Continuer",
  saving: "Enregistrement…",
  staleTitle: "Ce fichier n’est plus disponible",
  staleDescription: "Les données temporaires d’import expirent après 24 heures ou dès que l’import avance. Importez à nouveau le fichier pour continuer.",
  staleAction: "Importer un fichier",
  errors: {
    REQUIRED_FIELDS_MISSING: "Associez {fields} pour continuer.",
    AMOUNT_MODE_CONFLICT: "Utilisez soit une colonne de montant, soit des colonnes débit/crédit, pas les deux.",
    INVALID_COLUMN_MAPPING: "Chaque colonne du fichier ne peut être associée qu’à un seul champ Pace.",
    IMPORT_FILE_CHANGED: "Cet import concerne désormais un autre fichier. Importez-le à nouveau.",
    IMPORT_SESSION_STALE: "Ce fichier n’est plus disponible pour l’association. Importez-le à nouveau.",
    FORBIDDEN: "Vous n’avez pas l’autorisation d’importer des transactions dans cet espace.",
    NETWORK: "Votre correspondance n’a pas pu être enregistrée. Vérifiez votre connexion et réessayez.",
    GENERIC: "Votre correspondance n’a pas pu être enregistrée. Veuillez réessayer.",
  },
};

const de: ImportMappingLabels = {
  title: "Spalten zuordnen",
  description: "Zeigen Sie Pace, wo welche Information in Ihrer Datei steht.",
  rowsOne: "{count} Zeile",
  rowsOther: "{count} Zeilen",
  columnCount: "{count} Spalten",
  previewTitle: "Live-Vorschau",
  previewHint: "Ihre ersten Zeilen, so wie Pace sie liest",
  previewMissing: "{field}?",
  previewRaw: "Werte werden genau wie in Ihrer Datei angezeigt. Noch wird nichts umgerechnet oder importiert.",
  slotsTitle: "Pace-Felder",
  slotsDescription: "Wählen Sie für jedes Feld die Spalte aus Ihrer Datei.",
  requiredBadge: "Erforderlich",
  optionalBadge: "Optional",
  optionalTitle: "Optionale Details",
  slotColumnLabel: "Dateispalte für {field}",
  slotNone: "Keine Spalte",
  slotDetected: "Von Pace erkannt",
  slotManual: "Von Ihnen gewählt",
  slotMissing: "Spalte auswählen",
  slotCovered: "Abgedeckt durch {field}",
  optionUsedBy: "→ {field}",
  optionEmptySample: "leer",
  amountSplit: "Meine Datei hat getrennte Soll- und Haben-Spalten",
  amountSingle: "Eine einzige Betragsspalte verwenden",
  fields: {
    transactionDate: "Datum",
    bookingDate: "Buchungsdatum",
    description: "Beschreibung",
    merchant: "Händler",
    amount: "Betrag",
    debit: "Soll",
    credit: "Haben",
    currency: "Währung",
    accountReference: "Konto",
    transferAccount: "Zielkonto",
    transactionType: "Typ",
  },
  fieldHints: {
    transactionDate: "Wann die Transaktion stattfand",
    bookingDate: "Wann Ihre Bank sie gebucht hat",
    description: "Wofür die Transaktion war",
    merchant: "Geschäft, Person oder Empfänger",
    amount: "Eine Spalte, negativ für Ausgänge",
    debit: "Geld, das das Konto verlässt",
    credit: "Eingehendes Geld",
    currency: "Währungscode, z. B. XAF",
    accountReference: "Zu welchem Konto sie gehört",
    transferAccount: "Wohin eine Überweisung das Geld schickt",
    transactionType: "Ausgabe, Einnahme oder Überweisung",
  },
  requiredGroups: { date: "Datum", amount: "Betrag", description: "Beschreibung" },
  requiredCount: "{count} / {total} erforderlich",
  requiredMet: "{field}: zugeordnet",
  requiredMissing: "{field}: noch nicht zugeordnet",
  columnsTitle: "Spalten Ihrer Datei",
  columnsSummary: "{used} verwendet · {unused} nicht verwendet",
  columnPosition: "Spalte {letter}",
  columnUsedAs: "→ {field}",
  columnNotUsed: "Nicht verwendet",
  columnIgnored: "Ignoriert",
  ignoreColumn: "{column} ignorieren",
  restoreColumn: "{column} wiederherstellen",
  ignoreRemaining: "Nicht verwendete Spalten ignorieren",
  remainingIgnored: "Nicht verwendete Spalten werden jetzt ignoriert.",
  fieldMoved: "{column} füllt jetzt {field}.",
  safeTitle: "Noch wird nichts importiert",
  safeDescription: "Sie prüfen jede Transaktion, bevor etwas zu Pace hinzugefügt wird.",
  back: "Zurück",
  continue: "Weiter",
  saving: "Wird gespeichert…",
  staleTitle: "Diese Datei ist nicht mehr verfügbar",
  staleDescription: "Temporäre Importdaten verfallen nach 24 Stunden oder sobald der Import fortgeschritten ist. Laden Sie die Datei erneut hoch, um fortzufahren.",
  staleAction: "Datei hochladen",
  errors: {
    REQUIRED_FIELDS_MISSING: "Ordnen Sie {fields} zu, um fortzufahren.",
    AMOUNT_MODE_CONFLICT: "Verwenden Sie entweder eine Betragsspalte oder Soll-/Haben-Spalten, nicht beides.",
    INVALID_COLUMN_MAPPING: "Jede Dateispalte kann nur einem Pace-Feld zugeordnet werden.",
    IMPORT_FILE_CHANGED: "Dieser Import bezieht sich jetzt auf eine andere Datei. Laden Sie sie erneut hoch.",
    IMPORT_SESSION_STALE: "Diese Datei ist für die Zuordnung nicht mehr verfügbar. Laden Sie sie erneut hoch.",
    FORBIDDEN: "Sie sind nicht berechtigt, in diesem Arbeitsbereich Transaktionen zu importieren.",
    NETWORK: "Ihre Zuordnung konnte nicht gespeichert werden. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
    GENERIC: "Ihre Zuordnung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
  },
};

const importMappingLabels: Readonly<Record<DashboardLanguage, ImportMappingLabels>> = { en, fr, de };

export function getImportMappingLabels(language: DashboardLanguage): ImportMappingLabels {
  return importMappingLabels[language];
}
