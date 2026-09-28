ALTER TABLE "Calculation"
  ADD COLUMN "requestFingerprint" TEXT,
  ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "category" "ContainerCategory",
  ADD COLUMN "originLocationId" TEXT,
  ADD COLUMN "destinationLocationId" TEXT,
  ADD COLUMN "containerId" INTEGER,
  ADD COLUMN "cargoId" INTEGER,
  ADD COLUMN "owner" "ContainerStatusCode",
  ADD COLUMN "paymentDelayDays" INTEGER;

ALTER TABLE "Calculation"
  ADD CONSTRAINT "calculations_history_fingerprint_portal_check"
    CHECK ("requestFingerprint" IS NULL OR "portalDomain" IS NOT NULL),
  ADD CONSTRAINT "calculations_current_requires_fingerprint_check"
    CHECK ("isCurrent" = false OR ("portalDomain" IS NOT NULL AND "requestFingerprint" IS NOT NULL));

CREATE INDEX "calculations_requestFingerprint_idx" ON "Calculation"("requestFingerprint");
CREATE INDEX "calculations_counterpartyId_idx" ON "Calculation"("counterpartyId");
CREATE INDEX "calculations_isCurrent_idx" ON "Calculation"("isCurrent");
CREATE INDEX "calculations_originLocationId_idx" ON "Calculation"("originLocationId");
CREATE INDEX "calculations_destinationLocationId_idx" ON "Calculation"("destinationLocationId");
CREATE INDEX "calculations_containerId_idx" ON "Calculation"("containerId");

CREATE UNIQUE INDEX "calculations_current_request_unique_idx"
  ON "Calculation"("portalDomain", "requestFingerprint")
  WHERE "isCurrent" = true
    AND "portalDomain" IS NOT NULL
    AND "requestFingerprint" IS NOT NULL;
