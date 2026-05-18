-- Redefine Client so each WhatsApp channel can keep its own conversations.
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsappJid" TEXT,
    "whatsappChannelKey" TEXT NOT NULL DEFAULT 'atendimento-1',
    "status" TEXT NOT NULL DEFAULT 'NOVO',
    "history" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Client" (
    "id",
    "name",
    "phone",
    "whatsappJid",
    "whatsappChannelKey",
    "status",
    "history",
    "userId",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "name",
    "phone",
    "whatsappJid",
    'atendimento-1',
    "status",
    "history",
    "userId",
    "createdAt",
    "updatedAt"
FROM "Client";

DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";

CREATE INDEX "Client_userId_idx" ON "Client"("userId");
CREATE INDEX "Client_userId_whatsappChannelKey_idx" ON "Client"("userId", "whatsappChannelKey");
CREATE UNIQUE INDEX "Client_userId_whatsappChannelKey_phone_key" ON "Client"("userId", "whatsappChannelKey", "phone");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
