/**
 * Permission keys. Authorisation checks permissions, never role names.
 * The role → permission matrix below is a PROPOSAL pending owner review
 * (docs/OPEN_QUESTIONS.md Q5). It is seeded into the DB; the DB is the source of truth at runtime.
 */
export const PERMISSIONS = [
  "dashboard.view",
  "products.read",
  "products.write",
  "products.publish",
  "categories.read",
  "categories.write",
  "inventory.read",
  "inventory.adjust",
  "orders.read",
  "orders.write",
  "customers.read",
  "customers.export",
  "content.write",
  "campaigns.write",
  "whatsapp.read",
  "tryon.read",
  "reports.read",
  "settings.read",
  "settings.write",
  "users.read",
  "users.write",
  "audit.read",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export const ROLE_KEYS = [
  "super_admin",
  "store_manager",
  "product_manager",
  "order_manager",
  "marketing_manager",
  "support_agent",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: "Super Admin",
  store_manager: "Store Manager",
  product_manager: "Product Manager",
  order_manager: "Order Manager",
  marketing_manager: "Marketing Manager",
  support_agent: "Support Agent",
};

export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  super_admin: PERMISSIONS,
  store_manager: [
    "dashboard.view", "products.read", "products.write", "products.publish",
    "categories.read", "categories.write", "inventory.read", "inventory.adjust",
    "orders.read", "orders.write", "customers.read", "whatsapp.read", "tryon.read",
    "reports.read", "settings.read",
  ],
  product_manager: [
    "dashboard.view", "products.read", "products.write", "products.publish",
    "categories.read", "categories.write", "inventory.read",
  ],
  order_manager: [
    "dashboard.view", "products.read", "inventory.read", "inventory.adjust",
    "orders.read", "orders.write", "customers.read", "whatsapp.read",
  ],
  marketing_manager: [
    "dashboard.view", "products.read", "categories.read", "content.write",
    "campaigns.write", "whatsapp.read", "tryon.read", "reports.read",
  ],
  support_agent: ["dashboard.view", "products.read", "orders.read", "customers.read", "whatsapp.read"],
};
