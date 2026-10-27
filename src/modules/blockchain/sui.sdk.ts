import "server-only";
import * as grpc from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { RpcError, UnaryCall, type MethodInfo, type RpcOptions, type RpcTransport } from "@protobuf-ts/runtime-rpc";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { ConfigError, ProviderError } from "@/lib/errors";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getTatumGrpcClient } from "./sui.adapter";
import { mapGrpcError, type TatumGrpcClient } from "./tatum.client";

/**
 * The official Sui SDK client (@mysten/sui SuiGrpcClient) over Tatum's Sui
 * gRPC gateway, for building, simulating and executing transactions.
 *
 * Tatum serves native gRPC only (grpc-web is rejected with
 * "unexpected response content type: application/grpc", verified
 * 2026-10-27), so the SDK gets a @grpc/grpc-js transport instead of its
 * default grpc-web one. Every unary call waits on the same spacer and shared
 * budget as the read adapter, and transient failures are retried.
 */

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;
const DEADLINE_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Maps a protobuf-ts RpcError to the same typed errors as the read adapter. */
export function mapRpcError(err: unknown, method: string): unknown {
  if (!(err instanceof RpcError)) return err;
  const code = grpc.status[err.code as keyof typeof grpc.status] ?? grpc.status.UNKNOWN;
  return mapGrpcError({ code, details: err.message, message: err.message } as grpc.ServiceError, method);
}

class ThrottledTransport implements RpcTransport {
  constructor(
    private readonly inner: RpcTransport,
    private readonly gate: Pick<TatumGrpcClient, "throttle">,
  ) {}

  mergeOptions(options?: Partial<RpcOptions>): RpcOptions {
    return this.inner.mergeOptions(options);
  }

  unary<I extends object, O extends object>(method: MethodInfo<I, O>, input: I, options: RpcOptions): UnaryCall<I, O> {
    const finished = (async () => {
      for (let attempt = 0; ; attempt++) {
        await this.gate.throttle();
        try {
          return await this.inner.unary(method, input, { ...options, timeout: options.timeout ?? DEADLINE_MS });
        } catch (raw) {
          const mapped = mapRpcError(raw, method.name);
          if (!(mapped instanceof ProviderError) || !mapped.retryable || attempt >= MAX_RETRIES) throw raw;
          logger.warn("tatum.retry", { method: method.name, attempt, code: mapped.code });
          await sleep(RETRY_BASE_MS * 2 ** attempt);
        }
      }
    })();
    const part = <T>(pick: (f: Awaited<typeof finished>) => T) => {
      const p = finished.then(pick);
      // Callers usually await only the response; the other parts must not surface as unhandled rejections.
      p.catch(() => {});
      return p;
    };
    return new UnaryCall(method, options.meta ?? {}, input, part((f) => f.headers), part((f) => f.response), part((f) => f.status), part((f) => f.trailers));
  }

  serverStreaming(): never {
    throw new Error("Server streaming is not used through the SDK client.");
  }

  clientStreaming(): never {
    throw new Error("Client streaming is not supported.");
  }

  duplex(): never {
    throw new Error("Duplex streaming is not supported.");
  }
}

let sdkClient: SuiGrpcClient | undefined;

export function getSuiSdkClient(): SuiGrpcClient {
  if (sdkClient) return sdkClient;
  const e = env();
  if (!e.tatum.apiKey) throw new ConfigError("Tatum is not configured. Set TATUM_API_KEY (a Sui Testnet key) in .env.local.", "CONFIG_MISSING");
  const inner = new GrpcTransport({
    host: e.tatum.grpcEndpoint,
    channelCredentials: grpc.credentials.createSsl(),
    meta: { "x-api-key": e.tatum.apiKey },
  });
  sdkClient = new SuiGrpcClient({ network: e.network, transport: new ThrottledTransport(inner, getTatumGrpcClient()) });
  return sdkClient;
}
