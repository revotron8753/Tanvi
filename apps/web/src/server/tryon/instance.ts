import "server-only";
import type { AiTryOnProvider } from "./provider";

/** null until an adapter is written against the real try-on API contract. See provider.ts. */
export function getAiTryOnProvider(): AiTryOnProvider | null {
  return null;
}
