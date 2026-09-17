import { z } from "zod";

export class CortexError extends Error {
  constructor(
    public status: number,
    public code: string,
    public requestId: string | null = null,
  ) {
    super(`${code}${requestId ? ` (request ${requestId})` : ""}`);
  }
}

export async function responseError(response: Response): Promise<CortexError> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = z.object({
    code: z.string().optional(),
    detail: z.unknown().optional(),
    request_id: z.string().nullish(),
  }).safeParse(body);
  // Current PDF endpoint intentionally uses the same message for invalid/expired capabilities.
  const code = response.status === 401 && parsed.success &&
      parsed.data.detail === "Invalid or expired reference token"
    ? "REFERENCE_TOKEN_INVALID_OR_EXPIRED"
    : parsed.success && parsed.data.code
    ? parsed.data.code
    : `HTTP_${response.status}`;
  return new CortexError(
    response.status,
    code,
    response.headers.get("x-request-id") ??
      (parsed.success ? parsed.data.request_id ?? null : null),
  );
}
