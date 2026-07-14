-- CreateTable
CREATE TABLE "AuthToken" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "token"       TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "email"       TEXT NOT NULL,
    "userId"      TEXT,
    "inviteName"  TEXT,
    "inviteRole"  TEXT,
    "inviteDepts" TEXT,
    "expiresAt"   DATETIME NOT NULL,
    "usedAt"      DATETIME,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_token_key" ON "AuthToken"("token");
