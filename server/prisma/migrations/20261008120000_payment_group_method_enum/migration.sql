-- Aligns PaymentGroup.method on the PaymentMethod enum already used by Payment.method
-- (feat/deploy-docker) instead of the free text introduced by the multi-child payment.
-- Non-destructive: every existing label is mapped to its enum value (unknown -> OTHER),
-- exactly like the conversion of Payment.method in 20260913084512_enums_dates_indexes.

ALTER TABLE "PaymentGroup" ALTER COLUMN "method" DROP DEFAULT;

ALTER TABLE "PaymentGroup" ALTER COLUMN "method" TYPE "PaymentMethod"
  USING (
    CASE
      WHEN "method" IS NULL THEN NULL
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) IN ('espèces', 'especes', 'liquide', 'cash') THEN 'CASH'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) IN ('carte', 'carte_bancaire', 'cb', 'card') THEN 'CARD'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) IN ('virement', 'transfer', 'transfert') THEN 'TRANSFER'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) IN ('chèque', 'cheque') THEN 'CHEQUE'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) IN ('mobile_money', 'mobilemoney') THEN 'MOBILE_MONEY'::"PaymentMethod"
      WHEN upper("method") IN ('CASH', 'CARD', 'TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'OTHER') THEN upper("method")::"PaymentMethod"
      ELSE 'OTHER'::"PaymentMethod"
    END
  );

ALTER TABLE "PaymentGroup" ALTER COLUMN "method" SET DEFAULT 'CASH'::"PaymentMethod";
