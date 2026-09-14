export class AuthenticationError extends Error {
  readonly status = 401;

  constructor(message = "Authentication is required.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  readonly status = 403;

  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends Error {
  readonly status = 404;

  constructor(message = "The requested resource was not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * A typed business-rule conflict. API consumers can present translated,
 * context-specific guidance without inspecting an English error message.
 */
export class DomainConflictError extends ConflictError {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainConflictError";
  }
}
