-- CreateTable
CREATE TABLE "ocr_provider_configs" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "protocol" VARCHAR(32) NOT NULL DEFAULT 'openai_compatible',
    "base_url" VARCHAR(512) NOT NULL,
    "model" VARCHAR(128) NOT NULL,
    "api_key_encrypted" TEXT,
    "api_key_last4" VARCHAR(16),
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "last_test_at" TIMESTAMPTZ(6),
    "last_test_status" VARCHAR(32),
    "last_test_message" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "ocr_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_provider_config_audits" (
    "id" UUID NOT NULL,
    "config_id" UUID,
    "actor_user_id" UUID,
    "action" VARCHAR(32) NOT NULL,
    "before_summary" JSONB,
    "after_summary" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocr_provider_config_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ocr_provider_configs_is_active_status_idx" ON "ocr_provider_configs"("is_active", "status");

-- CreateIndex
CREATE INDEX "ocr_provider_configs_updated_at_idx" ON "ocr_provider_configs"("updated_at");

-- CreateIndex
CREATE INDEX "ocr_provider_config_audits_config_id_created_at_idx" ON "ocr_provider_config_audits"("config_id", "created_at");

-- CreateIndex
CREATE INDEX "ocr_provider_config_audits_actor_user_id_created_at_idx" ON "ocr_provider_config_audits"("actor_user_id", "created_at");
