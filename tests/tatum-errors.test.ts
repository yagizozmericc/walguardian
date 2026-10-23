import { status, type ServiceError, Metadata } from "@grpc/grpc-js";
import { describe, expect, it } from "vitest";
import { mapGrpcError } from "@/modules/blockchain/tatum.client";

const err = (code: status, details = "x"): ServiceError =>
  Object.assign(new Error(details), { code, details, metadata: new Metadata() });

describe("mapGrpcError", () => {
  it.each([
    [status.UNAUTHENTICATED, "PROVIDER_UNAUTHORIZED", false],
    [status.PERMISSION_DENIED, "PROVIDER_UNAUTHORIZED", false],
    [status.RESOURCE_EXHAUSTED, "PROVIDER_RATE_LIMITED", true],
    [status.UNAVAILABLE, "PROVIDER_UNAVAILABLE", true],
    [status.DEADLINE_EXCEEDED, "PROVIDER_UNAVAILABLE", true],
    [status.UNIMPLEMENTED, "PROVIDER_UNSUPPORTED", false],
    [status.NOT_FOUND, "PROVIDER_NOT_FOUND", false],
    [status.INTERNAL, "PROVIDER_ERROR", false],
  ] as const)("maps gRPC %s to %s", (code, expected, retryable) => {
    const mapped = mapGrpcError(err(code), "ListTransactions");
    expect(mapped.code).toBe(expected);
    expect(mapped.retryable).toBe(retryable);
    expect(mapped.provider).toBe("tatum");
    expect(mapped.message).toContain("ListTransactions");
  });
});
