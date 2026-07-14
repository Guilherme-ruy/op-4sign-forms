-- CreateTable
CREATE TABLE "LinkBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LinkBatch_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PublicLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "batchId" TEXT,
    "clientName" TEXT,
    "clientEmail" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PublicLink_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PublicLink_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "LinkBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PublicLink" ("accessCount", "clientEmail", "clientName", "createdAt", "expiresAt", "id", "revokedAt", "templateId", "token", "updatedAt") SELECT "accessCount", "clientEmail", "clientName", "createdAt", "expiresAt", "id", "revokedAt", "templateId", "token", "updatedAt" FROM "PublicLink";
DROP TABLE "PublicLink";
ALTER TABLE "new_PublicLink" RENAME TO "PublicLink";
CREATE UNIQUE INDEX "PublicLink_token_key" ON "PublicLink"("token");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
