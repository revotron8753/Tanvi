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
