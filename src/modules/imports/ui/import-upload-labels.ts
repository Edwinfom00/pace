import type { DashboardLanguage } from "@/i18n/dashboard-messages";

export const IMPORT_UPLOAD_ERROR_CODES = [
  "INVALID_FILE_NAME",
  "EMPTY_FILE",
  "FILE_SIZE_LIMIT",
  "UNSUPPORTED_FILE_TYPE",
  "MIME_MISMATCH",
  "MULTIPLE_FILES",
  "INVALID_ENCODING",
  "MISSING_HEADERS",
  "MISSING_HEADER",
  "DUPLICATE_HEADERS",
  "ROW_LIMIT",
  "COLUMN_LIMIT",
  "MALFORMED_CSV",
  "INVALID_XLSX",
  "MALFORMED_XLSX",
  "FORMULA_CELL",
  "FORBIDDEN",
  "NETWORK",
  "GENERIC",
] as const;

export type ImportUploadErrorCode = (typeof IMPORT_UPLOAD_ERROR_CODES)[number];

export type ImportUploadLabels = {
  readonly transactions: string;
  readonly back: string;
  readonly title: string;
  readonly description: string;
  readonly fileField: string;
  readonly dropTitle: string;
  readonly dropActive: string;
  readonly acceptedFormats: string;
  readonly chooseFile: string;
  readonly selectedFile: string;
  readonly fileMeta: string;
  readonly replace: string;
  readonly remove: string;
  readonly analyze: string;
  readonly analyzing: string;
  readonly fileSelected: string;
  readonly fileRemoved: string;
  readonly beforeTitle: string;
  readonly beforeDescription: string;
  readonly requirementDate: string;
  readonly requirementAmount: string;
  readonly requirementDescription: string;
  readonly autoDetect: string;
  readonly securityTitle: string;
  readonly securityDescription: string;
  readonly errorTitle: string;
  readonly errorDescription: string;
  readonly retry: string;
  readonly errors: Readonly<Record<ImportUploadErrorCode, string>>;
};

const en: ImportUploadLabels = {
  transactions: "Transactions",
  back: "Back",
  title: "Import transactions",
  description: "Import your history from a CSV or Excel file.",
  fileField: "Statement file",
  dropTitle: "Drag and drop your file here",
  dropActive: "Drop your file to add it",
  acceptedFormats: "Accepted formats: {formats} · Maximum size: {size}",
  chooseFile: "Choose a file",
  selectedFile: "Selected file",
  fileMeta: "{type} · {size}",
  replace: "Replace",
  remove: "Remove {name}",
  analyze: "Analyze file",
  analyzing: "Analyzing…",
  fileSelected: "{name} selected.",
  fileRemoved: "File removed.",
  beforeTitle: "Before you start",
  beforeDescription: "For the best match, your file should ideally contain:",
  requirementDate: "A transaction date",
  requirementAmount: "An amount",
  requirementDescription: "A description (merchant)",
  autoDetect: "Pace will detect the other columns automatically.",
  securityTitle: "Security",
  securityDescription: "Your file is processed securely. Its temporary data is deleted after import, or within 24 hours.",
  errorTitle: "Import is unavailable",
  errorDescription: "This page couldn't be loaded. Please try again.",
  retry: "Try again",
  errors: {
    INVALID_FILE_NAME: "This file name is not valid. Rename the file and try again.",
    EMPTY_FILE: "This file is empty. Choose a file that contains transactions.",
    FILE_SIZE_LIMIT: "This file is larger than {size}. Choose a smaller file.",
    UNSUPPORTED_FILE_TYPE: "This format isn't supported. Choose a {formats} file.",
    MIME_MISMATCH: "This file's content doesn't match its extension. Export it again as {formats}.",
    MULTIPLE_FILES: "Choose only one file at a time.",
    INVALID_ENCODING: "This CSV file isn't UTF-8 encoded. Export it again as UTF-8.",
    MISSING_HEADERS: "The first row must contain column names.",
    MISSING_HEADER: "Every column needs a name in the first row.",
    DUPLICATE_HEADERS: "Two columns have the same name. Rename one of them.",
    ROW_LIMIT: "This file has too many rows. Split it into smaller files.",
    COLUMN_LIMIT: "This file has too many columns.",
    MALFORMED_CSV: "This CSV file couldn't be read. Check that it isn't damaged.",
    INVALID_XLSX: "This Excel file couldn't be opened. Check that it isn't damaged.",
    MALFORMED_XLSX: "This Excel file couldn't be read. Save it again and retry.",
    FORMULA_CELL: "This file contains formulas. Paste the values only and try again.",
    FORBIDDEN: "You don't have permission to import transactions in this workspace.",
    NETWORK: "The file couldn't be sent. Check your connection and try again.",
    GENERIC: "This file couldn't be analyzed. Please try again.",
  },
};

