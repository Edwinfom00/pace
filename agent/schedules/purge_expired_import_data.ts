import { defineSchedule } from "eve/schedules";

import { getImportService } from "@/modules/imports/server";

/** Hourly deterministic expiry of temporary parsed statements; no model or ledger access. */
export default defineSchedule({
  cron: "30 * * * *",
  async run({ waitUntil }) {
    waitUntil(getImportService().purgeExpiredData());
  },
});
