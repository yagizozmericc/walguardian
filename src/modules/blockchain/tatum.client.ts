import "server-only";
import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { ProviderError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { RequestBudget } from "./tatum.budget";

/**
 * Low-level transport for Tatum's Sui gRPC gateway.
 *
 * Tatum exposes Sui Testnet over gRPC only (docs.tatum.io/reference/rpc-sui).
 * Authentication is the `x-api-key` metadata header. Protos are vendored from
 * MystenLabs/sui-apis under /proto. This module knows nothing about domain
 * models; see sui.adapter.ts for normalization.
 */

const PROTO_ROOT = path.join(process.cwd(), "proto");
const PROTO_FILES = ["sui/rpc/v2/ledger_service.proto", "sui/rpc/v2/state_service.proto"];

const DEFAULT_DEADLINE_MS = 15_000;
const STREAM_DEADLINE_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

type UnaryFn = (
  req: unknown,
  meta: grpc.Metadata,
  opts: grpc.CallOptions,
  cb: (err: grpc.ServiceError | null, res: unknown) => void,
) => grpc.ClientUnaryCall;
type StreamFn = (req: unknown, meta: grpc.Metadata, opts: grpc.CallOptions) => grpc.ClientReadableStream<unknown>;

interface ServiceClient extends grpc.Client {
  [method: string]: unknown;
}

type ServiceCtor = new (address: string, creds: grpc.ChannelCredentials, options?: grpc.ClientOptions) => ServiceClient;

let packageCache: { LedgerService: ServiceCtor; StateService: ServiceCtor } | undefined;

function loadServices() {
  if (packageCache) return packageCache;
  const definition = protoLoader.loadSync(PROTO_FILES, {
    includeDirs: [PROTO_ROOT],
    keepCase: true,
    longs: String,
    enums: String,
    defaults: false,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(definition) as unknown as {
    sui: { rpc: { v2: { LedgerService: ServiceCtor; StateService: ServiceCtor } } };
  };
  packageCache = loaded.sui.rpc.v2;
  return packageCache;
}

export function mapGrpcError(err: grpc.ServiceError, method: string): ProviderError {
  const detail = `${method}: ${err.details || err.message}`;
  // grpc-js surfaces the gateway's HTTP 429 as UNAVAILABLE; it is a rate limit, not an outage.
  if (/HTTP status code 429/.test(err.details ?? "")) {
    return new ProviderError("tatum", "PROVIDER_RATE_LIMITED", `Tatum rate limit reached (${detail}).`, true);
  }
  switch (err.code) {
    case grpc.status.UNAUTHENTICATED:
    case grpc.status.PERMISSION_DENIED:
      return new ProviderError("tatum", "PROVIDER_UNAUTHORIZED", `Tatum rejected the API key (${detail}). Check TATUM_API_KEY is a valid Testnet key.`);
    case grpc.status.RESOURCE_EXHAUSTED:
      return new ProviderError("tatum", "PROVIDER_RATE_LIMITED", `Tatum rate limit reached (${detail}).`, true);
    case grpc.status.UNAVAILABLE:
    case grpc.status.DEADLINE_EXCEEDED:
      return new ProviderError("tatum", "PROVIDER_UNAVAILABLE", `Tatum Sui gateway unavailable (${detail}).`, true);
    case grpc.status.UNIMPLEMENTED:
      return new ProviderError("tatum", "PROVIDER_UNSUPPORTED", `The Tatum Sui gateway does not support ${method} (${detail}).`);
    case grpc.status.NOT_FOUND:
      return new ProviderError("tatum", "PROVIDER_NOT_FOUND", `Not found or pruned from the node (${detail}).`);
    default:
      return new ProviderError("tatum", "PROVIDER_ERROR", `Tatum request failed (${grpc.status[err.code] ?? err.code}: ${detail}).`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Spaces request starts to stay under the plan's requests-per-second limit
 * (Tatum's free tier returns HTTP 429 above a few requests per second).
 */
export class RequestSpacer {
  private next = 0;
  constructor(private readonly maxPerSecond: number) {}

  async acquire(): Promise<void> {
    const interval = 1000 / this.maxPerSecond;
    const now = Date.now();
    const slot = Math.max(now, this.next);
    this.next = slot + interval;
    if (slot > now) await sleep(slot - now);
  }
}

export interface StreamResult<T> {
  frames: T[];
}

export class TatumGrpcClient {
  private readonly ledger: ServiceClient;
  private readonly state: ServiceClient;

  private readonly spacer: RequestSpacer;

  constructor(
    readonly endpoint: string,
    private readonly apiKey: string,
    maxRequestsPerSecond = 3,
    private readonly budget: RequestBudget | null = null,
  ) {
    this.spacer = new RequestSpacer(maxRequestsPerSecond);
    const { LedgerService, StateService } = loadServices();
    const creds = grpc.credentials.createSsl();
    const options: grpc.ClientOptions = { "grpc.max_receive_message_length": 32 * 1024 * 1024 };
    this.ledger = new LedgerService(endpoint, creds, options);
    this.state = new StateService(endpoint, creds, options);
  }

  private metadata(): grpc.Metadata {
    const meta = new grpc.Metadata();
    meta.set("x-api-key", this.apiKey);
    return meta;
  }

  /** Waits for a request slot under the same spacing and shared budget as this client's own calls. */
  async throttle(): Promise<void> {
    await this.spacer.acquire();
    await this.budget?.acquire();
  }

  private service(name: "ledger" | "state") {
    return name === "ledger" ? this.ledger : this.state;
  }

  /** Unary call with deadline and bounded retry on transient failures. */
  async unary<T>(service: "ledger" | "state", method: string, request: unknown): Promise<T> {
    const client = this.service(service);
    const fn = client[method] as UnaryFn | undefined;
    if (typeof fn !== "function") throw new Error(`Unknown gRPC method ${method}`);

    for (let attempt = 0; ; attempt++) {
      await this.spacer.acquire();
      await this.budget?.acquire();
      try {
        return await new Promise<T>((resolve, reject) => {
          fn.call(client, request, this.metadata(), { deadline: Date.now() + DEFAULT_DEADLINE_MS }, (err, res) =>
            err ? reject(err) : resolve(res as T),
          );
        });
      } catch (raw) {
        const mapped = mapGrpcError(raw as grpc.ServiceError, method);
        if (!mapped.retryable || attempt >= MAX_RETRIES) throw mapped;
        logger.warn("tatum.retry", { method, attempt, code: mapped.code });
        await sleep(RETRY_BASE_MS * 2 ** attempt);
      }
    }
  }

  /** Server-streaming call, collected into memory. Retries only if no frame was received. */
  async serverStream<T>(service: "ledger" | "state", method: string, request: unknown): Promise<T[]> {
    const client = this.service(service);
    const fn = client[method] as StreamFn | undefined;
    if (typeof fn !== "function") throw new Error(`Unknown gRPC method ${method}`);

    for (let attempt = 0; ; attempt++) {
      const frames: T[] = [];
      await this.spacer.acquire();
      await this.budget?.acquire();
      try {
        await new Promise<void>((resolve, reject) => {
          const call = fn.call(client, request, this.metadata(), { deadline: Date.now() + STREAM_DEADLINE_MS });
          call.on("data", (frame: T) => frames.push(frame));
          call.on("error", reject);
          call.on("end", () => resolve());
        });
        return frames;
      } catch (raw) {
        const mapped = mapGrpcError(raw as grpc.ServiceError, method);
        if (!mapped.retryable || frames.length > 0 || attempt >= MAX_RETRIES) throw mapped;
        logger.warn("tatum.retry", { method, attempt, code: mapped.code });
        await sleep(RETRY_BASE_MS * 2 ** attempt);
      }
    }
  }

  close() {
    this.ledger.close();
    this.state.close();
  }
}
