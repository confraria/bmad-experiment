-- CreateTable
CREATE TABLE "Todo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" BIGINT NOT NULL,
    "deletedAt" BIGINT
);

-- CreateIndex
CREATE INDEX "Todo_clientId_idx" ON "Todo"("clientId");

-- CreateIndex
CREATE INDEX "Todo_updatedAt_idx" ON "Todo"("updatedAt");
