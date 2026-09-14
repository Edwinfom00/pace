import { defineSchedule } from "eve/schedules";

import { getInsightService } from "@/modules/insights/server";

/** Monday 06:00 UTC: a member-preference-filtered summary notification intent. */
export default defineSchedule({
  cron: "0 6 * * 1",
  async run({ waitUntil }) {
    waitUntil(getInsightService().runProactiveReview("WEEKLY"));
  },
});
