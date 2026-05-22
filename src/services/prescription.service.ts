import { randomBytes } from "crypto"
import prisma from "@/lib/prisma.js"
import { PUBLIC_APP_URL } from "@/lib/env.js"
import {
  buildPrescriptionFilename,
  buildPrescriptionHtml,
  type PrescriptionPdfData,
} from "@/lib/prescription-pdf.js"
import { htmlToPdfBuffer } from "@/lib/prescription-pdf-render.js"
import { resolveDefaultConnectionId } from "@/services/whatsapp-messaging.service.js"
import type { AuthContext } from "@/types/index.js"
import type {
  CreatePrescriptionInput,
  FinalizePrescriptionInput,
  PrescriptionItemInput,
  UpdatePrescriptionInput,
} from "@/types/prescription.js"

const prescriptionInclude = {
  items: { orderBy: { sortOrder: "asc" as const } },
  patient: {
    select: {
      id: true,
      name: true,
      cpf: true,
      phone: true,
      whatsapp: true,
      address: true,
      birthDate: true,
    },
  },
  professional: { select: { id: true, name: true, email: true } },
  appointment: { select: { id: true, date: true, status: true } },
  shares: { orderBy: { createdAt: "desc" as const }, take: 5 },
  signature: true,
}

function genValidationCode() {
  return randomBytes(4).toString("hex").toUpperCase()
}

function genAccessCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function assertPatientInClinic(ctx: AuthContext, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: ctx.clinicId },
  })
  if (!patient) throw new Error("PATIENT_NOT_FOUND")
  return patient
}

async function assertAppointmentInClinic(
  ctx: AuthContext,
  appointmentId: string | undefined,
  patientId: string
) {
  if (!appointmentId) return null
  const apt = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: ctx.clinicId },
  })
  if (!apt) throw new Error("APPOINTMENT_NOT_FOUND")
  if (apt.patientId && apt.patientId !== patientId) {
    throw new Error("APPOINTMENT_PATIENT_MISMATCH")
  }
  return apt
}

async function getPrescriptionOrThrow(ctx: AuthContext, id: string) {
  const rx = await prisma.prescription.findFirst({
    where: { id, clinicId: ctx.clinicId },
    include: prescriptionInclude,
  })
  if (!rx) throw new Error("NOT_FOUND")
  return rx
}

