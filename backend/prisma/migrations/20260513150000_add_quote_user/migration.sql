ALTER TABLE "Quote" ADD COLUMN "userId" TEXT;

ALTER TABLE "Client" ADD COLUMN "userId" TEXT;

UPDATE "Quote"
SET "userId" = (
    SELECT "id"
    FROM "User"
    ORDER BY CASE WHEN "role" = 'ADMIN' THEN 0 ELSE 1 END, "createdAt"
    LIMIT 1
)
WHERE "userId" IS NULL;

UPDATE "Client"
SET "userId" = (
    SELECT "id"
    FROM "User"
    ORDER BY CASE WHEN "role" = 'ADMIN' THEN 0 ELSE 1 END, "createdAt"
    LIMIT 1
)
WHERE "userId" IS NULL;

DROP INDEX IF EXISTS "Client_phone_key";

CREATE INDEX "Quote_userId_idx" ON "Quote"("userId");
CREATE INDEX "Client_userId_idx" ON "Client"("userId");
CREATE UNIQUE INDEX "Client_userId_phone_key" ON "Client"("userId", "phone");
