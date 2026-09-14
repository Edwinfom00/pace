import { defineSchedule } from "eve/schedules";

import { getInsightService } from "@/modules/insights/server";

/** 05:15 UTC: persist facts, then create only high-signal private notification intents. */
export default defineSchedule({
  cron: "15 5 * * *",
  async run({ waitUntil }) {
    waitUntil(getInsightService().runProactiveReview("DAILY"));
  },
});
