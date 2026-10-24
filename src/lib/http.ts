import "server-only";
import { unstable_rethrow } from "next/navigation";
import { toApiError } from "./errors";
import { logger } from "./logger";

export function newRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Wraps a route handler body with a request ID, structured logging and typed
 * error serialization. Failures are returned as explicit errors, never as
 * fabricated successful payloads.
 */
export async function handle<T>(
  route: string,
  fn: (requestId: string) => Promise<T>,
): Promise<Response> {
  const requestId = newRequestId();
  const started = performance.now();
  try {
    const data = await fn(requestId);
    logger.info("request.ok", { route, requestId, ms: Math.round(performance.now() - started) });
    return Response.json(data, { headers: { "x-request-id": requestId } });
  } catch (err) {
    // Let Next.js control-flow errors (e.g. prerender bail-outs) propagate untouched.
    unstable_rethrow(err);
    const { status, body } = toApiError(err, requestId);
    const log = status >= 500 ? logger.error : logger.warn;
    log("request.failed", {
      route,
      requestId,
      status,
      code: body.error.code,
      message: err instanceof Error ? err.message : String(err),
      ms: Math.round(performance.now() - started),
    });
    return Response.json(body, { status, headers: { "x-request-id": requestId } });
  }
}
