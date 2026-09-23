BEGIN;

-- CreateEnum
CREATE TYPE "ContainerCategory" AS ENUM ('DRY', 'REF');

-- CreateEnum
CREATE TYPE "ContainerState" AS ENUM ('LOADED', 'EMPTY');

-- CreateEnum
CREATE TYPE "ContainerStatusCode" AS ENUM ('SOC', 'COC');

-- CreateEnum
CREATE TYPE "MainlineOperationType" AS ENUM ('LOAD', 'UNLOAD');

-- CreateEnum
CREATE TYPE "RailServiceUnit" AS ENUM ('PER_TRIP', 'PER_SERVICE');

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "location_id" INTEGER,
ADD COLUMN     "territory_group_id" INTEGER;

-- CreateTable
CREATE TABLE "territory_groups" (
    "territory_group_id" INTEGER NOT NULL,
    "territory_group_code" TEXT NOT NULL,
    "territory_group_name" TEXT NOT NULL,

    CONSTRAINT "territory_groups_pkey" PRIMARY KEY ("territory_group_id")
);

-- CreateTable
CREATE TABLE "cargo" (
    "cargo_id" INTEGER NOT NULL,
    "cargo_name" TEXT NOT NULL,
    "cargo_etsng" TEXT NOT NULL,
    "cargo_tariff_class" INTEGER NOT NULL,

    CONSTRAINT "cargo_pkey" PRIMARY KEY ("cargo_id")
);

-- CreateTable
CREATE TABLE "containers" (
    "container_id" INTEGER NOT NULL,
    "container_size" INTEGER NOT NULL,
    "container_type" TEXT NOT NULL,
    "container_category" "ContainerCategory" NOT NULL,

    CONSTRAINT "containers_pkey" PRIMARY KEY ("container_id")
);

-- CreateTable
CREATE TABLE "container_statuses" (
    "status_id" INTEGER NOT NULL,
    "status_code" "ContainerStatusCode" NOT NULL,
    "status_name" TEXT NOT NULL,

    CONSTRAINT "container_statuses_pkey" PRIMARY KEY ("status_id")
);

-- CreateTable
CREATE TABLE "terminals" (
    "terminal_id" INTEGER NOT NULL,
    "terminal_name" TEXT NOT NULL,
    "location_id" INTEGER NOT NULL,

    CONSTRAINT "terminals_pkey" PRIMARY KEY ("terminal_id")
);

-- CreateTable
CREATE TABLE "location_distances" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER NOT NULL,
    "terminal_id" INTEGER NOT NULL,
    "round_trip_km" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "location_distances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_dry_rates" (
    "rate_id" INTEGER NOT NULL,
    "terminal_id" INTEGER NOT NULL,
    "km_from" INTEGER NOT NULL,
    "km_to" INTEGER NOT NULL,
    "weight_from_kg" INTEGER NOT NULL,
    "weight_to_kg" INTEGER,
    "rate" DECIMAL(18,2) NOT NULL,
    "rate_start_date" TIMESTAMP(3) NOT NULL,
    "rate_finish_date" TIMESTAMP(3),

    CONSTRAINT "auto_dry_rates_pkey" PRIMARY KEY ("rate_id")
);

-- CreateTable
CREATE TABLE "auto_ref_rates" (
    "rate_id" INTEGER NOT NULL,
    "territory_group_id" INTEGER NOT NULL,
    "coefficient" DECIMAL(18,6),
    "surcharge_rub" DECIMAL(18,2),
    "genset_per_day_rub" DECIMAL(18,2) NOT NULL,
    "rate_start_date" TIMESTAMP(3) NOT NULL,
    "rate_finish_date" TIMESTAMP(3),

    CONSTRAINT "auto_ref_rates_pkey" PRIMARY KEY ("rate_id")
);

