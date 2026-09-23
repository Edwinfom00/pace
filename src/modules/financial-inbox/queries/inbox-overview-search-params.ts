import { z } from "zod";

import {
  DEFAULT_INBOX_OVERVIEW_QUERY,
  INBOX_OVERVIEW_MAX_PAGE,
  type InboxOverviewQuery,
} from "../inbox-overview";
import { INBOX_REASONS } from "../domain";

export type InboxOverviewSearchParams = Record<string, string | string[] | undefined>;

const pageSchema = z.coerce.number().int().min(1).max(INBOX_OVERVIEW_MAX_PAGE);
const reasonSchema = z.enum(INBOX_REASONS);

export function parseInboxOverviewSearchParams(
  searchParams: InboxOverviewSearchParams,
): InboxOverviewQuery {
  const page = pageSchema.safeParse(first(searchParams.page));
  const reason = reasonSchema.safeParse(first(searchParams.reason));
  return {
    ...DEFAULT_INBOX_OVERVIEW_QUERY,
    page: page.success ? page.data : 1,
    reason: reason.success ? reason.data : null,
  };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
