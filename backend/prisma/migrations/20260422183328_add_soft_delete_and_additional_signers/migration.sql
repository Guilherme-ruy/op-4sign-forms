-- AlterTable
ALTER TABLE "DocumentTemplate" ADD COLUMN "deletedAt" DATETIME;

-- AlterTable
ALTER TABLE "PublicLink" ADD COLUMN "additionalSigners" TEXT;
