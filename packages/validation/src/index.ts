import { z } from "zod";

export const emailSchema = z.string().trim().email().max(254);

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: z.string().max(128),
  roleKey: z.string().min(1).max(50),
});

export const changePasswordSchema = z.object({
  current: z.string().min(1).max(128),
  next: z.string().max(128),
  confirm: z.string().max(128),
});

export const totpOrRecoveryCodeSchema = z.string().trim().min(6).max(20);

// ---------- Editable website content ----------

const shortText = z.string().trim().max(200).optional();
const longText = z.string().trim().max(20000).optional();

/** Flat superset; each content key uses a subset (see CONTENT_KEYS). Empty strings are treated as unset. */
export const contentDataSchema = z.object({
  eyebrow: shortText,
  title: shortText,
  subtitle: z.string().trim().max(400).optional(),
  body: longText,
  ctaLabel: shortText,
  ctaHref: z.string().trim().max(300).regex(/^(\/[^\s]*|https:\/\/[^\s]+)?$/, "Use a path starting with / or an https:// link").optional(),
  imageKey: z.string().trim().max(200).optional(),
  imageAlt: shortText,
  storeName: shortText,
  address: z.string().trim().max(500).optional(),
  hours: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().max(254).optional(),
  whatsappNumber: z.string().trim().regex(/^(\d{10,15})?$/, "Digits only, with country code, e.g. 919876543210").optional(),
  instagram: z.string().trim().max(300).regex(/^(https:\/\/[^\s]+)?$/, "Use a full https:// link").optional(),
  facebook: z.string().trim().max(300).regex(/^(https:\/\/[^\s]+)?$/, "Use a full https:// link").optional(),
});
export type ContentData = z.infer<typeof contentDataSchema>;
export type ContentField = keyof ContentData;

export interface ContentKeyDef {
  key: string;
  label: string;
  fields: readonly ContentField[];
  group: "Homepage" | "Site" | "Pages" | "Policies";
}

/** The set of editable content blocks. Text is supplied by the business; nothing here is placeholder copy. */
export const CONTENT_KEYS: readonly ContentKeyDef[] = [
  { key: "home.hero", label: "Homepage hero", group: "Homepage", fields: ["eyebrow", "title", "subtitle", "ctaLabel", "ctaHref", "imageKey", "imageAlt"] },
  { key: "home.story", label: "Homepage brand story", group: "Homepage", fields: ["title", "body", "ctaLabel", "ctaHref"] },
  { key: "home.tryon", label: "Homepage AI try-on promotion", group: "Homepage", fields: ["title", "body", "ctaLabel"] },
  { key: "site.contact", label: "Store details", group: "Site", fields: ["storeName", "address", "hours", "phone", "email", "whatsappNumber"] },
  { key: "site.social", label: "Social links", group: "Site", fields: ["instagram", "facebook"] },
  { key: "page.our-story", label: "Our story page", group: "Pages", fields: ["title", "body"] },
  { key: "tryon.consent.en", label: "Try-on photo consent notice (English)", group: "Policies", fields: ["title", "body"] },
  { key: "tryon.consent.hi", label: "Try-on photo consent notice (Hindi)", group: "Policies", fields: ["title", "body"] },
  { key: "policy.shipping", label: "Shipping policy", group: "Policies", fields: ["title", "body"] },
  { key: "policy.returns", label: "Returns & exchanges policy", group: "Policies", fields: ["title", "body"] },
  { key: "policy.privacy", label: "Privacy policy", group: "Policies", fields: ["title", "body"] },
  { key: "policy.terms", label: "Terms of service", group: "Policies", fields: ["title", "body"] },
];

export const POLICY_SLUGS = ["shipping", "returns", "privacy", "terms"] as const;

export const sizeChartSchema = z.object({
  columns: z.array(z.string().trim().min(1).max(40)).min(2).max(10),
  rows: z.array(z.array(z.string().trim().max(40)).min(2).max(10)).min(1).max(30),
});
export type SizeChart = z.infer<typeof sizeChartSchema>;

