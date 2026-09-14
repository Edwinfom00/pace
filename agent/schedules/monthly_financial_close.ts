import { defineSchedule } from "eve/schedules";

import { getInsightService } from "@/modules/insights/server";

/** First day of the month at 06:30 UTC: close facts from the new calendar month. */
export default defineSchedule({
  cron: "30 6 1 * *",
  async run({ waitUntil }) {
    waitUntil(getInsightService().runProactiveReview("MONTHLY"));
  },
});
