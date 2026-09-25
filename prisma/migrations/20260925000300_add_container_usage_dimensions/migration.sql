CREATE TYPE "ContainerUsageRateType" AS ENUM ('USAGE', 'STORAGE');

ALTER TABLE "container_usage_rates"
  ADD COLUMN "rate_type" "ContainerUsageRateType" NOT NULL DEFAULT 'USAGE',
  ADD COLUMN "origin_terminal_id" INTEGER;

ALTER TABLE "container_usage_rates"
  ADD CONSTRAINT "container_usage_rates_origin_terminal_id_fkey"
  FOREIGN KEY ("origin_terminal_id") REFERENCES "terminals"("terminal_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "container_usage_rates_dimensions_idx"
  ON "container_usage_rates"("container_id", "status_id", "rate_type", "origin_terminal_id", "rate_start_date", "rate_finish_date");
