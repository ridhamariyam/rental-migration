/**
 * Minimal client-side fetch wrapper for this app's shared
 * `{ success, message, data, errors }` API envelope (see
 * `src/lib/errors/api-response.ts` for the server side of this contract).
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly fieldErrors: { field: string; message: string }[];

  constructor(
    message: string,
    status: number,
    fieldErrors: { field: string; message: string }[] = [],
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T | null;
  errors: { field: string; message: string }[];
};

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  // A `FormData` body must set its own `Content-Type`, because only the
  // browser knows the multipart boundary it generated. Forcing the JSON
  // header onto one produces a request the server cannot parse at all, so
  // the header is added for every other body shape and skipped here.
  const isMultipart =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const response = await fetch(path, {
    ...options,
    headers: isMultipart
      ? options.headers
      : { "Content-Type": "application/json", ...options.headers },
  });

  const payload = (await response
    .json()
    .catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.success) {
    throw new ApiClientError(
      payload?.message ?? `Request failed with status ${response.status}`,
      response.status,
      payload?.errors ?? [],
    );
  }

  return payload.data as T;
}
