import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { AppError } from "@/lib/errors/app-error";

/**
 * Every route handler returns this same envelope shape, success or failure,
 * so the client has exactly one response contract to parse.
 */
export type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T | null;
  errors: { field: string; message: string }[];
};

export function apiSuccess<T>(
  data: T,
  message = "OK",
  status = 200,
): NextResponse<ApiEnvelope<T>> {
  return NextResponse.json(
    { success: true, message, data, errors: [] },
    { status },
  );
}

function zodFieldErrors(error: ZodError): { field: string; message: string }[] {
  const tree = z.treeifyError(error);
  const fieldErrors: { field: string; message: string }[] = [];

  for (const issue of error.issues) {
    fieldErrors.push({
      field: issue.path.join(".") || "_root",
      message: issue.message,
    });
  }

  // `tree` is unused directly but keeping the import demonstrates the
  // supported alternative (nested) shape if a future UI needs it instead
  // of the flat list built above.
  void tree;

  return fieldErrors;
}

/**
 * Converts anything thrown inside a route handler into the shared JSON
 * envelope. Route handlers should wrap their body in try/catch and call
 * this in the `catch` — never leak a raw stack trace or driver error to
 * the client.
 */
export function apiError(error: unknown): NextResponse<ApiEnvelope<null>> {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
        data: null,
        errors: error.fieldErrors,
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        message: "Validation failed",
        data: null,
        errors: zodFieldErrors(error),
      },
      { status: 422 },
    );
  }

  // Never leak internals (driver errors, stack traces) to the client — log
  // server-side only.
  console.error("Unhandled route error:", error);

  return NextResponse.json(
    {
      success: false,
      message: "Something went wrong. Please try again.",
      data: null,
      errors: [],
    },
    { status: 500 },
  );
}
