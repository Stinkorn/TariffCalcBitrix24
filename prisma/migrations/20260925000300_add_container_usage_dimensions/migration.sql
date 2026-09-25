DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ContainerUsageRateType') THEN
    CREATE TYPE "ContainerUsageRateType" AS ENUM ('USAGE', 'STORAGE');
  END IF;
END $$;

ALTER TABLE "container_usage_rates"
  ADD COLUMN IF NOT EXISTS "rate_type" "ContainerUsageRateType" NOT NULL DEFAULT 'USAGE',
  ADD COLUMN IF NOT EXISTS "origin_terminal_id" INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'container_usage_rates_origin_terminal_id_fkey') THEN
    ALTER TABLE "container_usage_rates"
      ADD CONSTRAINT "container_usage_rates_origin_terminal_id_fkey"
      FOREIGN KEY ("origin_terminal_id") REFERENCES "terminals"("terminal_id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "container_usage_rates_dimensions_idx"
  ON "container_usage_rates"("container_id", "status_id", "rate_type", "origin_terminal_id", "rate_start_date", "rate_finish_date");