const fr: ImportUploadLabels = {
  transactions: "Transactions",
  back: "Retour",
  title: "Importer des transactions",
  description: "Importez votre historique depuis un fichier CSV ou Excel.",
  fileField: "Fichier de relevé",
  dropTitle: "Glissez et déposez votre fichier ici",
  dropActive: "Déposez votre fichier pour l’ajouter",
  acceptedFormats: "Formats acceptés : {formats} · Taille maximale : {size}",
  chooseFile: "Choisir un fichier",
  selectedFile: "Fichier sélectionné",
  fileMeta: "{type} · {size}",
  replace: "Remplacer",
  remove: "Retirer {name}",
  analyze: "Analyser le fichier",
  analyzing: "Analyse en cours…",
  fileSelected: "{name} sélectionné.",
  fileRemoved: "Fichier retiré.",
  beforeTitle: "Avant de commencer",
  beforeDescription: "Pour une meilleure correspondance, votre fichier doit idéalement contenir :",
  requirementDate: "Une date de transaction",
  requirementAmount: "Un montant",
  requirementDescription: "Une description (marchand)",
  autoDetect: "Pace détectera automatiquement les autres colonnes.",
  securityTitle: "Sécurité",
  securityDescription: "Votre fichier est traité en toute sécurité. Ses données temporaires sont supprimées après l’import, ou sous 24 heures.",
  errorTitle: "Import indisponible",
  errorDescription: "Cette page n’a pas pu être chargée. Veuillez réessayer.",
  retry: "Réessayer",
  errors: {
    INVALID_FILE_NAME: "Ce nom de fichier n’est pas valide. Renommez le fichier et réessayez.",
    EMPTY_FILE: "Ce fichier est vide. Choisissez un fichier contenant des transactions.",
    FILE_SIZE_LIMIT: "Ce fichier dépasse {size}. Choisissez un fichier plus léger.",
    UNSUPPORTED_FILE_TYPE: "Ce format n’est pas pris en charge. Choisissez un fichier {formats}.",
    MIME_MISMATCH: "Le contenu de ce fichier ne correspond pas à son extension. Exportez-le à nouveau en {formats}.",
    MULTIPLE_FILES: "Choisissez un seul fichier à la fois.",
    INVALID_ENCODING: "Ce fichier CSV n’est pas encodé en UTF-8. Exportez-le à nouveau en UTF-8.",
    MISSING_HEADERS: "La première ligne doit contenir les noms des colonnes.",
    MISSING_HEADER: "Chaque colonne doit avoir un nom dans la première ligne.",
    DUPLICATE_HEADERS: "Deux colonnes portent le même nom. Renommez l’une d’elles.",
    ROW_LIMIT: "Ce fichier contient trop de lignes. Divisez-le en fichiers plus petits.",
    COLUMN_LIMIT: "Ce fichier contient trop de colonnes.",
    MALFORMED_CSV: "Ce fichier CSV n’a pas pu être lu. Vérifiez qu’il n’est pas endommagé.",
    INVALID_XLSX: "Ce fichier Excel n’a pas pu être ouvert. Vérifiez qu’il n’est pas endommagé.",
    MALFORMED_XLSX: "Ce fichier Excel n’a pas pu être lu. Enregistrez-le à nouveau et réessayez.",
    FORMULA_CELL: "Ce fichier contient des formules. Collez uniquement les valeurs et réessayez.",
    FORBIDDEN: "Vous n’avez pas l’autorisation d’importer des transactions dans cet espace.",
    NETWORK: "Le fichier n’a pas pu être envoyé. Vérifiez votre connexion et réessayez.",
    GENERIC: "Ce fichier n’a pas pu être analysé. Veuillez réessayer.",
  },
};

