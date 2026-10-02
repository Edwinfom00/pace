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
  readonly columnsLabel: string;
  readonly colFileColumn: string;
  readonly colSample: string;
  readonly colMapTo: string;
  readonly colStatus: string;
  readonly sampleEmpty: string;
  readonly fieldFor: string;
  readonly chooseField: string;
  readonly ignoreColumn: string;
  readonly requiredOptions: string;
  readonly optionalOptions: string;
  readonly fields: Readonly<Record<ImportField, string>>;
  readonly statuses: Readonly<Record<ImportColumnStatus, string>>;
  readonly requiredTitle: string;
  readonly requiredGroups: Readonly<Record<ImportRequiredGroupId, string>>;
  readonly requiredMet: string;
  readonly requiredMissing: string;
  readonly requiredCount: string;
  readonly optionalTitle: string;
  readonly optionalMapped: string;
  readonly optionalUnmapped: string;
  readonly fieldMoved: string;
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
  description: "Match the columns in your file to Pace fields.",
  rowsOne: "{count} row",
  rowsOther: "{count} rows",
  columnsLabel: "File columns",
  colFileColumn: "File column",
  colSample: "Sample value",
  colMapTo: "Map to",
  colStatus: "Status",
  sampleEmpty: "Empty",
  fieldFor: "Pace field for {column}",
  chooseField: "Choose a field",
  ignoreColumn: "Ignore this column",
  requiredOptions: "Required",
  optionalOptions: "Optional",
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
    transactionType: "Type (Expense/Income)",
  },
  statuses: {
    DETECTED: "Detected",
    MAPPED: "Mapped",
    OPTIONAL: "Optional",
    IGNORED: "Ignored",
    UNMAPPED: "Not mapped",
  },
  requiredTitle: "Required fields",
  requiredGroups: { date: "Date", amount: "Amount", description: "Description" },
  requiredMet: "{field}: mapped",
  requiredMissing: "{field}: not mapped yet",
  requiredCount: "{count} / {total} mapped",
  optionalTitle: "Optional columns",
  optionalMapped: "{field}: mapped",
  optionalUnmapped: "{field}: not mapped",
  fieldMoved: "{field} is now mapped to {column}.",
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
  description: "Associez les colonnes de votre fichier à vos champs Pace.",
  rowsOne: "{count} ligne",
  rowsOther: "{count} lignes",
  columnsLabel: "Colonnes du fichier",
  colFileColumn: "Colonne dans le fichier",
  colSample: "Exemple de valeur",
  colMapTo: "Associer à",
  colStatus: "Statut",
  sampleEmpty: "Vide",
  fieldFor: "Champ Pace pour {column}",
  chooseField: "Choisir un champ",
  ignoreColumn: "Ignorer cette colonne",
  requiredOptions: "Requis",
  optionalOptions: "Optionnels",
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
    transactionType: "Type (Dépense/Revenu)",
  },
  statuses: {
    DETECTED: "Détecté",
    MAPPED: "Associé",
    OPTIONAL: "Optionnel",
    IGNORED: "Ignoré",
    UNMAPPED: "Non associé",
  },
  requiredTitle: "Champs requis",
  requiredGroups: { date: "Date", amount: "Montant", description: "Description" },
  requiredMet: "{field} : associé",
  requiredMissing: "{field} : pas encore associé",
  requiredCount: "{count} / {total} associés",
  optionalTitle: "Colonnes optionnelles",
  optionalMapped: "{field} : associé",
  optionalUnmapped: "{field} : non associé",
  fieldMoved: "{field} est maintenant associé à {column}.",
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
  description: "Ordnen Sie die Spalten Ihrer Datei den Pace-Feldern zu.",
  rowsOne: "{count} Zeile",
  rowsOther: "{count} Zeilen",
  columnsLabel: "Dateispalten",
  colFileColumn: "Spalte in der Datei",
  colSample: "Beispielwert",
  colMapTo: "Zuordnen zu",
  colStatus: "Status",
  sampleEmpty: "Leer",
  fieldFor: "Pace-Feld für {column}",
  chooseField: "Feld auswählen",
  ignoreColumn: "Diese Spalte ignorieren",
  requiredOptions: "Erforderlich",
  optionalOptions: "Optional",
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
    transactionType: "Typ (Ausgabe/Einnahme)",
  },
  statuses: {
    DETECTED: "Erkannt",
    MAPPED: "Zugeordnet",
    OPTIONAL: "Optional",
    IGNORED: "Ignoriert",
    UNMAPPED: "Nicht zugeordnet",
  },
  requiredTitle: "Pflichtfelder",
  requiredGroups: { date: "Datum", amount: "Betrag", description: "Beschreibung" },
  requiredMet: "{field}: zugeordnet",
  requiredMissing: "{field}: noch nicht zugeordnet",
  requiredCount: "{count} / {total} zugeordnet",
  optionalTitle: "Optionale Spalten",
  optionalMapped: "{field}: zugeordnet",
  optionalUnmapped: "{field}: nicht zugeordnet",
  fieldMoved: "{field} ist jetzt {column} zugeordnet.",
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
