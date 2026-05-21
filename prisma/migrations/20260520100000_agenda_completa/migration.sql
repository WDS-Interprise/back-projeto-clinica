-- Migration aditiva / inicial para PostgreSQL (Agenda completa)
-- Backup recomendado: pg_dump antes de aplicar em banco com dados.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DOCTOR', 'RECEPTION');
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "AppointmentType" AS ENUM ('SCHEDULE', 'BLOCK');
CREATE TYPE "Recurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY');
CREATE TYPE "PaymentStatus" AS ENUM ('NONE', 'PENDING', 'PAID');
CREATE TYPE "BillingStatus" AS ENUM ('PENDING', 'CHARGED', 'RECEIVED');
CREATE TYPE "Gender" AS ENUM ('M', 'F', 'O');

-- Tabelas criadas via prisma db push / migrate deploy quando o banco estiver disponível.
