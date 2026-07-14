-- AlterTable: adiciona modo overlay ao DocumentTemplate
ALTER TABLE "DocumentTemplate" ADD COLUMN "basePdfPath" TEXT;
ALTER TABLE "DocumentTemplate" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'template';
