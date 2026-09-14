import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";

import { db } from "@/db/client";
import { accounts, rateLimits, sessions, users, verifications } from "@/db/schema";

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const SESSION_CACHE_MAX_AGE_SECONDS = 5 * 60;

function requiredEnvironmentVariable(name: string, developmentFallback: string): string {
  const value = process.env[name];

  if (value) {
    return value;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  // Allows local framework inspection before a developer creates .env.local.
  // Production never accepts this value.
  return developmentFallback;
}

function getTrustedOrigins(): string[] {
  const configuredOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins?.length) {
    return configuredOrigins;
  }

  if (process.env.NODE_ENV !== "production") {
    return ["http://localhost:3000", "http://127.0.0.1:3000"];
  }

  throw new Error("BETTER_AUTH_TRUSTED_ORIGINS is required in production.");
}

export const auth = betterAuth({
  appName: "Pace",
  baseURL: requiredEnvironmentVariable("BETTER_AUTH_URL", "http://localhost:3000"),
  secret: requiredEnvironmentVariable(
    "BETTER_AUTH_SECRET",
    "development-only-secret-that-is-never-used-in-production",
  ),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      rateLimit: rateLimits,
    },
  }),
  trustedOrigins: getTrustedOrigins(),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 256,
  },
  session: {
    expiresIn: SESSION_MAX_AGE_SECONDS,
    updateAge: 60 * 60,
    cookieCache: {
      enabled: true,
      maxAge: SESSION_CACHE_MAX_AGE_SECONDS,
      strategy: "jwe",
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    disableCSRFCheck: false,
    disableOriginCheck: false,
    cookiePrefix: "pace",
  },
});

export type AuthSession = typeof auth.$Infer.Session;