-- CreateTable
CREATE TABLE "auto_rules" (
    "rule_id" INTEGER NOT NULL,
    "terminal_id" INTEGER NOT NULL,
    "extra_address_rub" DECIMAL(18,2) NOT NULL,
    "deadhead_full_rate" BOOLEAN NOT NULL,
    "overweight_threshold_kg" INTEGER NOT NULL,
    "overweight_per_ton_rub" DECIMAL(18,2) NOT NULL,
    "dangerous_cargo_rub" DECIMAL(18,2) NOT NULL,
    "free_loading_hours" INTEGER NOT NULL,
    "overtime_per_hour_rub" DECIMAL(18,2) NOT NULL,
    "genset_overtime_per_hour_rub" DECIMAL(18,2),
    "customs_free_hours" INTEGER NOT NULL,
    "customs_per_hour_rub" DECIMAL(18,2) NOT NULL,
    "customs_max_per_day_rub" DECIMAL(18,2) NOT NULL,
    "round_partial_ton_up" BOOLEAN NOT NULL,
    "round_partial_hour_up" BOOLEAN NOT NULL,
    "rate_start_date" TIMESTAMP(3) NOT NULL,
    "rate_finish_date" TIMESTAMP(3),
    "round_distance_km_up" BOOLEAN NOT NULL,

    CONSTRAINT "auto_rules_pkey" PRIMARY KEY ("rule_id")
);

-- CreateTable
CREATE TABLE "rail_rates" (
    "rate_id" INTEGER NOT NULL,
    "from_location_id" INTEGER NOT NULL,
    "to_location_id" INTEGER NOT NULL,
    "container_id" INTEGER NOT NULL,
    "container_state" "ContainerState" NOT NULL,
    "cargo_tariff_class" INTEGER,
    "free_storage_days" INTEGER,
    "rate" DECIMAL(18,2) NOT NULL,
    "rate_start_date" TIMESTAMP(3) NOT NULL,
    "rate_finish_date" TIMESTAMP(3),

    CONSTRAINT "rail_rates_pkey" PRIMARY KEY ("rate_id")
);

-- CreateTable
CREATE TABLE "rail_service_rates" (
    "rate_id" INTEGER NOT NULL,
    "from_location_id" INTEGER NOT NULL,
    "to_location_id" INTEGER NOT NULL,
    "container_id" INTEGER NOT NULL,
    "container_state" "ContainerState" NOT NULL,
    "service_code" TEXT NOT NULL,
    "service_unit" "RailServiceUnit" NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "rate_start_date" TIMESTAMP(3) NOT NULL,
    "rate_finish_date" TIMESTAMP(3),

    CONSTRAINT "rail_service_rates_pkey" PRIMARY KEY ("rate_id")
);

-- CreateTable
CREATE TABLE "sea_lilo_rates" (
    "rate_id" INTEGER NOT NULL,
    "from_terminal_id" INTEGER NOT NULL,
    "to_terminal_id" INTEGER NOT NULL,
    "container_id" INTEGER NOT NULL,
    "status_id" INTEGER NOT NULL,
    "container_state" "ContainerState" NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "rate_start_date" TIMESTAMP(3) NOT NULL,
    "rate_finish_date" TIMESTAMP(3),

    CONSTRAINT "sea_lilo_rates_pkey" PRIMARY KEY ("rate_id")
);

-- CreateTable
CREATE TABLE "sea_fios_rates" (
    "rate_id" INTEGER NOT NULL,
    "from_terminal_id" INTEGER NOT NULL,
    "to_terminal_id" INTEGER NOT NULL,
    "container_id" INTEGER NOT NULL,
    "container_state" "ContainerState" NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "rate_start_date" TIMESTAMP(3) NOT NULL,
    "rate_finish_date" TIMESTAMP(3),

    CONSTRAINT "sea_fios_rates_pkey" PRIMARY KEY ("rate_id")
);

-- CreateTable
CREATE TABLE "sea_fios_rules" (
    "rule_id" INTEGER NOT NULL,
    "rule_code" TEXT NOT NULL,
    "rule_value" DECIMAL(18,6) NOT NULL,
    "rule_unit" TEXT NOT NULL,
    "rate_start_date" TIMESTAMP(3) NOT NULL,
    "rate_finish_date" TIMESTAMP(3),

    CONSTRAINT "sea_fios_rules_pkey" PRIMARY KEY ("rule_id")
);

-- CreateTable
CREATE TABLE "container_usage_rates" (
    "rate_id" INTEGER NOT NULL,
    "container_id" INTEGER NOT NULL,
    "status_id" INTEGER NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "rate_start_date" TIMESTAMP(3) NOT NULL,
    "rate_finish_date" TIMESTAMP(3),

    CONSTRAINT "container_usage_rates_pkey" PRIMARY KEY ("rate_id")
);