const de: ImportUploadLabels = {
  transactions: "Transaktionen",
  back: "Zurück",
  title: "Transaktionen importieren",
  description: "Importieren Sie Ihren Verlauf aus einer CSV- oder Excel-Datei.",
  fileField: "Kontoauszugsdatei",
  dropTitle: "Datei hierher ziehen und ablegen",
  dropActive: "Datei zum Hinzufügen ablegen",
  acceptedFormats: "Akzeptierte Formate: {formats} · Maximale Größe: {size}",
  chooseFile: "Datei auswählen",
  selectedFile: "Ausgewählte Datei",
  fileMeta: "{type} · {size}",
  replace: "Ersetzen",
  remove: "{name} entfernen",
  analyze: "Datei analysieren",
  analyzing: "Wird analysiert…",
  fileSelected: "{name} ausgewählt.",
  fileRemoved: "Datei entfernt.",
  beforeTitle: "Bevor Sie beginnen",
  beforeDescription: "Für die beste Zuordnung sollte Ihre Datei idealerweise Folgendes enthalten:",
  requirementDate: "Ein Transaktionsdatum",
  requirementAmount: "Einen Betrag",
  requirementDescription: "Eine Beschreibung (Händler)",
  autoDetect: "Pace erkennt die übrigen Spalten automatisch.",
  securityTitle: "Sicherheit",
  securityDescription: "Ihre Datei wird sicher verarbeitet. Temporäre Daten werden nach dem Import oder innerhalb von 24 Stunden gelöscht.",
  errorTitle: "Import nicht verfügbar",
  errorDescription: "Diese Seite konnte nicht geladen werden. Bitte versuchen Sie es erneut.",
  retry: "Erneut versuchen",
  errors: {
    INVALID_FILE_NAME: "Dieser Dateiname ist ungültig. Benennen Sie die Datei um und versuchen Sie es erneut.",
    EMPTY_FILE: "Diese Datei ist leer. Wählen Sie eine Datei mit Transaktionen.",
    FILE_SIZE_LIMIT: "Diese Datei ist größer als {size}. Wählen Sie eine kleinere Datei.",
    UNSUPPORTED_FILE_TYPE: "Dieses Format wird nicht unterstützt. Wählen Sie eine {formats}-Datei.",
    MIME_MISMATCH: "Der Inhalt dieser Datei passt nicht zur Endung. Exportieren Sie sie erneut als {formats}.",
    MULTIPLE_FILES: "Wählen Sie jeweils nur eine Datei.",
    INVALID_ENCODING: "Diese CSV-Datei ist nicht UTF-8-codiert. Exportieren Sie sie erneut als UTF-8.",
    MISSING_HEADERS: "Die erste Zeile muss Spaltennamen enthalten.",
    MISSING_HEADER: "Jede Spalte braucht in der ersten Zeile einen Namen.",
    DUPLICATE_HEADERS: "Zwei Spalten haben denselben Namen. Benennen Sie eine davon um.",
    ROW_LIMIT: "Diese Datei hat zu viele Zeilen. Teilen Sie sie in kleinere Dateien auf.",
    COLUMN_LIMIT: "Diese Datei hat zu viele Spalten.",
    MALFORMED_CSV: "Diese CSV-Datei konnte nicht gelesen werden. Prüfen Sie, ob sie beschädigt ist.",
    INVALID_XLSX: "Diese Excel-Datei konnte nicht geöffnet werden. Prüfen Sie, ob sie beschädigt ist.",
    MALFORMED_XLSX: "Diese Excel-Datei konnte nicht gelesen werden. Speichern Sie sie erneut und versuchen Sie es noch einmal.",
    FORMULA_CELL: "Diese Datei enthält Formeln. Fügen Sie nur die Werte ein und versuchen Sie es erneut.",
    FORBIDDEN: "Sie sind nicht berechtigt, in diesem Arbeitsbereich Transaktionen zu importieren.",
    NETWORK: "Die Datei konnte nicht gesendet werden. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.",
    GENERIC: "Diese Datei konnte nicht analysiert werden. Bitte versuchen Sie es erneut.",
  },
};

const importUploadLabels: Readonly<Record<DashboardLanguage, ImportUploadLabels>> = { en, fr, de };

export function getImportUploadLabels(language: DashboardLanguage): ImportUploadLabels {
  return importUploadLabels[language];
}

export function formatImportLabel(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
