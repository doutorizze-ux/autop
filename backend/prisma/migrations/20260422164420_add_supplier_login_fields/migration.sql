/*
  Warnings:

  - You are about to drop the column `login` on the `Supplier` table. All the data in the column will be lost.
  - You are about to drop the column `loginType` on the `Supplier` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `Supplier` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'system_settings',
    "aiKey" TEXT,
    "whatsappMode" TEXT NOT NULL DEFAULT 'baileys',
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT,
    "needsLogin" BOOLEAN NOT NULL DEFAULT false,
    "loginUrl" TEXT,
    "loginUserSelector" TEXT,
    "loginPassSelector" TEXT,
    "loginSubmitSelector" TEXT,
    "loginCredential" TEXT,
    "password" TEXT,
    "loginExtraSelector" TEXT,
    "loginExtraValue" TEXT,
    "searchUrl" TEXT,
    "searchBarSelector" TEXT,
    "searchBtnSelector" TEXT,
    "itemContainerSelector" TEXT,
    "productNameSelector" TEXT,
    "priceSelector" TEXT,
    "availableSelector" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Supplier" ("createdAt", "id", "name", "password", "type", "url") SELECT "createdAt", "id", "name", "password", "type", "url" FROM "Supplier";
DROP TABLE "Supplier";
ALTER TABLE "new_Supplier" RENAME TO "Supplier";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
