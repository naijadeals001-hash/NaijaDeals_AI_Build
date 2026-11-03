/**
 * Shared API error type.
 *
 * Lives in its own module so permission and scope helpers can throw it without
 * creating an import cycle with the request guards.
 */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
