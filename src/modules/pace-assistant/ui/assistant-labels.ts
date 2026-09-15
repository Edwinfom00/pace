export type PaceAssistantLanguage = "en" | "fr" | "de";

export type PaceAssistantLabels = {
  readonly ask: string;
  readonly placeholder: string;
  readonly send: string;
  readonly retry: string;
  readonly edit: string;
  readonly confirm: string;
  readonly cancel: string;
  readonly thinking: string;
  readonly preparing: string;
  readonly unableToRespond: string;
  readonly noMessages: string;
  readonly suggestedQuestions: string;
  readonly unknownResponse: string;
  readonly today: string;
  readonly used: string;
  readonly target: string;
  readonly due: string;
  readonly recurring: string;
  readonly actionRequiresApproval: string;
  readonly assistant: string;
  readonly you: string;
  readonly newLineHint: string;
  readonly previous: string;
  readonly close: string;
  readonly collapse: string;
  readonly expand: string;
  readonly sending: string;
  readonly retrieving: string;
  readonly checking: string;
  readonly waitingApproval: string;
  readonly verifying: string;
  readonly preparingApproval: string;
  readonly loadingConversation: string;
  readonly scrollToLatest: string;
  readonly verifiedByPace: string;
  readonly actionFailed: string;
  readonly actionPrepared: string;
  readonly transfer: string;
  readonly income: string;
  readonly expense: string;
  readonly planChange: string;
  readonly amount: string;
  readonly date: string;
  readonly details: string;
  readonly status: string;
};

const labels: Record<PaceAssistantLanguage, PaceAssistantLabels> = {
  en: {
    ask: "Ask Pace", placeholder: "Ask a question about your finances...", send: "Send", retry: "Retry", edit: "Edit", confirm: "Confirm", cancel: "Cancel",
    thinking: "Thinking...", preparing: "Preparing your response...", unableToRespond: "Pace could not complete that request.", noMessages: "Ask about spending, bills, or a plan.",
    suggestedQuestions: "Suggested questions", unknownResponse: "Pace returned an unsupported response.", today: "Today", used: "used", target: "Target", due: "Due",
    recurring: "Recurring", actionRequiresApproval: "This action requires your approval before Pace can make a change.", assistant: "Pace", you: "You",
    newLineHint: "Enter to send · Shift + Enter for a new line", previous: "Previous", close: "Close assistant", collapse: "Collapse assistant", expand: "Open assistant", sending: "Sending your question...", retrieving: "Retrieving financial information...", checking: "Checking the details...", waitingApproval: "Waiting for your approval...", verifying: "Verifying the result...", preparingApproval: "Preparing your approval...", loadingConversation: "Loading your conversation...", scrollToLatest: "Go to latest message", verifiedByPace: "Verified by Pace", actionFailed: "Pace could not complete this action.", actionPrepared: "Prepared. Review the details before requesting approval.", transfer: "Transfer", income: "Income", expense: "Expense", planChange: "Plan change", amount: "Amount", date: "Date", details: "Details", status: "Status",
  },
  fr: {
    ask: "Demander à Pace", placeholder: "Posez une question sur vos finances...", send: "Envoyer", retry: "Réessayer", edit: "Modifier", confirm: "Confirmer", cancel: "Annuler",
    thinking: "Réflexion...", preparing: "Préparation de votre réponse...", unableToRespond: "Pace n’a pas pu terminer cette demande.", noMessages: "Demandez des informations sur vos dépenses, factures ou plans.",
    suggestedQuestions: "Questions suggérées", unknownResponse: "Pace a renvoyé une réponse non prise en charge.", today: "Aujourd’hui", used: "utilisé", target: "Objectif", due: "Échéance",
    recurring: "Récurrent", actionRequiresApproval: "Cette action requiert votre approbation avant toute modification.", assistant: "Pace", you: "Vous",
    newLineHint: "Entrée pour envoyer · Maj + Entrée pour une nouvelle ligne", previous: "Précédent", close: "Fermer l’assistant", collapse: "Réduire l’assistant", expand: "Ouvrir l’assistant", sending: "Envoi de votre question...", retrieving: "Recherche des informations financières...", checking: "Vérification des détails...", waitingApproval: "En attente de votre approbation...", verifying: "Vérification du résultat...", preparingApproval: "Préparation de votre approbation...", loadingConversation: "Chargement de votre conversation...", scrollToLatest: "Aller au dernier message", verifiedByPace: "Vérifié par Pace", actionFailed: "Pace n’a pas pu finaliser cette action.", actionPrepared: "Préparé. Vérifiez les détails avant de demander l’approbation.", transfer: "Transfert", income: "Revenu", expense: "Dépense", planChange: "Modification du plan", amount: "Montant", date: "Date", details: "Détails", status: "Statut",
  },
  de: {
    ask: "Pace fragen", placeholder: "Stelle eine Frage zu deinen Finanzen...", send: "Senden", retry: "Erneut versuchen", edit: "Bearbeiten", confirm: "Bestätigen", cancel: "Abbrechen",
    thinking: "Pace denkt nach...", preparing: "Antwort wird vorbereitet...", unableToRespond: "Pace konnte diese Anfrage nicht abschließen.", noMessages: "Frage nach Ausgaben, Rechnungen oder einem Plan.",
    suggestedQuestions: "Vorgeschlagene Fragen", unknownResponse: "Pace hat eine nicht unterstützte Antwort gesendet.", today: "Heute", used: "verwendet", target: "Ziel", due: "Fällig",
    recurring: "Wiederkehrend", actionRequiresApproval: "Diese Aktion benötigt deine Zustimmung, bevor Pace etwas ändert.", assistant: "Pace", you: "Du",
    newLineHint: "Enter zum Senden · Umschalt + Enter für eine neue Zeile", previous: "Vorheriger Wert", close: "Assistent schließen", collapse: "Assistent einklappen", expand: "Assistent öffnen", sending: "Deine Frage wird gesendet...", retrieving: "Finanzinformationen werden abgerufen...", checking: "Details werden geprüft...", waitingApproval: "Warte auf deine Zustimmung...", verifying: "Ergebnis wird überprüft...", preparingApproval: "Deine Freigabe wird vorbereitet...", loadingConversation: "Unterhaltung wird geladen...", scrollToLatest: "Zum neuesten Beitrag", verifiedByPace: "Von Pace bestätigt", actionFailed: "Pace konnte diese Aktion nicht abschließen.", actionPrepared: "Vorbereitet. Prüfe die Details, bevor du eine Freigabe anforderst.", transfer: "Überweisung", income: "Einnahme", expense: "Ausgabe", planChange: "Planänderung", amount: "Betrag", date: "Datum", details: "Details", status: "Status",
  },
};

export function getPaceAssistantLabels(language: string): PaceAssistantLabels {
  return labels[language === "fr" || language === "de" ? language : "en"];
}

export function getPaceAssistantSuggestions(language: string): readonly string[] {
  if (language === "fr") return ["Résume ce mois-ci", "Où puis-je économiser ?", "Montre mes dépenses les plus élevées"];
  if (language === "de") return ["Diesen Monat zusammenfassen", "Wo kann ich sparen?", "Zeige meine größten Ausgaben"];
  return ["Summarize this month", "Where can I save?", "Show my largest expenses"];
}