-- CreateTable
CREATE TABLE "mainline_auto_rates" (
    "rate_id" INTEGER NOT NULL,
    "operation_type" "MainlineOperationType" NOT NULL,
    "setup_location_id" INTEGER NOT NULL,
    "service_location_id" INTEGER NOT NULL,
    "return_location_id" INTEGER NOT NULL,
    "weight_from_kg" INTEGER NOT NULL,
    "weight_to_kg" INTEGER,
    "rate" DECIMAL(18,2) NOT NULL,
    "rate_start_date" TIMESTAMP(3) NOT NULL,
    "rate_finish_date" TIMESTAMP(3),

    CONSTRAINT "mainline_auto_rates_pkey" PRIMARY KEY ("rate_id")
);

-- CreateTable
CREATE TABLE "mainline_auto_rules" (
    "rule_id" INTEGER NOT NULL,
    "extra_address_rub" DECIMAL(18,2) NOT NULL,
    "deadhead_full_rate" BOOLEAN NOT NULL,
    "ref_surcharge_rub" DECIMAL(18,2) NOT NULL,
    "overweight_threshold_kg" INTEGER NOT NULL,
    "overweight_per_ton_rub" DECIMAL(18,2) NOT NULL,
    "genset_per_day_rub" DECIMAL(18,2) NOT NULL,
    "dangerous_cargo_rub" DECIMAL(18,2) NOT NULL,
    "free_loading_hours" INTEGER NOT NULL,
    "overtime_per_hour_rub" DECIMAL(18,2) NOT NULL,
    "genset_overtime_per_hour_rub" DECIMAL(18,2) NOT NULL,
    "customs_free_hours" INTEGER NOT NULL,
    "customs_per_hour_rub" DECIMAL(18,2) NOT NULL,
    "customs_max_per_day_rub" DECIMAL(18,2) NOT NULL,
    "round_partial_ton_up" BOOLEAN NOT NULL,
    "round_partial_hour_up" BOOLEAN NOT NULL,
    "rate_start_date" TIMESTAMP(3) NOT NULL,
    "rate_finish_date" TIMESTAMP(3),

    CONSTRAINT "mainline_auto_rules_pkey" PRIMARY KEY ("rule_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "territory_groups_territory_group_code_key" ON "territory_groups"("territory_group_code");

-- CreateIndex
CREATE INDEX "cargo_cargo_tariff_class_idx" ON "cargo"("cargo_tariff_class");

-- CreateIndex
CREATE UNIQUE INDEX "container_statuses_status_code_key" ON "container_statuses"("status_code");

-- CreateIndex
CREATE INDEX "terminals_location_id_idx" ON "terminals"("location_id");

-- CreateIndex
CREATE INDEX "location_distances_terminal_id_location_id_idx" ON "location_distances"("terminal_id", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_distances_location_id_terminal_id_key" ON "location_distances"("location_id", "terminal_id");

-- CreateIndex
CREATE INDEX "auto_dry_rates_terminal_id_km_from_km_to_weight_from_kg_wei_idx" ON "auto_dry_rates"("terminal_id", "km_from", "km_to", "weight_from_kg", "weight_to_kg");

-- CreateIndex
CREATE INDEX "auto_dry_rates_rate_start_date_rate_finish_date_idx" ON "auto_dry_rates"("rate_start_date", "rate_finish_date");

-- CreateIndex
CREATE INDEX "auto_ref_rates_territory_group_id_rate_start_date_rate_fini_idx" ON "auto_ref_rates"("territory_group_id", "rate_start_date", "rate_finish_date");

-- CreateIndex
CREATE INDEX "auto_rules_terminal_id_rate_start_date_rate_finish_date_idx" ON "auto_rules"("terminal_id", "rate_start_date", "rate_finish_date");

-- CreateIndex
CREATE INDEX "rail_rates_from_location_id_to_location_id_container_id_con_idx" ON "rail_rates"("from_location_id", "to_location_id", "container_id", "container_state", "rate_start_date", "rate_finish_date");

-- CreateIndex
CREATE INDEX "rail_service_rates_from_location_id_to_location_id_containe_idx" ON "rail_service_rates"("from_location_id", "to_location_id", "container_id", "service_code", "service_unit", "rate_start_date", "rate_finish_date");

-- CreateIndex
CREATE INDEX "sea_lilo_rates_from_terminal_id_to_terminal_id_container_id_idx" ON "sea_lilo_rates"("from_terminal_id", "to_terminal_id", "container_id", "status_id", "container_state", "rate_start_date", "rate_finish_date");

-- CreateIndex
CREATE INDEX "sea_fios_rates_from_terminal_id_to_terminal_id_container_id_idx" ON "sea_fios_rates"("from_terminal_id", "to_terminal_id", "container_id", "container_state", "rate_start_date", "rate_finish_date");

-- CreateIndex
CREATE INDEX "sea_fios_rules_rule_code_rate_start_date_rate_finish_date_idx" ON "sea_fios_rules"("rule_code", "rate_start_date", "rate_finish_date");

-- CreateIndex
CREATE INDEX "container_usage_rates_container_id_status_id_rate_start_dat_idx" ON "container_usage_rates"("container_id", "status_id", "rate_start_date", "rate_finish_date");

-- CreateIndex
CREATE INDEX "mainline_auto_rates_operation_type_setup_location_id_servic_idx" ON "mainline_auto_rates"("operation_type", "setup_location_id", "service_location_id", "return_location_id", "rate_start_date", "rate_finish_date");

-- CreateIndex
CREATE INDEX "mainline_auto_rates_weight_from_kg_weight_to_kg_idx" ON "mainline_auto_rates"("weight_from_kg", "weight_to_kg");

-- CreateIndex
CREATE INDEX "mainline_auto_rules_rate_start_date_rate_finish_date_idx" ON "mainline_auto_rules"("rate_start_date", "rate_finish_date");

-- CreateIndex
CREATE UNIQUE INDEX "Location_location_id_key" ON "Location"("location_id");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_territory_group_id_fkey" FOREIGN KEY ("territory_group_id") REFERENCES "territory_groups"("territory_group_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminals" ADD CONSTRAINT "terminals_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "Location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_distances" ADD CONSTRAINT "location_distances_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "Location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_distances" ADD CONSTRAINT "location_distances_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("terminal_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_dry_rates" ADD CONSTRAINT "auto_dry_rates_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("terminal_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_ref_rates" ADD CONSTRAINT "auto_ref_rates_territory_group_id_fkey" FOREIGN KEY ("territory_group_id") REFERENCES "territory_groups"("territory_group_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_rules" ADD CONSTRAINT "auto_rules_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("terminal_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_rates" ADD CONSTRAINT "rail_rates_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "Location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_rates" ADD CONSTRAINT "rail_rates_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "Location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_rates" ADD CONSTRAINT "rail_rates_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("container_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_service_rates" ADD CONSTRAINT "rail_service_rates_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "Location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_service_rates" ADD CONSTRAINT "rail_service_rates_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "Location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rail_service_rates" ADD CONSTRAINT "rail_service_rates_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("container_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sea_lilo_rates" ADD CONSTRAINT "sea_lilo_rates_from_terminal_id_fkey" FOREIGN KEY ("from_terminal_id") REFERENCES "terminals"("terminal_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sea_lilo_rates" ADD CONSTRAINT "sea_lilo_rates_to_terminal_id_fkey" FOREIGN KEY ("to_terminal_id") REFERENCES "terminals"("terminal_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sea_lilo_rates" ADD CONSTRAINT "sea_lilo_rates_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("container_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sea_lilo_rates" ADD CONSTRAINT "sea_lilo_rates_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "container_statuses"("status_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sea_fios_rates" ADD CONSTRAINT "sea_fios_rates_from_terminal_id_fkey" FOREIGN KEY ("from_terminal_id") REFERENCES "terminals"("terminal_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sea_fios_rates" ADD CONSTRAINT "sea_fios_rates_to_terminal_id_fkey" FOREIGN KEY ("to_terminal_id") REFERENCES "terminals"("terminal_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sea_fios_rates" ADD CONSTRAINT "sea_fios_rates_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("container_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_usage_rates" ADD CONSTRAINT "container_usage_rates_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("container_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_usage_rates" ADD CONSTRAINT "container_usage_rates_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "container_statuses"("status_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mainline_auto_rates" ADD CONSTRAINT "mainline_auto_rates_setup_location_id_fkey" FOREIGN KEY ("setup_location_id") REFERENCES "Location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mainline_auto_rates" ADD CONSTRAINT "mainline_auto_rates_service_location_id_fkey" FOREIGN KEY ("service_location_id") REFERENCES "Location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mainline_auto_rates" ADD CONSTRAINT "mainline_auto_rates_return_location_id_fkey" FOREIGN KEY ("return_location_id") REFERENCES "Location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
