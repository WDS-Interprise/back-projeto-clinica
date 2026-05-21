import { addDays, subHours } from "date-fns"
import prisma from "@/lib/prisma.js"
import type { AuthContext } from "@/types/index.js"
import {
  buildContextFromAppointment,
  getDefaultReminderTemplate,
  renderTemplate,
} from "./whatsapp-template.service.js"
import { resolvePatientWhatsappDigits } from "@/whatsapp/phone.js"
import {
  enqueueOutbox,
  processOutboxItem,
  resolveDefaultConnectionId,
  sendMessageNow,
} from "./whatsapp-messaging.service.js"

const reminderAppointmentInclude = {
  patient: { select: { id: true, name: true, phone: true, whatsapp: true } },
  doctor: { select: { name: true } },
  clinic: { select: { name: true } },
  procedures: { include: { procedure: { select: { name: true } } } },
} as const

export async function sendAppointmentReminder(
  ctx: AuthContext,
  appointmentId: string,
  options?: { templateId?: string; body?: string }
) {
  if (!ctx.clinicId) throw new Error("NO_CLINIC")

  const { ensureDefaultWhatsappTemplates } = await import("./whatsapp-template.service.js")
  await ensureDefaultWhatsappTemplates(ctx.clinicId)

  const apt = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: ctx.clinicId },
    include: reminderAppointmentInclude,
  })
  if (!apt || !apt.patientId || !apt.patient) throw new Error("NOT_FOUND")

  let phone: string
  try {
    phone = resolvePatientWhatsappDigits(apt.patient)
  } catch {
    throw new Error("NO_PHONE")
  }

  const connectionId = await resolveDefaultConnectionId(ctx.clinicId)
  if (!connectionId) throw new Error("NO_WHATSAPP_CONNECTION")

  let body = options?.body?.trim()
  if (!body) {
    const tpl = options?.templateId
      ? await prisma.whatsappMessageTemplate.findFirst({
          where: { id: options.templateId, clinicId: ctx.clinicId },
        })
      : await getDefaultReminderTemplate(ctx)
    if (!tpl) throw new Error("NO_TEMPLATE")
    body = renderTemplate(tpl.body, buildContextFromAppointment(apt))
  }

  await sendMessageNow({
    clinicId: ctx.clinicId,
    connectionId,
    to: phone,
    body,
    patientId: apt.patientId,
    templateId: options?.templateId ?? null,
    appointmentId: apt.id,
  })

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { reminderSentAt: new Date() },
    include: reminderAppointmentInclude,
  })

  return updated
}

export async function runAutomaticReminders() {
  const clinics = await prisma.clinicWhatsappSettings.findMany({
    where: { autoRemindersEnabled: true },
  })

  for (const settings of clinics) {
    let offsets: number[] = [24]
    try {
      offsets = JSON.parse(settings.reminderOffsetsJson) as number[]
    } catch {
      /* default */
    }

    const connectionId = await resolveDefaultConnectionId(settings.clinicId)
    if (!connectionId) continue

    const tpl = await prisma.whatsappMessageTemplate.findFirst({
      where: {
        clinicId: settings.clinicId,
        category: "APPOINTMENT_REMINDER",
        active: true,
      },
      orderBy: { sortOrder: "asc" },
    })
    if (!tpl) continue

    const now = new Date()
    const appointments = await prisma.appointment.findMany({
      where: {
        clinicId: settings.clinicId,
        type: "SCHEDULE",
        status: { in: ["SCHEDULED", "CONFIRMED"] },
        patientId: { not: null },
        date: { gte: subHours(now, 2), lte: addDays(now, 14) },
      },
      include: reminderAppointmentInclude,
    })

    for (const apt of appointments) {
      if (!apt.patient) continue
      let phone: string
      try {
        phone = resolvePatientWhatsappDigits(apt.patient)
      } catch {
        continue
      }

      const [h, m] = apt.startTime.split(":").map(Number)
      const aptAt = new Date(apt.date)
      aptAt.setHours(h ?? 8, m ?? 0, 0, 0)

      if (aptAt <= now) continue

      for (const offsetHours of offsets) {
        const dueAt = subHours(aptAt, offsetHours)
        if (now < dueAt) continue

        const exists = await prisma.appointmentReminderLog.findUnique({
          where: {
            appointmentId_offsetHours: {
              appointmentId: apt.id,
              offsetHours,
            },
          },
        })
        if (exists) continue

        const body = renderTemplate(tpl.body, buildContextFromAppointment(apt))
        const outbox = await enqueueOutbox({
          clinicId: settings.clinicId,
          connectionId,
          to: phone,
          body,
          templateId: tpl.id,
          appointmentId: apt.id,
          offsetHours,
          scheduledAt: now,
        })

        const ok = await processOutboxItem(outbox.id)
        if (ok) {
          await prisma.appointmentReminderLog.create({
            data: { appointmentId: apt.id, offsetHours },
          })
          if (!apt.reminderSentAt) {
            await prisma.appointment.update({
              where: { id: apt.id },
              data: { reminderSentAt: new Date() },
            })
          }
        }
      }
    }
  }
}
