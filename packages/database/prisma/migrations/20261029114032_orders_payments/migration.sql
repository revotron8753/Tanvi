-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PLACED', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'REFUND_DUE', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ONLINE', 'COD');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('WEB', 'WHATSAPP', 'STORE');

-- CreateEnum
CREATE TYPE "StockState" AS ENUM ('RESERVED', 'COMMITTED', 'RELEASED', 'RESTOCKED');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENT', 'FIXED');

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "source" "OrderSource" NOT NULL DEFAULT 'WEB',
    "customerId" UUID,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "shipLine1" TEXT NOT NULL,
    "shipLine2" TEXT,
    "shipCity" TEXT NOT NULL,
    "shipState" TEXT NOT NULL,
    "shipPincode" TEXT NOT NULL,
    "subtotalPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "shippingPaise" INTEGER NOT NULL DEFAULT 0,
    "codFeePaise" INTEGER NOT NULL DEFAULT 0,
    "taxPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "taxMode" TEXT NOT NULL,
    "couponCode" TEXT,
    "accessTokenHash" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "reservationExpiresAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "staffNote" TEXT,
    "placedByStaffId" UUID,
    "invoiceNumber" TEXT,
    "invoicedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "hsnCode" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "gstRateBps" INTEGER,
    "taxPaise" INTEGER NOT NULL DEFAULT 0,
    "stockState" "StockState" NOT NULL DEFAULT 'RESERVED',

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "shippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" INTEGER NOT NULL,
    "minSubtotalPaise" INTEGER NOT NULL DEFAULT 0,
    "maxDiscountPaise" INTEGER,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("year")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Order_invoiceNumber_key" ON "Order"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_reservationExpiresAt_idx" ON "Order"("reservationExpiresAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_providerOrderId_key" ON "PaymentAttempt"("providerOrderId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_orderId_idx" ON "PaymentAttempt"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "WebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Money invariants.
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_money_nonneg" CHECK ("subtotalPaise" >= 0 AND "discountPaise" >= 0 AND "shippingPaise" >= 0 AND "codFeePaise" >= 0 AND "taxPaise" >= 0 AND "totalPaise" >= 0),
  ADD CONSTRAINT "Order_discount_le_subtotal" CHECK ("discountPaise" <= "subtotalPaise"),
  ADD CONSTRAINT "Order_pincode_format" CHECK ("shipPincode" ~ '^[1-9][0-9]{5}$');
ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_qty_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "OrderItem_money_nonneg" CHECK ("unitPricePaise" >= 0 AND "discountPaise" >= 0 AND "taxPaise" >= 0);
ALTER TABLE "Coupon"
  ADD CONSTRAINT "Coupon_value_positive" CHECK ("value" > 0),
  ADD CONSTRAINT "Coupon_percent_range" CHECK ("type" <> 'PERCENT' OR "value" <= 10000);
