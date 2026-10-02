import { z } from "zod";

import {
  RULE_ENTRY_ORIGINS,
  RULE_SET_OPERATORS,
  RULE_TRANSACTION_KINDS,
  RULE_TRIGGERS,
  type RuleAction,
  type RuleCondition,
  type RuleDefinition,
} from "./domain";

export const MAX_RULE_CONDITIONS = 10;
export const MAX_RULE_CONDITION_VALUES = 50;
export const MAX_RULE_TEXT_LENGTH = 160;
export const MIN_RULE_PRIORITY = 1;
export const MAX_RULE_PRIORITY = 10_000;

const id = z.string().trim().uuid();
const idempotencyKey = z.string().trim().min(1).max(180);
const version = z.coerce.date().refine((value) => Number.isFinite(value.getTime()));

export function normalizeRuleText(value: string): string {
  return value.normalize("NFKC").trim().replaceAll(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function uniqueValues<T extends z.ZodType<string>>(item: T) {
  return z
    .array(item)
    .min(1)
    .max(MAX_RULE_CONDITION_VALUES)
    .refine((values) => new Set(values).size === values.length, "Values must be unique.")
    .transform((values) => [...values].sort());
}

const setOperator = z.enum(RULE_SET_OPERATORS);

const textCondition = <F extends "COUNTERPARTY" | "NOTE">(field: F) =>
  z.discriminatedUnion("operator", [
    z
      .object({
        field: z.literal(field),
        operator: z.enum(["EQUALS", "CONTAINS", "STARTS_WITH"]),
        value: z
          .string()
          .transform(normalizeRuleText)
          .pipe(z.string().min(1).max(MAX_RULE_TEXT_LENGTH)),
      })
      .strict(),
    z
      .object({
        field: z.literal(field),
        operator: z.enum(["IS_EMPTY", "IS_NOT_EMPTY"]),
        value: z.null().optional().transform(() => null),
      })
      .strict(),
  ]);

const categoryCondition = z.discriminatedUnion("operator", [
  z
    .object({ field: z.literal("CATEGORY"), operator: setOperator, values: uniqueValues(id) })
    .strict(),
  z
    .object({
      field: z.literal("CATEGORY"),
      operator: z.enum(["IS_EMPTY", "IS_NOT_EMPTY"]),
      values: z.array(z.never()).max(0).optional().transform(() => [] as string[]),
    })
    .strict(),
]);

export const ruleConditionSchema: z.ZodType<RuleCondition, unknown> = z.union([
  z
    .object({
      field: z.literal("TRANSACTION_KIND"),
      operator: setOperator,
      values: uniqueValues(z.enum(RULE_TRANSACTION_KINDS)),
    })
    .strict(),
  z
    .object({
      field: z.literal("ENTRY_ORIGIN"),
      operator: setOperator,
      values: uniqueValues(z.enum(RULE_ENTRY_ORIGINS)),
    })
    .strict(),
  z.object({ field: z.literal("ACCOUNT"), operator: setOperator, values: uniqueValues(id) }).strict(),
  categoryCondition,
  textCondition("COUNTERPARTY"),
  textCondition("NOTE"),
]);

export const ruleActionSchema: z.ZodType<RuleAction, unknown> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ASSIGN_CATEGORY"), categoryId: id }).strict(),
  z.object({ type: z.literal("ROUTE_FOR_REVIEW") }).strict(),
]);

export const ruleDefinitionSchema: z.ZodType<RuleDefinition, unknown> = z
  .object({
    trigger: z.enum(RULE_TRIGGERS),
    conditions: z.array(ruleConditionSchema).min(1).max(MAX_RULE_CONDITIONS),
    action: ruleActionSchema,
  })
  .strict();

const ruleName = z
  .string()
  .transform((value) => value.normalize("NFKC").trim().replaceAll(/\s+/g, " "))
  .pipe(z.string().min(1).max(MAX_RULE_TEXT_LENGTH));

const priority = z.number().int().min(MIN_RULE_PRIORITY).max(MAX_RULE_PRIORITY);

export const createRuleCommand = z
  .object({
    name: ruleName,
    priority,
    trigger: z.enum(RULE_TRIGGERS),
    conditions: z.array(ruleConditionSchema).min(1).max(MAX_RULE_CONDITIONS),
    action: ruleActionSchema,
    enabled: z.boolean().optional(),
    idempotencyKey,
  })
  .strict();

export const updateRuleCommand = z
  .object({
    name: ruleName.optional(),
    priority: priority.optional(),
    trigger: z.enum(RULE_TRIGGERS).optional(),
    conditions: z.array(ruleConditionSchema).min(1).max(MAX_RULE_CONDITIONS).optional(),
    action: ruleActionSchema.optional(),
    expectedUpdatedAt: version,
    idempotencyKey,
  })
  .strict();

export const setRuleEnabledCommand = z
  .object({ enabled: z.boolean(), expectedUpdatedAt: version, idempotencyKey })
  .strict();

export const archiveRuleCommand = z
  .object({ expectedUpdatedAt: version, idempotencyKey })
  .strict();

export const testRuleCommand = z
  .object({
    transactionId: id,
    rule: z.union([
      z.object({ ruleId: id }).strict(),
      z.object({ definition: ruleDefinitionSchema, priority: priority.optional() }).strict(),
    ]),
  })
  .strict();

export type CreateRuleCommand = z.input<typeof createRuleCommand>;
export type UpdateRuleCommand = z.input<typeof updateRuleCommand>;
export type SetRuleEnabledCommand = z.input<typeof setRuleEnabledCommand>;
export type ArchiveRuleCommand = z.input<typeof archiveRuleCommand>;
export type TestRuleCommand = z.input<typeof testRuleCommand>;

export const RULE_MANAGEMENT_REQUEST_ACTIONS = ["ENABLE", "DISABLE", "ARCHIVE"] as const;

export const manageRuleRequest = z
  .object({
    action: z.enum(RULE_MANAGEMENT_REQUEST_ACTIONS),
    expectedUpdatedAt: version,
    idempotencyKey,
  })
  .strict();

export type ManageRuleRequest = z.input<typeof manageRuleRequest>;
