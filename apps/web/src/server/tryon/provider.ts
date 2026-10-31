/**
 * AI try-on provider port. The existing model's API (URL, auth, request/response schema, sync vs async, limits,
 * retention) has NOT been supplied, so there is no adapter and getAiTryOnProvider() returns null. This interface is
 * our own abstraction; the adapter must be written against the real contract, and may need to change this port.
 */
export interface TryOnRequest {
  /** Customer photo, already validated and re-encoded by us. */
  personImage: Buffer;
  /** Approved garment image bytes for the product. */
  garmentImage: Buffer;
  idempotencyKey: string;
}

export type TryOnOutcome =
  | { kind: "succeeded"; resultImage: Buffer; costPaise: number | null }
  | { kind: "accepted"; providerJobId: string };

export class TryOnProviderError extends Error {
  constructor(message: string, readonly code: string, readonly retryable: boolean) {
    super(message);
  }
}

export interface AiTryOnProvider {
  readonly name: string;
  submit(req: TryOnRequest): Promise<TryOnOutcome>;
}
