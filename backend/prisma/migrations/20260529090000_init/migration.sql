-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "wx_openid" VARCHAR(128) NOT NULL,
    "wx_unionid" VARCHAR(128),
    "phone_encrypted" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "relation" VARCHAR(32) NOT NULL,
    "real_name" VARCHAR(64) NOT NULL,
    "gender" VARCHAR(16),
    "birth_date" DATE,
    "disease_type" VARCHAR(128),
    "diagnosed_at" DATE,
    "stage" VARCHAR(64),
    "treatment_phase" VARCHAR(64),
    "primary_hospital" VARCHAR(128),
    "primary_doctor" VARCHAR(64),
    "primary_department" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_entry_templates" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "metric_key" VARCHAR(128) NOT NULL,
    "metric_name" VARCHAR(128) NOT NULL,
    "category" VARCHAR(128) NOT NULL,
    "category_cn" VARCHAR(128) NOT NULL,
    "value_type" VARCHAR(32) NOT NULL,
    "unit" VARCHAR(64),
    "ref_range_low" DECIMAL(18,6),
    "ref_range_high" DECIMAL(18,6),
    "ref_qualitative" VARCHAR(64),
    "ref_text" TEXT,
    "source" VARCHAR(32) NOT NULL DEFAULT 'custom',
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "manual_entry_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_types" (
    "id" UUID NOT NULL,
    "type_key" VARCHAR(128) NOT NULL,
    "canonical_name" VARCHAR(128) NOT NULL,
    "modality" VARCHAR(32) NOT NULL,
    "default_analysis_policy" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "report_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_categories" (
    "id" UUID NOT NULL,
    "category_key" VARCHAR(128) NOT NULL,
    "name_cn" VARCHAR(128) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "metric_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_definitions" (
    "id" UUID NOT NULL,
    "metric_key" VARCHAR(128) NOT NULL,
    "name_cn" VARCHAR(128) NOT NULL,
    "name_en" VARCHAR(128),
    "category_id" UUID NOT NULL,
    "value_type" VARCHAR(32) NOT NULL,
    "default_unit" VARCHAR(64),
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "metric_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mapping_rules" (
    "id" UUID NOT NULL,
    "rule_type" VARCHAR(32) NOT NULL,
    "raw_name" VARCHAR(256) NOT NULL,
    "raw_unit" VARCHAR(64),
    "hospital_scope" VARCHAR(128),
    "report_type_id" UUID,
    "metric_id" UUID,
    "category_id" UUID,
    "normalized_unit" VARCHAR(64),
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 1.0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(32) NOT NULL DEFAULT 'published',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mapping_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mapping_review_items" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "raw_name" VARCHAR(256) NOT NULL,
    "raw_unit" VARCHAR(64),
    "report_original_type" VARCHAR(256),
    "suggested_metric_id" UUID,
    "suggested_report_type_id" UUID,
    "suggested_category_id" UUID,
    "mapping_status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0.0,
    "sample_count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mapping_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_photos" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "object_key" VARCHAR(512) NOT NULL,
    "thumbnail_object_key" VARCHAR(512),
    "mime_type" VARCHAR(64) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" VARCHAR(128),
    "status" VARCHAR(32) NOT NULL DEFAULT 'uploaded',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "report_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_tasks" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "photo_count" INTEGER NOT NULL DEFAULT 0,
    "report_count" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "idempotency_key" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ocr_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_task_photos" (
    "id" UUID NOT NULL,
    "ocr_task_id" UUID NOT NULL,
    "photo_id" UUID NOT NULL,
    "group_id" VARCHAR(128) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ocr_task_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recognized_report_drafts" (
    "id" UUID NOT NULL,
    "ocr_task_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "source_photo_ids" JSONB NOT NULL,
    "page_count" INTEGER NOT NULL DEFAULT 1,
    "basic_info" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "conflicts" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "ocr_evidence" JSONB,
    "provider_metadata" JSONB,
    "status" VARCHAR(32) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recognized_report_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "ocr_task_id" UUID,
    "draft_id" UUID,
    "type" VARCHAR(128) NOT NULL,
    "original_type" VARCHAR(256) NOT NULL,
    "report_type_id" UUID,
    "type_key" VARCHAR(128) NOT NULL,
    "canonical_type_name" VARCHAR(128) NOT NULL,
    "modality" VARCHAR(32) NOT NULL,
    "exam_part" VARCHAR(128),
    "exam_method" VARCHAR(128),
    "analysis_policy" VARCHAR(32) NOT NULL,
    "hospital" VARCHAR(128) NOT NULL,
    "hospital_source" VARCHAR(32) NOT NULL,
    "report_date" DATE NOT NULL,
    "report_date_source" VARCHAR(32) NOT NULL,
    "findings" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "abnormal_count" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "duplicate_group_id" UUID,
    "replaced_by_report_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_metric_values" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "metric_id" UUID,
    "metric_key" VARCHAR(128) NOT NULL,
    "metric_name" VARCHAR(128) NOT NULL,
    "original_metric_name" VARCHAR(256) NOT NULL,
    "category_id" UUID,
    "category" VARCHAR(128) NOT NULL,
    "category_cn" VARCHAR(128) NOT NULL,
    "mapping_status" VARCHAR(32) NOT NULL,
    "value_type" VARCHAR(32) NOT NULL,
    "value_numeric" DECIMAL(18,6),
    "value_qualitative" VARCHAR(64),
    "unit" VARCHAR(64),
    "normalized_unit" VARCHAR(64),
    "ref_range_low" DECIMAL(18,6),
    "ref_range_high" DECIMAL(18,6),
    "ref_qualitative" VARCHAR(64),
    "ref_text" TEXT,
    "tone" VARCHAR(32) NOT NULL,
    "ocr_confidence" DECIMAL(5,4),
    "is_manually_edited" BOOLEAN NOT NULL DEFAULT false,
    "source_photo_ids" JSONB,
    "report_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "report_metric_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_metric_snapshots" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "metric_key" VARCHAR(128) NOT NULL,
    "metric_id" UUID,
    "metric_name" VARCHAR(128) NOT NULL,
    "category" VARCHAR(128) NOT NULL,
    "category_cn" VARCHAR(128) NOT NULL,
    "value_type" VARCHAR(32) NOT NULL,
    "last_value_numeric" DECIMAL(18,6),
    "last_value_qualitative" VARCHAR(64),
    "unit" VARCHAR(64),
    "last_date" DATE NOT NULL,
    "last_report_id" UUID NOT NULL,
    "last_tone" VARCHAR(32) NOT NULL,
    "trend_direction" VARCHAR(32) NOT NULL,
    "trend_label" VARCHAR(64) NOT NULL,
    "measure_count" INTEGER NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duplicate_report_candidates" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "ocr_task_id" UUID,
    "draft_id" UUID,
    "existing_report_id" UUID NOT NULL,
    "match_level" VARCHAR(32) NOT NULL,
    "match_reason" JSONB NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "duplicate_report_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recheck_plans" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "type" VARCHAR(128) NOT NULL,
    "date" DATE NOT NULL,
    "time_of_day" VARCHAR(32),
    "hospital" VARCHAR(128) NOT NULL,
    "department" VARCHAR(128),
    "doctor" VARCHAR(64),
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "reminder_config" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "recheck_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recheck_todos" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "text" VARCHAR(256) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "is_template" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recheck_todos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_wx_openid_key" ON "users"("wx_openid");

-- CreateIndex
CREATE INDEX "profiles_user_id_deleted_at_idx" ON "profiles"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "manual_entry_templates_user_id_profile_id_status_idx" ON "manual_entry_templates"("user_id", "profile_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "manual_entry_templates_profile_id_metric_key_key" ON "manual_entry_templates"("profile_id", "metric_key");

-- CreateIndex
CREATE UNIQUE INDEX "report_types_type_key_key" ON "report_types"("type_key");

-- CreateIndex
CREATE UNIQUE INDEX "metric_categories_category_key_key" ON "metric_categories"("category_key");

-- CreateIndex
CREATE UNIQUE INDEX "metric_definitions_metric_key_key" ON "metric_definitions"("metric_key");

-- CreateIndex
CREATE INDEX "metric_definitions_category_id_status_idx" ON "metric_definitions"("category_id", "status");

-- CreateIndex
CREATE INDEX "mapping_rules_rule_type_raw_name_raw_unit_status_idx" ON "mapping_rules"("rule_type", "raw_name", "raw_unit", "status");

-- CreateIndex
CREATE INDEX "mapping_rules_version_status_idx" ON "mapping_rules"("version", "status");

-- CreateIndex
CREATE INDEX "mapping_review_items_mapping_status_last_seen_at_idx" ON "mapping_review_items"("mapping_status", "last_seen_at");

-- CreateIndex
CREATE INDEX "mapping_review_items_kind_raw_name_raw_unit_idx" ON "mapping_review_items"("kind", "raw_name", "raw_unit");

-- CreateIndex
CREATE INDEX "report_photos_profile_id_created_at_idx" ON "report_photos"("profile_id", "created_at");

-- CreateIndex
CREATE INDEX "report_photos_sha256_idx" ON "report_photos"("sha256");

-- CreateIndex
CREATE INDEX "ocr_tasks_profile_id_status_created_at_idx" ON "ocr_tasks"("profile_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ocr_tasks_user_id_idempotency_key_key" ON "ocr_tasks"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "ocr_task_photos_ocr_task_id_group_id_sort_order_idx" ON "ocr_task_photos"("ocr_task_id", "group_id", "sort_order");

-- CreateIndex
CREATE INDEX "recognized_report_drafts_ocr_task_id_status_idx" ON "recognized_report_drafts"("ocr_task_id", "status");

-- CreateIndex
CREATE INDEX "recognized_report_drafts_profile_id_created_at_idx" ON "recognized_report_drafts"("profile_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_profile_id_report_date_deleted_at_idx" ON "reports"("profile_id", "report_date", "deleted_at");

-- CreateIndex
CREATE INDEX "reports_profile_id_type_key_report_date_hospital_idx" ON "reports"("profile_id", "type_key", "report_date", "hospital");

-- CreateIndex
CREATE INDEX "reports_ocr_task_id_idx" ON "reports"("ocr_task_id");

-- CreateIndex
CREATE INDEX "reports_duplicate_group_id_idx" ON "reports"("duplicate_group_id");

-- CreateIndex
CREATE INDEX "report_metric_values_profile_id_metric_key_report_date_idx" ON "report_metric_values"("profile_id", "metric_key", "report_date");

-- CreateIndex
CREATE INDEX "report_metric_values_report_id_idx" ON "report_metric_values"("report_id");

-- CreateIndex
CREATE INDEX "report_metric_values_mapping_status_idx" ON "report_metric_values"("mapping_status");

-- CreateIndex
CREATE UNIQUE INDEX "user_metric_snapshots_profile_id_metric_key_key" ON "user_metric_snapshots"("profile_id", "metric_key");

-- CreateIndex
CREATE INDEX "duplicate_report_candidates_profile_id_status_created_at_idx" ON "duplicate_report_candidates"("profile_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "duplicate_report_candidates_draft_id_existing_report_id_idx" ON "duplicate_report_candidates"("draft_id", "existing_report_id");

-- CreateIndex
CREATE INDEX "recheck_plans_profile_id_status_date_idx" ON "recheck_plans"("profile_id", "status", "date");

-- CreateIndex
CREATE INDEX "recheck_todos_plan_id_sort_order_idx" ON "recheck_todos"("plan_id", "sort_order");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_entry_templates" ADD CONSTRAINT "manual_entry_templates_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_entry_templates" ADD CONSTRAINT "manual_entry_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_definitions" ADD CONSTRAINT "metric_definitions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "metric_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mapping_rules" ADD CONSTRAINT "mapping_rules_report_type_id_fkey" FOREIGN KEY ("report_type_id") REFERENCES "report_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mapping_rules" ADD CONSTRAINT "mapping_rules_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metric_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mapping_rules" ADD CONSTRAINT "mapping_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "metric_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_photos" ADD CONSTRAINT "report_photos_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_photos" ADD CONSTRAINT "report_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_tasks" ADD CONSTRAINT "ocr_tasks_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_tasks" ADD CONSTRAINT "ocr_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_task_photos" ADD CONSTRAINT "ocr_task_photos_ocr_task_id_fkey" FOREIGN KEY ("ocr_task_id") REFERENCES "ocr_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognized_report_drafts" ADD CONSTRAINT "recognized_report_drafts_ocr_task_id_fkey" FOREIGN KEY ("ocr_task_id") REFERENCES "ocr_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_ocr_task_id_fkey" FOREIGN KEY ("ocr_task_id") REFERENCES "ocr_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_report_type_id_fkey" FOREIGN KEY ("report_type_id") REFERENCES "report_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_metric_values" ADD CONSTRAINT "report_metric_values_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_metric_values" ADD CONSTRAINT "report_metric_values_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "metric_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_metric_values" ADD CONSTRAINT "report_metric_values_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "metric_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_metric_snapshots" ADD CONSTRAINT "user_metric_snapshots_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_report_candidates" ADD CONSTRAINT "duplicate_report_candidates_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_report_candidates" ADD CONSTRAINT "duplicate_report_candidates_existing_report_id_fkey" FOREIGN KEY ("existing_report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recheck_plans" ADD CONSTRAINT "recheck_plans_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recheck_todos" ADD CONSTRAINT "recheck_todos_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "recheck_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

