-- CreateTable
CREATE TABLE "EmailContentSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "accentColor" TEXT,
    "portalDisplayName" TEXT,
    "linkSubject" TEXT,
    "linkTitle" TEXT,
    "linkBody" TEXT,
    "linkButtonText" TEXT,
    "resetSubject" TEXT,
    "resetTitle" TEXT,
    "resetBody" TEXT,
    "resetButtonText" TEXT,
    "inviteSubject" TEXT,
    "inviteTitle" TEXT,
    "inviteBody" TEXT,
    "inviteButtonText" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedById" TEXT
);
