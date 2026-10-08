-- Multi-child payment with family discount.
-- Existing payments are untouched: discountCents defaults to 0 and groupId to NULL.

-- CreateTable
CREATE TABLE "PaymentGroup" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT DEFAULT 'Espèces',
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "createdById" INTEGER,

    CONSTRAINT "PaymentGroup_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "groupId" INTEGER;

-- CreateIndex
CREATE INDEX "Payment_groupId_idx" ON "Payment"("groupId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PaymentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
