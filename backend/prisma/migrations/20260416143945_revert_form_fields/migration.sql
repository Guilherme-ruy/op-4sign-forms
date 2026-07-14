/*
  Warnings:

  - You are about to drop the column `formFields` on the `DocumentTemplate` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DocumentTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "d4signTemplateId" TEXT,
    "localTemplatePath" TEXT,
    "documentType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DocumentTemplate" ("createdAt", "d4signTemplateId", "description", "documentType", "id", "localTemplatePath", "name", "updatedAt") SELECT "createdAt", "d4signTemplateId", "description", "documentType", "id", "localTemplatePath", "name", "updatedAt" FROM "DocumentTemplate";
DROP TABLE "DocumentTemplate";
ALTER TABLE "new_DocumentTemplate" RENAME TO "DocumentTemplate";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
