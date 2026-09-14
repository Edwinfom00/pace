export class ImportParseError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ImportParseError";
  }
}
