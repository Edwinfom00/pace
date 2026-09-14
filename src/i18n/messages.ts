export const SUPPORTED_LANGUAGES = ["en", "fr"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const messages = {
  en: {
    "brand.name": "Pace",
    "brand.short": "P",
    "brand.description": "Personal finance that takes care of itself.",
    "askPace.title": "Ask Pace",
    "askPace.subtitle": "Create a transaction in plain language. Every change needs your approval.",
    "askPace.placeholder": "Try “taxi 3500” or “move 25k from Bank to MoMo”",
    "askPace.send": "Send",
    "askPace.thinking": "Pace is thinking…",
    "askPace.noWorkspace": "Create or join a workspace before asking Pace to record a transaction.",
    "askPace.draft": "Transaction draft",
    "askPace.approval": "Approval required",
    "askPace.approve": "Approve and record",
    "askPace.reject": "Reject",
    "askPace.edit": "Edit draft",
    "askPace.review": "Review draft",
    "askPace.amount": "Amount",
    "askPace.date": "Date",
    "askPace.account": "Account",
    "askPace.destination": "Destination account",
    "askPace.category": "Category",
    "askPace.save": "Save changes",
    "askPace.missing": "Still needed: {fields}",
    "askPace.status.DRAFT": "Draft",
    "askPace.status.WAITING_APPROVAL": "Waiting for approval",
    "askPace.status.APPROVED": "Approved",
    "askPace.status.REJECTED": "Rejected",
    "askPace.status.EXECUTING": "Recording",
    "askPace.status.COMPLETED": "Recorded",
    "askPace.status.FAILED": "Could not record",
    "askPace.reviewMessage": "Please review transaction draft {actionId} and request approval if it is complete.",
    "askPace.error": "Pace could not complete that request. Please try again.",
    "askPace.you": "You",
    "askPace.assistant": "Pace",
    "common.select": "Select…",
  },
  fr: {
    "brand.name": "Pace",
    "brand.short": "P",
    "brand.description": "Des finances personnelles qui prennent soin d’elles-mêmes.",
    "askPace.title": "Demander à Pace",
    "askPace.subtitle": "Créez une transaction en langage naturel. Chaque modification requiert votre approbation.",
    "askPace.placeholder": "Essayez « taxi 3500 » ou « déplacer 25k de Banque vers MoMo »",
    "askPace.send": "Envoyer",
    "askPace.thinking": "Pace réfléchit…",
    "askPace.noWorkspace": "Créez ou rejoignez un espace avant de demander à Pace d’enregistrer une transaction.",
    "askPace.draft": "Brouillon de transaction",
    "askPace.approval": "Approbation requise",
    "askPace.approve": "Approuver et enregistrer",
    "askPace.reject": "Rejeter",
    "askPace.edit": "Modifier le brouillon",
    "askPace.review": "Vérifier le brouillon",
    "askPace.amount": "Montant",
    "askPace.date": "Date",
    "askPace.account": "Compte",
    "askPace.destination": "Compte de destination",
    "askPace.category": "Catégorie",
    "askPace.save": "Enregistrer les modifications",
    "askPace.missing": "Encore nécessaire : {fields}",
    "askPace.status.DRAFT": "Brouillon",
    "askPace.status.WAITING_APPROVAL": "En attente d’approbation",
    "askPace.status.APPROVED": "Approuvé",
    "askPace.status.REJECTED": "Rejeté",
    "askPace.status.EXECUTING": "Enregistrement",
    "askPace.status.COMPLETED": "Enregistré",
    "askPace.status.FAILED": "Impossible d’enregistrer",
    "askPace.reviewMessage": "Veuillez vérifier le brouillon de transaction {actionId} et demander l’approbation s’il est complet.",
    "askPace.error": "Pace n’a pas pu terminer cette demande. Réessayez.",
    "askPace.you": "Vous",
    "askPace.assistant": "Pace",
    "common.select": "Sélectionner…",
  },
} as const;

export type MessageKey = keyof (typeof messages)["en"];

export function toSupportedLanguage(value: string | null | undefined): SupportedLanguage {
  return value === "fr" ? "fr" : "en";
}

export function getTranslations(language: string | null | undefined) {
  const dictionary = messages[toSupportedLanguage(language)];
  return (key: MessageKey, variables: Record<string, string | number> = {}) => {
    const template: string = dictionary[key];
    return Object.entries(variables).reduce<string>(
      (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
      template,
    );
  };
}
