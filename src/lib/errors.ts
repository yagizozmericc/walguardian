/**
 * Typed application errors. Each maps to an HTTP status and a stable code the
 * UI uses to render a specific error state (never a fabricated result).
 */

export type ErrorCode =
  | "CONFIG_MISSING"
  | "CONFIG_INVALID"
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "MEMORY_READ_ONLY"
  | "MEMORY_POLICY"
  | "MEMORY_QUOTA"
  | "PROVIDER_UNAUTHORIZED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_UNSUPPORTED"
  | "PROVIDER_NOT_FOUND"
  | "PROVIDER_NETWORK_MISMATCH"
  | "PROVIDER_ERROR"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConfigError extends AppError {
  constructor(message: string, code: "CONFIG_MISSING" | "CONFIG_INVALID" = "CONFIG_INVALID") {
    super(code, message, 503);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION_FAILED", message, 400, details);
  }
}

export type ProviderName = "tatum" | "walrus" | "llm";

export class ProviderError extends AppError {
  constructor(
    readonly provider: ProviderName,
    code: Extract<ErrorCode, `PROVIDER_${string}`>,
    message: string,
    readonly retryable = false,
  ) {
    super(code, message, providerStatus(code), { provider });
  }
}

function providerStatus(code: ErrorCode): number {
  switch (code) {
    case "PROVIDER_NOT_FOUND":
      return 404;
    case "PROVIDER_RATE_LIMITED":
      return 429;
    case "PROVIDER_UNSUPPORTED":
      return 501;
    default:
      return 502;
  }
}

/** Serializable error shape returned by API routes. */
export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; provider?: ProviderName; requestId: string };
}

export function toApiError(err: unknown, requestId: string): { status: number; body: ApiErrorBody } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.message,
          provider: err instanceof ProviderError ? err.provider : undefined,
          requestId,
        },
      },
    };
  }
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: "Unexpected server error.", requestId } },
  };
}
