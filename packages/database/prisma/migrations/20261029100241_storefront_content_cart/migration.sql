-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sizeChart" JSONB;

-- CreateTable
CREATE TABLE "WebsiteContent" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "WebsiteContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "unsubscribedAt" TIMESTAMP(3),

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wishlist" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "wishlistId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("wishlistId","productId")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteContent_key_key" ON "WebsiteContent"("key");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Wishlist_tokenHash_key" ON "Wishlist"("tokenHash");

-- CreateIndex
CREATE INDEX "WishlistItem_productId_idx" ON "WishlistItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_tokenHash_key" ON "Cart"("tokenHash");

-- CreateIndex
CREATE INDEX "Cart_expiresAt_idx" ON "Cart"("expiresAt");

-- CreateIndex
CREATE INDEX "CartItem_variantId_idx" ON "CartItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_variantId_key" ON "CartItem"("cartId", "variantId");

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_wishlistId_fkey" FOREIGN KEY ("wishlistId") REFERENCES "Wishlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_quantity_range" CHECK ("quantity" >= 1 AND "quantity" <= 10);
