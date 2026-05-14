ALTER TABLE "Supplier" ADD COLUMN "websiteSearchEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Supplier" ADD COLUMN "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Supplier" ADD COLUMN "whatsappPhone" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "whatsappMessageTemplate" TEXT;
