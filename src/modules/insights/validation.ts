import { z } from "zod";

export const insightLifecycleSchema = z.object({
  status: z.enum(["READ", "DISMISSED"]),
});

export const notificationPreferenceSchema = z.object({
  dailyEnabled: z.boolean(),
  weeklyEnabled: z.boolean(),
  monthlyEnabled: z.boolean(),
  minimumSeverity: z.enum(["INFO", "WARNING", "CRITICAL"]),
});
