BEGIN;

-- CreateEnum
CREATE TYPE "UserRoleCode" AS ENUM ('ADMIN', 'LEAD', 'MANAGER');

-- CreateEnum
CREATE TYPE "RouteDirection" AS ENUM ('KLD_OUT', 'KLD_IN');

-- CreateEnum
CREATE TYPE "TariffAdditionType" AS ENUM ('FIXED', 'PERCENT', 'PER_UNIT');

-- CreateEnum
CREATE TYPE "TariffStageType" AS ENUM ('AUTO', 'SEA', 'RAIL', 'TERMINAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TariffUnit" AS ENUM ('FIXED', 'KM', 'TON', 'CONTAINER', 'DAY');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" "UserRoleCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BitrixPortal" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "appStatus" TEXT NOT NULL DEFAULT 'INSTALLED',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BitrixPortal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BitrixToken" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BitrixToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Россия',
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "bitrixListId" TEXT,
    "bitrixElementId" TEXT,
    "bitrixUpdatedAt" TIMESTAMP(3),
    "source" TEXT DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TariffType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tariff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tariffTypeId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffStage" (
    "id" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "stageType" "TariffStageType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TariffStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffRow" (
    "id" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "minDistance" DECIMAL(12,2),
    "maxDistance" DECIMAL(12,2),
    "minWeight" DECIMAL(18,3),
    "maxWeight" DECIMAL(18,3),
    "containerTypeId" TEXT,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "routeDirection" "RouteDirection",
    "stageType" "TariffStageType",
    "unit" "TariffUnit" NOT NULL DEFAULT 'FIXED',
    "price" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TariffRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffAddition" (
    "id" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "TariffAdditionType" NOT NULL DEFAULT 'FIXED',
    "value" DECIMAL(18,2) NOT NULL,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TariffAddition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "bitrixUserId" TEXT,
    "email" TEXT,
    "fullName" TEXT,
    "username" TEXT,
    "passwordHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "roleId" TEXT NOT NULL,
    "portalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Calculation" (
    "id" TEXT NOT NULL,
    "portalDomain" TEXT,
    "dealId" TEXT,
    "counterpartyId" TEXT,
    "counterpartyType" TEXT,
    "counterpartyName" TEXT,
    "routeType" TEXT,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "weightKg" DECIMAL(18,3) NOT NULL,
    "volumeM3" DECIMAL(18,3) NOT NULL,
    "transportType" TEXT NOT NULL,
    "containerType" TEXT,
    "containerStatus" TEXT,
    "currency" TEXT NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,
    "clientPrice" DECIMAL(18,2) NOT NULL,
    "margin" DECIMAL(18,2) NOT NULL,
    "marginType" TEXT,
    "marginValue" DOUBLE PRECISION,
    "services" JSONB,
    "warnings" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "tariffSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Calculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalculationLine" (
    "id" TEXT NOT NULL,
    "calculationId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cost" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "tariffId" TEXT,
    "tariffRowId" TEXT,
    "tariffName" TEXT,
    "tariffPrice" DECIMAL(18,2),
    "tariffUnit" TEXT,
    "tariffCalculatedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalculationLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BitrixPortal_memberId_key" ON "BitrixPortal"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "BitrixPortal_domain_key" ON "BitrixPortal"("domain");

-- CreateIndex
CREATE INDEX "BitrixToken_portalId_idx" ON "BitrixToken"("portalId");

-- CreateIndex
CREATE INDEX "BitrixToken_expiresAt_idx" ON "BitrixToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");

-- CreateIndex
CREATE INDEX "Location_isActive_sortOrder_city_idx" ON "Location"("isActive", "sortOrder", "city");

-- CreateIndex
CREATE UNIQUE INDEX "Location_city_region_key" ON "Location"("city", "region");

-- CreateIndex
CREATE UNIQUE INDEX "Location_bitrixListId_bitrixElementId_key" ON "Location"("bitrixListId", "bitrixElementId");

-- CreateIndex
CREATE UNIQUE INDEX "TariffType_code_key" ON "TariffType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Tariff_code_key" ON "Tariff"("code");

-- CreateIndex
CREATE INDEX "Tariff_tariffTypeId_active_idx" ON "Tariff"("tariffTypeId", "active");

-- CreateIndex
CREATE INDEX "TariffStage_stageType_idx" ON "TariffStage"("stageType");

-- CreateIndex
CREATE UNIQUE INDEX "TariffStage_tariffId_stageType_key" ON "TariffStage"("tariffId", "stageType");

-- CreateIndex
CREATE INDEX "TariffRow_tariffId_priority_idx" ON "TariffRow"("tariffId", "priority");

-- CreateIndex
CREATE INDEX "TariffRow_tariffId_fromLocationId_toLocationId_idx" ON "TariffRow"("tariffId", "fromLocationId", "toLocationId");

-- CreateIndex
CREATE INDEX "TariffAddition_tariffId_idx" ON "TariffAddition"("tariffId");

-- CreateIndex
CREATE UNIQUE INDEX "TariffAddition_tariffId_code_key" ON "TariffAddition"("tariffId", "code");

-- CreateIndex
CREATE INDEX "User_bitrixUserId_idx" ON "User"("bitrixUserId");

-- CreateIndex
CREATE INDEX "User_portalId_idx" ON "User"("portalId");

-- CreateIndex
CREATE UNIQUE INDEX "User_portalId_bitrixUserId_key" ON "User"("portalId", "bitrixUserId");

-- CreateIndex
CREATE INDEX "Calculation_dealId_idx" ON "Calculation"("dealId");

-- CreateIndex
CREATE INDEX "Calculation_createdAt_idx" ON "Calculation"("createdAt");

-- CreateIndex
CREATE INDEX "CalculationLine_calculationId_sortOrder_idx" ON "CalculationLine"("calculationId", "sortOrder");

-- AddForeignKey
ALTER TABLE "BitrixToken" ADD CONSTRAINT "BitrixToken_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "BitrixPortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tariff" ADD CONSTRAINT "Tariff_tariffTypeId_fkey" FOREIGN KEY ("tariffTypeId") REFERENCES "TariffType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TariffStage" ADD CONSTRAINT "TariffStage_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TariffRow" ADD CONSTRAINT "TariffRow_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TariffAddition" ADD CONSTRAINT "TariffAddition_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "BitrixPortal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculationLine" ADD CONSTRAINT "CalculationLine_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "Calculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
