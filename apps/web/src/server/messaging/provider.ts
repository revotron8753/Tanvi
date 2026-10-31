/**
 * WhatsApp provider port. NO concrete provider exists yet: the provider, its API, auth and webhook signature are
 * unknown (docs/OPEN_QUESTIONS.md). Until an adapter is written from that provider's official documentation,
 * getWhatsAppProvider() returns null and the outbox simply holds messages. Nothing is simulated.
 */
export interface SendTemplateInput {
  to: string; // digits with country code, e.g. 919876543210
  templateName: string;
  language: string;
  variables: string[];
  idempotencyKey: string;
}

export interface WhatsAppProvider {
  readonly name: string;
  sendTemplate(input: SendTemplateInput): Promise<{ providerMessageId: string }>;
}

export class MessagingError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}
