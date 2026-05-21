import prisma from "@/lib/prisma.js"
import type { AuthContext } from "@/types/index.js"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export type TemplateContext = {
  nome?: string
  data?: string
  hora?: string
  medico?: string
  clinica?: string
  procedimento?: string
}

export function renderTemplate(body: string, ctx: TemplateContext): string {
  const map: Record<string, string> = {
    nome: ctx.nome ?? "",
    data: ctx.data ?? "",
    hora: ctx.hora ?? "",
    medico: ctx.medico ?? "",
    clinica: ctx.clinica ?? "",
    procedimento: ctx.procedimento ?? "",
  }
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => map[key] ?? "")
}

const DEFAULT_TEMPLATES = [
  {
    name: "Lembrete de consulta",
    category: "APPOINTMENT_REMINDER",
    body: "Olá {{nome}}, lembramos seu agendamento{{procedimento}} em {{data}} às {{hora}} com {{medico}}. — {{clinica}}",
    sortOrder: 0,
  },
  {
    name: "Confirmação de consulta",
    category: "CONFIRMATION",
    body: "Olá {{nome}}! Sua consulta na {{clinica}} está confirmada para {{data}} às {{hora}}. Qualquer dúvida, responda esta mensagem.",
    sortOrder: 1,
  },
  {
    name: "Mensagem livre",
    category: "MANUAL",
    body: "Olá {{nome}}, tudo bem? Entramos em contato pela {{clinica}}.",
    sortOrder: 2,
  },
] as const

/** Garante templates padrão (ex.: clínica criada antes do seed de WhatsApp). */
export async function ensureDefaultWhatsappTemplates(clinicId: string) {
  for (const tpl of DEFAULT_TEMPLATES) {
    const existing = await prisma.whatsappMessageTemplate.findFirst({
      where: { clinicId, name: tpl.name },
    })
    if (!existing) {
      await prisma.whatsappMessageTemplate.create({
        data: { clinicId, ...tpl },
      })
    }
  }
}

export async function listTemplates(ctx: AuthContext) {
  if (!ctx.clinicId) return []
  await ensureDefaultWhatsappTemplates(ctx.clinicId)
  return prisma.whatsappMessageTemplate.findMany({
    where: { clinicId: ctx.clinicId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })
}

export async function createTemplate(
  ctx: AuthContext,
  data: { name: string; body: string; category?: string; active?: boolean; sortOrder?: number }
) {
  if (!ctx.clinicId) throw new Error("NO_CLINIC")
  return prisma.whatsappMessageTemplate.create({
    data: {
      clinicId: ctx.clinicId,
      name: data.name.trim(),
      body: data.body,
      category: data.category ?? "MANUAL",
      active: data.active ?? true,
      sortOrder: data.sortOrder ?? 0,
    },
  })
}

export async function updateTemplate(
  ctx: AuthContext,
  id: string,
  data: Partial<{ name: string; body: string; category: string; active: boolean; sortOrder: number }>
) {
  const row = await prisma.whatsappMessageTemplate.findFirst({
    where: { id, clinicId: ctx.clinicId ?? "" },
  })
  if (!row) throw new Error("NOT_FOUND")
  return prisma.whatsappMessageTemplate.update({ where: { id }, data })
}

export async function deleteTemplate(ctx: AuthContext, id: string) {
  const row = await prisma.whatsappMessageTemplate.findFirst({
    where: { id, clinicId: ctx.clinicId ?? "" },
  })
  if (!row) throw new Error("NOT_FOUND")
  await prisma.whatsappMessageTemplate.delete({ where: { id } })
}

export async function getTemplate(ctx: AuthContext, id: string) {
  return prisma.whatsappMessageTemplate.findFirst({
    where: { id, clinicId: ctx.clinicId ?? "" },
  })
}

export async function getDefaultReminderTemplate(ctx: AuthContext) {
  if (!ctx.clinicId) return null
  await ensureDefaultWhatsappTemplates(ctx.clinicId)
  return prisma.whatsappMessageTemplate.findFirst({
    where: {
      clinicId: ctx.clinicId,
      category: "APPOINTMENT_REMINDER",
      active: true,
    },
    orderBy: { sortOrder: "asc" },
  })
}

export function buildContextFromAppointment(apt: {
  patient?: { name: string } | null
  doctor?: { name: string } | null
  clinic?: { name: string } | null
  date: Date
  startTime: string
  procedures?: { procedure?: { name: string } }[]
}): TemplateContext {
  const proc = apt.procedures?.[0]?.procedure?.name ?? ""
  const procedimentoFmt = proc ? ` (${proc})` : ""
  return {
    nome: apt.patient?.name ?? "Paciente",
    data: format(new Date(apt.date), "dd/MM/yyyy", { locale: ptBR }),
    hora: apt.startTime,
    medico: apt.doctor?.name ?? "",
    clinica: apt.clinic?.name ?? "",
    procedimento: procedimentoFmt,
  }
}
