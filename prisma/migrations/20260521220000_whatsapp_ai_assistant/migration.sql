-- Assistente IA no WhatsApp
ALTER TABLE "ClinicWhatsappSettings" ADD COLUMN IF NOT EXISTS "aiAssistantEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClinicWhatsappSettings" ADD COLUMN IF NOT EXISTS "aiAutoReplyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WhatsappChat" ADD COLUMN IF NOT EXISTS "aiPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WhatsappChat" ADD COLUMN IF NOT EXISTS "aiContextJson" TEXT;
