import { z } from "zod";

import { WORKSPACE_ROLES } from "@/authorization/workspace-permissions";

import { WORKSPACE_TYPES } from "./domain";

const currencyCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const locale = z.string().trim().min(2).max(35);
const timezone = z.string().trim().min(1).max(64);

export const workspacePreferencesSchema = z.object({
  currency: currencyCode.default("USD"),
  locale: locale.default("en-US"),
  timezone: timezone.default("UTC"),
  weekStartsOn: z.number().int().min(0).max(6).default(1),
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(WORKSPACE_TYPES),
  preferences: workspacePreferencesSchema.optional(),
});

export const updateWorkspacePreferencesSchema = workspacePreferencesSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one preference must be supplied.",
);

export const createInvitationSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()).optional(),
  role: z.enum(WORKSPACE_ROLES).refine((role) => role !== "OWNER", {
    message: "An invitation cannot grant the OWNER role.",
  }),
  expiresInHours: z.number().int().min(1).max(24 * 30).default(24 * 7),
});

export const joinInvitationSchema = z
  .object({
    token: z.string().trim().min(43).max(128).optional(),
    code: z.string().trim().toUpperCase().transform((value) => value.replaceAll("-", "")).optional(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.token) === Boolean(value.code)) {
      context.addIssue({
        code: "custom",
        message: "Provide exactly one invitation token or short code.",
      });
    }

    if (value.code && !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/.test(value.code)) {
      context.addIssue({
        code: "custom",
        path: ["code"],
        message: "Invitation code is invalid.",
      });
    }
  });
