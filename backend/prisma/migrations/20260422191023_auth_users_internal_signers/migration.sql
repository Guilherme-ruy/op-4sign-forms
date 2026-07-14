-- CreateTable
CREATE TABLE "UserTemplateAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserTemplateAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserTemplateAccess_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PublicLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "batchId" TEXT,
    "createdById" TEXT,
    "clientName" TEXT,
    "clientEmail" TEXT,
    "additionalSigners" TEXT,
    "internalSigners" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "emailSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PublicLink_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PublicLink_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "LinkBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PublicLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PublicLink" ("accessCount", "additionalSigners", "batchId", "clientEmail", "clientName", "createdAt", "emailSentAt", "expiresAt", "id", "revokedAt", "templateId", "token", "updatedAt") SELECT "accessCount", "additionalSigners", "batchId", "clientEmail", "clientName", "createdAt", "emailSentAt", "expiresAt", "id", "revokedAt", "templateId", "token", "updatedAt" FROM "PublicLink";
DROP TABLE "PublicLink";
ALTER TABLE "new_PublicLink" RENAME TO "PublicLink";
CREATE UNIQUE INDEX "PublicLink_token_key" ON "PublicLink"("token");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "UserTemplateAccess_userId_templateId_key" ON "UserTemplateAccess"("userId", "templateId");
