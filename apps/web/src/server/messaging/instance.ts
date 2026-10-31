import "server-only";
import type { WhatsAppProvider } from "./provider";

/** null until a real adapter is written and configured. See provider.ts. */
export function getWhatsAppProvider(): WhatsAppProvider | null {
  return null;
}