export const newsletterSchema = z.object({ email: emailSchema, consent: z.literal("on") });

// ---------- Business settings ----------

export const TAX_MODES = ["UNSET", "INCLUSIVE", "EXCLUSIVE"] as const;

/**
 * Business settings. Defaults are deliberately inert: tax is UNSET (no tax computed, no invoices),
 * shipping is free, COD is off. The business must configure real values (docs/OPEN_QUESTIONS.md).
 */
export const settingsSchema = z.object({
  taxMode: z.enum(TAX_MODES).default("UNSET"),
  legalName: z.string().trim().max(200).default(""),
  gstin: z.string().trim().toUpperCase().regex(/^([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/, "GSTIN format is invalid").default(""),
  businessAddress: z.string().trim().max(500).default(""),
  /** 2-digit GST state code of the registered business; decides IGST vs CGST+SGST on invoices. */
  businessStateCode: z.string().trim().regex(/^([0-9]{2})?$/).default(""),
  invoicePrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9/-]{0,12}$/).default(""),
  shippingFlatPaise: z.number().int().min(0).max(10_000_000).default(0),
  freeShippingThresholdPaise: z.number().int().min(0).max(100_000_000).nullable().default(null),
  codEnabled: z.boolean().default(false),
  codMaxOrderPaise: z.number().int().min(0).nullable().default(null),
  codFeePaise: z.number().int().min(0).max(1_000_000).default(0),
  reservationMinutes: z.number().int().min(5).max(1440).default(15),
  /** Show "Only N left"? Off: the storefront shows in / low / out of stock only. */
  showExactStock: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;

export const checkoutSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  phone: z.string().trim().transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=[6-9]\d{9}$)/, "")).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number")),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional().transform((v) => v || undefined),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit PIN code"),
  paymentMethod: z.enum(["ONLINE", "COD"]),
  coupon: z.string().trim().toUpperCase().max(40).optional().transform((v) => v || undefined),
  idempotencyKey: z.string().uuid(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

// ---------- WhatsApp configuration ----------

export const ORDER_EVENTS = ["order.received", "order.confirmed", "order.payment_confirmed", "order.shipped", "order.delivered", "order.cancelled", "order.refunded"] as const;
export type OrderEvent = (typeof ORDER_EVENTS)[number];

/** Variables an order message can carry; templates choose which, and in what order. */
export const ORDER_VARIABLES = ["customer_name", "reference", "total", "tracking"] as const;

export const whatsappConfigSchema = z.object({
  /** Test mode sends only to numbers on the allow-list (SPEC §12). Default ON. */
  testMode: z.boolean().default(true),
  /** 12-digit numbers with country code, e.g. 919876543210. */
  allowedNumbers: z.array(z.string().regex(/^\d{12}$/)).max(50).default([]),
  /** Template per event, exactly as approved by the provider. Absent = that notification is off. */
  templates: z.partialRecord(
    z.enum(ORDER_EVENTS),
    z.object({
      name: z.string().trim().min(1).max(100),
      language: z.string().trim().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, "e.g. en or en_IN"),
      variables: z.array(z.enum(ORDER_VARIABLES)).max(5),
    }),
  ).default({}),
});
export type WhatsAppConfig = z.infer<typeof whatsappConfigSchema>;

// ---------- Try-on configuration ----------

export const tryOnConfigSchema = z.object({
  /** Online (website) try-on stays OFF until privacy, cost and capacity are validated (SPEC §15). */
  onlineEnabled: z.boolean().default(false),
  kioskIdleSeconds: z.number().int().min(20).max(600).default(90),
  /** Hard ceiling for a session regardless of activity. */
  sessionMaxMinutes: z.number().int().min(5).max(120).default(30),
  maxJobsPerSession: z.number().int().min(1).max(50).default(5),
  maxJobsPerDay: z.number().int().min(0).max(100000).default(200),
  /** How long a QR continuation link works. */
  continuationMinutes: z.number().int().min(1).max(120).default(15),
});
export type TryOnConfig = z.infer<typeof tryOnConfigSchema>;
