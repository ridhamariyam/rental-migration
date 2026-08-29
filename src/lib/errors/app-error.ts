/**
 * Thrown by server-side code (route handlers, server actions, service
 * functions) to signal an error that should be turned into a specific HTTP
 * status + human-readable message, instead of a generic 500. See
 * `src/lib/errors/api-response.ts` for how route handlers convert this into
 * a JSON response.
 */
export class AppError extends Error {
  readonly status: number;
  readonly fieldErrors: { field: string; message: string }[];

  constructor(
    message: string,
    status = 400,
    fieldErrors: { field: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  static notFound(message = "Not found"): AppError {
    return new AppError(message, 404);
  }

  static forbidden(
    message = "You do not have permission to do this",
  ): AppError {
    return new AppError(message, 403);
  }

  static unauthorized(message = "Authentication required"): AppError {
    return new AppError(message, 401);
  }

  static conflict(message: string): AppError {
    return new AppError(message, 409);
  }
}
