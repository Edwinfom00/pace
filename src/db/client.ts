import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (url) {
    return url;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required to access Neon Postgres.");
  }

  // Eve evaluates channel modules for commands such as `eve info`. No database
  // operation runs during that inspection, so a local development placeholder
  // lets the agent be inspected while still failing closed in production.
  return "postgresql://pace:pace@localhost:5432/pace";
}

export const neonSql = neon(getDatabaseUrl());
export const db = drizzle({ client: neonSql, schema });