export async function list(
  ctx: AuthContext,
  params: { patientId?: string; appointmentId?: string; status?: string; limit?: number }
) {
  const where: Record<string, unknown> = { clinicId: ctx.clinicId }
  if (params.patientId) where.patientId = params.patientId
  if (params.appointmentId) where.appointmentId = params.appointmentId
  if (params.status) where.status = params.status

  const data = await prisma.prescription.findMany({
    where,
    include: {
      items: { orderBy: { sortOrder: "asc" }, take: 3 },
      patient: { select: { id: true, name: true } },
      professional: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: params.limit ?? 50,
  })
  return { data }
}

export async function getById(ctx: AuthContext, id: string) {
  return getPrescriptionOrThrow(ctx, id)
}

export async function createDraft(ctx: AuthContext, input: CreatePrescriptionInput) {
  await assertPatientInClinic(ctx, input.patientId)
  await assertAppointmentInClinic(ctx, input.appointmentId, input.patientId)

  return prisma.prescription.create({
    data: {
      clinicId: ctx.clinicId,
      patientId: input.patientId,
      professionalId: ctx.userId,
      appointmentId: input.appointmentId ?? null,
      receiptType: input.receiptType ?? "SIMPLE",
      prescriptionDate: input.prescriptionDate ? new Date(input.prescriptionDate) : new Date(),
      showDate: input.showDate ?? true,
      notes: input.notes ?? null,
      status: "DRAFT",
    },
    include: prescriptionInclude,
  })
}

export async function update(ctx: AuthContext, id: string, input: UpdatePrescriptionInput) {
  const rx = await getPrescriptionOrThrow(ctx, id)
  if (rx.status !== "DRAFT") throw new Error("NOT_EDITABLE")

  if (input.appointmentId !== undefined) {
    await assertAppointmentInClinic(ctx, input.appointmentId ?? undefined, rx.patientId)
  }

  return prisma.prescription.update({
    where: { id },
    data: {
      receiptType: input.receiptType,
      prescriptionDate: input.prescriptionDate ? new Date(input.prescriptionDate) : undefined,
      showDate: input.showDate,
      notes: input.notes,
      appointmentId: input.appointmentId,
    },
    include: prescriptionInclude,
  })
}

export async function addItem(ctx: AuthContext, prescriptionId: string, input: PrescriptionItemInput) {
  const rx = await getPrescriptionOrThrow(ctx, prescriptionId)
  if (rx.status !== "DRAFT") throw new Error("NOT_EDITABLE")

  const maxOrder = rx.items.reduce((m, i) => Math.max(m, i.sortOrder), -1)

  const item = await prisma.prescriptionItem.create({
    data: {
      prescriptionId,
      type: input.type,
      name: input.name.trim(),
      presentation: input.presentation?.trim() || null,
      dosage: input.dosage?.trim() || null,
      frequency: input.frequency?.trim() || null,
      duration: input.duration?.trim() || null,
      quantity: input.quantity?.trim() || null,
      instructions: input.instructions?.trim() || null,
      continuousUse: input.continuousUse ?? false,
      extraJson: input.extraJson ?? null,
      sortOrder: input.sortOrder ?? maxOrder + 1,
    },
  })

  return getById(ctx, prescriptionId).then((full) => ({ prescription: full, item }))
}

export async function removeItem(ctx: AuthContext, prescriptionId: string, itemId: string) {
  const rx = await getPrescriptionOrThrow(ctx, prescriptionId)
  if (rx.status !== "DRAFT") throw new Error("NOT_EDITABLE")

  const item = await prisma.prescriptionItem.findFirst({
    where: { id: itemId, prescriptionId },
  })
  if (!item) throw new Error("ITEM_NOT_FOUND")

  await prisma.prescriptionItem.delete({ where: { id: itemId } })
  return getById(ctx, prescriptionId)
}

async function loadPdfContext(
  rx: Awaited<ReturnType<typeof getPrescriptionOrThrow>>,
  overrides?: Partial<Pick<PrescriptionPdfData, "validationCode" | "accessCode" | "issuedAt" | "signedAt">>
): Promise<PrescriptionPdfData> {
  const clinic = await prisma.clinic.findUnique({ where: { id: rx.clinicId } })
  const doctor = await prisma.doctor.findFirst({
    where: { userId: rx.professionalId },
    select: { crm: true, name: true, specialty: true, phone: true },
  })

  return {
    id: rx.id,
    prescriptionDate: rx.prescriptionDate,
    showDate: rx.showDate,
    validationCode: overrides?.validationCode ?? rx.validationCode ?? "",
    accessCode: overrides?.accessCode ?? rx.accessCode ?? "",
    notes: rx.notes,
    clinicName: clinic?.name ?? "Clinmax",
    clinicPhone: clinic?.phone ?? null,
    patientName: rx.patient.name,
    patientCpf: rx.patient.cpf,
    patientPhone: rx.patient.whatsapp?.trim() || rx.patient.phone?.trim() || null,
    patientAddress: rx.patient.address ?? null,
    patientBirthDate: rx.patient.birthDate ?? null,
    professionalName: doctor?.name ?? rx.professional.name,
    professionalCrm: doctor?.crm ?? null,
    professionalSpecialty: doctor?.specialty ?? null,
    professionalPhone: doctor?.phone ?? null,
    receiptType: rx.receiptType,
    issuedAt: overrides?.issuedAt ?? rx.updatedAt,
    signedAt: overrides?.signedAt !== undefined ? overrides.signedAt : rx.signedAt,
    validateBaseUrl: PUBLIC_APP_URL,
    items: rx.items.map((i) => ({
      type: i.type,
      name: i.name,
      presentation: i.presentation,
      dosage: i.dosage,
      frequency: i.frequency,
      duration: i.duration,
      quantity: i.quantity,
      instructions: i.instructions,
      continuousUse: i.continuousUse,
    })),
  }
}

function buildWhatsAppMessage(pdfData: PrescriptionPdfData): string {
  const dateStr = pdfData.prescriptionDate.toLocaleDateString("pt-BR")
  const signLine = pdfData.signedAt
    ? "Documento assinado digitalmente."
    : "Documento emitido sem assinatura digital."

  return `Olá, ${pdfData.patientName}.

Sua prescrição foi emitida pela Clinmax.

Profissional: Dr(a). ${pdfData.professionalName}
Data: ${dateStr}
ID da receita: ${pdfData.validationCode}

O PDF está anexado nesta mensagem.

${signLine}

Esta é uma mensagem automática.`
}

async function generatePrescriptionPdfBuffer(
  rx: Awaited<ReturnType<typeof getPrescriptionOrThrow>>,
  overrides?: Parameters<typeof loadPdfContext>[1]
): Promise<{ buffer: Buffer; pdfData: PrescriptionPdfData; filename: string }> {
  const pdfData = await loadPdfContext(rx, overrides)
  const html = await buildPrescriptionHtml(pdfData)
  const buffer = await htmlToPdfBuffer(html)
  const filename = buildPrescriptionFilename(pdfData)
  return { buffer, pdfData, filename }
}

async function readPrescriptionPdfBuffer(
  rx: Awaited<ReturnType<typeof getPrescriptionOrThrow>>
): Promise<Buffer> {
  const { buffer } = await generatePrescriptionPdfBuffer(rx)
  return buffer
}

function whatsappShareErrorMessage(err: unknown): string {
  const code = err instanceof Error ? err.message : ""
  switch (code) {
    case "NO_WHATSAPP_CONNECTION":
      return "Nenhum WhatsApp conectado. Vá em Configurações → WhatsApp e conecte uma sessão."
    case "WHATSAPP_NOT_CONNECTED":
      return "A conexão WhatsApp não está ativa. Reconecte em Configurações → WhatsApp."
    case "WHATSAPP_SOCKET_OFFLINE":
      return "WhatsApp desconectado no servidor. Reconecte a sessão em Configurações → WhatsApp."
    default:
      return err instanceof Error ? err.message : "Erro ao enviar WhatsApp"
  }
}

async function tryShareWhatsApp(
  ctx: AuthContext,
  rx: Awaited<ReturnType<typeof getPrescriptionOrThrow>>,
  phone: string,
  pdfData: PrescriptionPdfData,
  pdfBuffer: Buffer
) {
  const connectionId = await resolveDefaultConnectionId(ctx.clinicId)
  if (!connectionId) {
    return prisma.prescriptionShare.create({
      data: {
        prescriptionId: rx.id,
        channel: "WHATSAPP",
        recipient: phone,
        status: "FAILED",
        errorMessage:
          "Nenhum WhatsApp conectado. Vá em Configurações → WhatsApp e conecte uma sessão.",
      },
    })
  }

  const settings = await prisma.clinicWhatsappSettings.findUnique({
    where: { clinicId: ctx.clinicId },
  })
  if (!settings?.defaultConnectionId) {
    await prisma.clinicWhatsappSettings.upsert({
      where: { clinicId: ctx.clinicId },
      create: { clinicId: ctx.clinicId, defaultConnectionId: connectionId },
      update: { defaultConnectionId: connectionId },
    })
  }

  const body = buildWhatsAppMessage(pdfData)
  const fileName = buildPrescriptionFilename(pdfData)

  const share = await prisma.prescriptionShare.create({
    data: {
      prescriptionId: rx.id,
      channel: "WHATSAPP",
      recipient: phone,
      status: "PENDING",
    },
  })

  try {
    const { sendDocumentNow, sendMessageNow } = await import(
      "@/services/whatsapp-messaging.service.js"
    )
    await sendMessageNow({
      clinicId: ctx.clinicId,
      connectionId,
      to: phone,
      body,
      appointmentId: rx.appointmentId,
    })
    await sendDocumentNow({
      clinicId: ctx.clinicId,
      connectionId,
      to: phone,
      buffer: pdfBuffer,
      fileName,
      mimetype: "application/pdf",
      caption: "Sua prescrição Clinmax",
      appointmentId: rx.appointmentId,
    })
    return prisma.prescriptionShare.update({
      where: { id: share.id },
      data: { status: "SENT", sentAt: new Date(), errorMessage: null },
    })
  } catch (err) {
    const msg = whatsappShareErrorMessage(err)
    return prisma.prescriptionShare.update({
      where: { id: share.id },
      data: { status: "FAILED", errorMessage: msg },
    })
  }
}

export async function finalize(
  ctx: AuthContext,
  id: string,
  options: FinalizePrescriptionInput = {}
) {
  const rx = await getPrescriptionOrThrow(ctx, id)
  if (rx.status !== "DRAFT") throw new Error("ALREADY_FINALIZED")
  if (rx.items.length === 0) throw new Error("NO_ITEMS")

  const validationCode = genValidationCode()
  const accessCode = genAccessCode()
  const signedAt = options.signDigital ? new Date() : null
  const issuedAt = new Date()

  const { buffer: pdfBuffer, pdfData } = await generatePrescriptionPdfBuffer(rx, {
    validationCode,
    accessCode,
    issuedAt,
    signedAt,
  })

  await prisma.prescription.update({
    where: { id },
    data: {
      status: "FINALIZED",
      validationCode,
      accessCode,
      pdfPath: null,
      signedAt,
      sentAt: null,
    },
    include: prescriptionInclude,
  })

  if (options.signDigital) {
    await prisma.prescriptionSignature.upsert({
      where: { prescriptionId: id },
      create: { prescriptionId: id, provider: "STUB", certificateType: "A1", status: "PENDING" },
      update: { status: "PENDING" },
    })
  }

  let whatsappSent = false
  if (options.shareWhatsApp) {
    const phone =
      options.sharePhone?.trim() ||
      rx.patient.whatsapp?.trim() ||
      rx.patient.phone?.trim()
    if (phone) {
      const share = await tryShareWhatsApp(ctx, rx, phone, pdfData, pdfBuffer)
      whatsappSent = share.status === "SENT"
    } else {
      await prisma.prescriptionShare.create({
        data: {
          prescriptionId: id,
          channel: "WHATSAPP",
          recipient: "",
          status: "FAILED",
          errorMessage: "Telefone do paciente não informado",
        },
      })
    }
  }

  if (whatsappSent) {
    await prisma.prescription.update({
      where: { id },
      data: { sentAt: new Date() },
    })
  }

  return getById(ctx, id)
}

export async function resendWhatsApp(
  ctx: AuthContext,
  prescriptionId: string,
  phone?: string
) {
  const rx = await getPrescriptionOrThrow(ctx, prescriptionId)
  if (rx.status !== "FINALIZED") throw new Error("NOT_FINALIZED")

  const targetPhone =
    phone?.trim() || rx.patient.whatsapp?.trim() || rx.patient.phone?.trim()
  if (!targetPhone) throw new Error("NO_PHONE")

  const pdfData = await loadPdfContext(rx)
  const pdfBuffer = await readPrescriptionPdfBuffer(rx)
  const share = await tryShareWhatsApp(ctx, rx, targetPhone, pdfData, pdfBuffer)
  if (share.status === "SENT") {
    await prisma.prescription.update({
      where: { id: prescriptionId },
      data: { sentAt: new Date() },
    })
  }

  return getById(ctx, prescriptionId)
}

export async function renew(ctx: AuthContext, id: string) {
  const source = await getPrescriptionOrThrow(ctx, id)
  if (source.status !== "FINALIZED" && source.status !== "DRAFT") {
    throw new Error("CANNOT_RENEW")
  }

  const draft = await prisma.prescription.create({
    data: {
      clinicId: source.clinicId,
      patientId: source.patientId,
      professionalId: ctx.userId,
      appointmentId: source.appointmentId,
      receiptType: source.receiptType,
      prescriptionDate: new Date(),
      showDate: source.showDate,
      notes: source.notes,
      status: "DRAFT",
      items: {
        create: source.items.map((item, idx) => ({
          type: item.type,
          name: item.name,
          presentation: item.presentation,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
          quantity: item.quantity,
          instructions: item.instructions,
          continuousUse: item.continuousUse,
          extraJson: item.extraJson,
          sortOrder: idx,
        })),
      },
    },
    include: prescriptionInclude,
  })

  return draft
}

export async function getPdfFile(ctx: AuthContext, id: string) {
  const rx = await getPrescriptionOrThrow(ctx, id)

  if (rx.status !== "FINALIZED" || !rx.validationCode) {
    throw new Error("PDF_NOT_READY")
  }

  const { buffer, filename } = await generatePrescriptionPdfBuffer(rx)
  return { buffer, contentType: "application/pdf" as const, filename }
}

/** @deprecated Use getPdfFile */
export async function getPdfHtml(ctx: AuthContext, id: string) {
  const file = await getPdfFile(ctx, id)
  return {
    html: file.buffer.toString("base64"),
    contentType: file.contentType,
    filename: file.filename,
  }
}

export async function listTemplates(ctx: AuthContext) {
  const data = await prisma.prescriptionTemplate.findMany({
    where: { clinicId: ctx.clinicId, professionalId: ctx.userId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
    orderBy: { updatedAt: "desc" },
  })
  return { data }
}

export async function validatePublic(code: string, accessCode?: string) {
  const rx = await prisma.prescription.findFirst({
    where: { validationCode: code.toUpperCase(), status: "FINALIZED" },
    select: {
      id: true,
      validationCode: true,
      accessCode: true,
      prescriptionDate: true,
      showDate: true,
      patient: { select: { name: true } },
      professional: { select: { name: true } },
      items: { select: { name: true, type: true }, orderBy: { sortOrder: "asc" } },
    },
  })
  if (!rx) return { valid: false as const, reason: "NOT_FOUND" }
  if (accessCode && rx.accessCode !== accessCode) {
    return { valid: false as const, reason: "INVALID_ACCESS_CODE" }
  }
  return {
    valid: true as const,
    prescription: {
      id: rx.id,
      validationCode: rx.validationCode,
      date: rx.showDate ? rx.prescriptionDate : null,
      patientName: rx.patient.name,
      professionalName: rx.professional.name,
      itemCount: rx.items.length,
      items: rx.items.map((i) => ({ name: i.name, type: i.type })),
    },
  }
}

export async function resolvePatientFromRouteId(
  ctx: AuthContext,
  routeId: string
): Promise<{ patientId: string; appointmentId?: string } | null> {
  const apt = await prisma.appointment.findFirst({
    where: { id: routeId, clinicId: ctx.clinicId },
    select: { patientId: true, id: true },
  })
  if (apt?.patientId) return { patientId: apt.patientId, appointmentId: apt.id }

  const patient = await prisma.patient.findFirst({
    where: { id: routeId, clinicId: ctx.clinicId },
    select: { id: true },
  })
  if (patient) return { patientId: patient.id }

  return null
}
