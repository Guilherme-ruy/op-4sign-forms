-- CreateTable: TemplateRecipient
CREATE TABLE "TemplateRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TemplateRecipient_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: RecipientSession
CREATE TABLE "RecipientSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "linkId" TEXT NOT NULL,
    "recipientOrder" INTEGER NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "token" TEXT NOT NULL,
    "formData" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "emailSentAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecipientSession_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "PublicLink" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex: unique token per session
CREATE UNIQUE INDEX "RecipientSession_token_key" ON "RecipientSession"("token");

-- CreateIndex: unique order per template
CREATE UNIQUE INDEX "TemplateRecipient_templateId_order_key" ON "TemplateRecipient"("templateId", "order");

-- AlterTable: add recipientOrder to TemplateField
ALTER TABLE "TemplateField" ADD COLUMN "recipientOrder" INTEGER;

-- AlterTable: add recipientOrder and visibleToOrders to TemplateAttachment
ALTER TABLE "TemplateAttachment" ADD COLUMN "recipientOrder" INTEGER;
ALTER TABLE "TemplateAttachment" ADD COLUMN "visibleToOrders" TEXT;
