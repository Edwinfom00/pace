import { defineDynamic, defineInstructions } from "eve/instructions";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) => {
      const language = ctx.session.auth.current?.attributes.preferredLanguage;
      const languageName = language === "fr" ? "French" : language === "de" ? "German" : "English";
      return defineInstructions({
        content: `Reply in the authenticated user's persisted preferred language: ${languageName}. This preference is independent of the workspace locale, currency, and timezone.`,
      });
    },
  },
});
