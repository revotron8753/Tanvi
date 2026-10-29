export type OrderStatus = "PENDING_PAYMENT" | "PLACED" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELLED";

/** Allowed staff/system transitions. Anything else is rejected by the service. */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus): boolean => TRANSITIONS[from].includes(to);
export const isCancellable = (s: OrderStatus): boolean => canTransition(s, "CANCELLED");

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PLACED: "Placed (awaiting confirmation)",
  CONFIRMED: "Confirmed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};
