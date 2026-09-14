import { ZodError, type ZodType } from "zod";

import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
} from "@/authorization/errors";
import { ImportParseError } from "@/modules/imports/parsers";

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ZodError([
      {
        code: "custom",
        path: [],
        message: "Request body must contain valid JSON.",
      },
    ]);
  }

  return schema.parse(body);
}

export function jsonError(error: unknown): Response {
  if (error instanceof ZodError) {
    return Response.json(
      { error: "Validation failed.", issues: error.issues },
      { status: 400 },
    );
  }

  if (error instanceof ImportParseError) {
    return Response.json({ error: error.message, code: error.code }, { status: 400 });
  }

  if (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    error instanceof NotFoundError ||
    error instanceof ConflictError
  ) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  console.error("Unhandled API error", error);
  return Response.json({ error: "Internal server error." }, { status: 500 });
}
