import nodemailer from "nodemailer"

import { formatCompanyCopyright } from "@/lib/company-legal.js"
import { resolveMailFrom } from "@/lib/mail-from.js"
import {
  buildClinicInviteEmailHtml,
  buildClinicInviteEmailText,
} from "@/lib/invite-email-template.js"
import {
  applyClinicLogoToInviteAttachments,
  getInviteEmailAttachments,
  getJoinEmailLogoAttachment,
  type InviteEmailAttachment,
} from "@/lib/invite-email-assets.js"
import {
  FRONTEND_URL,
  MAIL_SMTP_HOST,
  MAIL_SMTP_PASS,
  MAIL_SMTP_PORT,
  MAIL_SMTP_USER,
  isMailConfigured,
} from "@/lib/env.js"

export type MailSendResult =
  | { delivered: true }
  | { delivered: false; preview?: { subject: string; text: string }; error?: string }

function createTransport() {
  if (!isMailConfigured()) return null
  return nodemailer.createTransport({
    host: MAIL_SMTP_HOST,
    port: MAIL_SMTP_PORT,
    secure: MAIL_SMTP_PORT === 465,
    auth: {
      user: MAIL_SMTP_USER,
      pass: MAIL_SMTP_PASS,
    },
  })
}

function inviteEmailLayout(bodyHtml: string, logoSrc?: string) {
  const header = logoSrc
    ? `<img src="${logoSrc}" alt="" width="168" style="width:168px;max-width:168px;height:auto;border:0;outline:none;display:block;" />`
    : `<span style="font-size:20px;font-weight:700;color:#006B4D">ClinMax</span>`
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#12261E;max-width:560px;margin:0 auto">
      <div style="padding:20px 0 16px;border-bottom:1px solid #E4EBE6">
        ${header}
      </div>
      <div style="padding:20px 0">${bodyHtml}</div>
      <p style="margin:24px 0 0;font-size:12px;color:#8A9A90;border-top:1px solid #E4EBE6;padding-top:16px">
        Este e-mail foi enviado pela plataforma ClinMax. Se você não esperava esta mensagem, ignore.
        <br />${formatCompanyCopyright()}
      </p>
    </div>
  `
}

function primaryButton(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:#006B4D;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px">${label}</a>`
}

function clinicReplyTo(email?: string | null) {
  const value = email?.trim()
  return value && value.includes("@") ? value : undefined
}

export async function sendMail(input: {
  to: string
  subject: string
  text: string
  html: string
  replyTo?: string
  attachments?: InviteEmailAttachment[]
}): Promise<MailSendResult> {
  const transport = createTransport()
  if (!transport) {
    console.log("[mail:dev] SMTP não configurado. E-mail não enviado.")
    console.log(`[mail:dev] Para: ${input.to}`)
    console.log(`[mail:dev] Assunto: ${input.subject}`)
    if (input.replyTo) console.log(`[mail:dev] Reply-To: ${input.replyTo}`)
    return {
      delivered: false,
      preview: { subject: input.subject, text: input.text },
    }
  }

  try {
    await transport.sendMail({
      from: resolveMailFrom(),
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments?.map((item) => ({
        filename: item.filename,
        path: item.path,
        content: item.content,
        cid: item.cid,
        contentType: item.contentType,
        contentDisposition: "inline" as const,
      })),
    })
    return { delivered: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[mail] Falha ao enviar:", message, err)
    return { delivered: false, error: message }
  }
}

export async function sendClinicInviteEmail(input: {
  to: string
  clinicName: string
  roleLabel: string
  inviteUrl: string
  inviteCode: string
  invitedByName: string
  clinicLogoUrl?: string | null
  clinicReplyTo?: string | null
}) {
  const subject = `Convite ClinMax: ${input.clinicName.trim()}`
  const content = {
    clinicName: input.clinicName.trim(),
    roleLabel: input.roleLabel,
    inviteUrl: input.inviteUrl,
    inviteCode: input.inviteCode,
    invitedByName: input.invitedByName,
    inviteeEmail: input.to,
    expiresInDays: 7,
  }
  const pack = getInviteEmailAttachments()
  const attachments = applyClinicLogoToInviteAttachments(pack.attachments, input.clinicLogoUrl)
  const text = buildClinicInviteEmailText(content)
  const html = buildClinicInviteEmailHtml(content, pack.images)

  return sendMail({
    to: input.to,
    subject,
    text,
    html,
    attachments,
    replyTo: clinicReplyTo(input.clinicReplyTo),
  })
}

export async function sendJoinRequestApprovedEmail(input: {
  to: string
  userName: string
  clinicName: string
  roleLabel: string
  clinicLogoUrl?: string | null
  clinicReplyTo?: string | null
}) {
  const loginUrl = `${FRONTEND_URL.replace(/\/$/, "")}/login`
  const subject = `Acesso aprovado: ${input.clinicName}`
  const text = [
    `Olá, ${input.userName},`,
    "",
    `Sua solicitação de entrada na clínica ${input.clinicName} foi aprovada.`,
    `Cargo: ${input.roleLabel}`,
    "",
    `Acesse o ClinMax: ${loginUrl}`,
  ].join("\n")

  const logo = getJoinEmailLogoAttachment(input.clinicLogoUrl)
  const html = inviteEmailLayout(
    `
    <h2 style="margin:0 0 12px;font-size:20px;color:#12261E">Acesso aprovado</h2>
    <p style="margin:0 0 12px;color:#5B6B63">Olá, <strong>${input.userName}</strong>. Sua solicitação de entrada na clínica <strong>${input.clinicName}</strong> foi aprovada.</p>
    <p style="margin:0 0 20px;color:#5B6B63">Cargo: <strong>${input.roleLabel}</strong></p>
    <p style="margin:0">${primaryButton(loginUrl, "Entrar no ClinMax")}</p>
  `,
    logo.src,
  )

  return sendMail({
    to: input.to,
    subject,
    text,
    html,
    attachments: [logo.attachment],
    replyTo: clinicReplyTo(input.clinicReplyTo),
  })
}

export async function sendJoinRequestRejectedEmail(input: {
  to: string
  userName: string
  clinicName: string
  clinicLogoUrl?: string | null
  clinicReplyTo?: string | null
}) {
  const subject = `Solicitação não aprovada: ${input.clinicName}`
  const text = [
    `Olá, ${input.userName},`,
    "",
    `Sua solicitação de entrada na clínica ${input.clinicName} não foi aprovada neste momento.`,
    "",
    "Entre em contato com a administração da clínica se precisar de mais informações.",
  ].join("\n")

  const logo = getJoinEmailLogoAttachment(input.clinicLogoUrl)
  const html = inviteEmailLayout(
    `
    <h2 style="margin:0 0 12px;font-size:20px;color:#12261E">Solicitação não aprovada</h2>
    <p style="margin:0 0 12px;color:#5B6B63">Olá, <strong>${input.userName}</strong>. Sua solicitação de entrada na clínica <strong>${input.clinicName}</strong> não foi aprovada neste momento.</p>
    <p style="margin:0;color:#8A9A90;font-size:13px">Entre em contato com a administração da clínica se precisar de mais informações.</p>
  `,
    logo.src,
  )

  return sendMail({
    to: input.to,
    subject,
    text,
    html,
    attachments: [logo.attachment],
    replyTo: clinicReplyTo(input.clinicReplyTo),
  })
}

export async function sendPrescriptionPdfEmail(input: {
  to: string
  patientName: string
  professionalName: string
  clinicName: string
  validationCode: string
  dateLabel: string
  validateUrl: string
  signatureNote: string
  pdfBuffer: Buffer
  fileName: string
  replyTo?: string | null
}): Promise<MailSendResult> {
  const subject = `Prescricao ClinMax: ${input.clinicName}`
  const text = [
    `Ola, ${input.patientName}.`,
    "",
    `Sua prescricao foi emitida pela clinica ${input.clinicName}.`,
    `Profissional: ${input.professionalName}`,
    `Data: ${input.dateLabel}`,
    `Codigo da receita: ${input.validationCode}`,
    "",
    input.signatureNote,
    "",
    `Validar: ${input.validateUrl}`,
    "",
    "O PDF esta em anexo.",
  ].join("\n")

  const html = inviteEmailLayout(`
    <h2 style="margin:0 0 12px;font-size:20px;color:#12261E">Sua prescricao</h2>
    <p style="margin:0 0 12px;color:#5B6B63">Ola, <strong>${input.patientName}</strong>. A clinica <strong>${input.clinicName}</strong> enviou sua prescricao.</p>
    <p style="margin:0 0 8px;color:#5B6B63">Profissional: <strong>${input.professionalName}</strong></p>
    <p style="margin:0 0 8px;color:#5B6B63">Data: <strong>${input.dateLabel}</strong></p>
    <p style="margin:0 0 16px;color:#5B6B63">Codigo: <strong>${input.validationCode}</strong></p>
    <p style="margin:0 0 16px;font-size:13px;color:#8A9A90">${input.signatureNote}</p>
    <p style="margin:0">${primaryButton(input.validateUrl, "Validar receita")}</p>
  `)

  const transport = createTransport()
  if (!transport) {
    console.log("[mail:dev] SMTP nao configurado. Prescricao nao enviada por e-mail.")
    return {
      delivered: false,
      preview: { subject, text },
      error: "SMTP da plataforma nao configurado. Conecte o e-mail em producao ou use WhatsApp.",
    }
  }

  try {
    await transport.sendMail({
      from: resolveMailFrom(),
      to: input.to,
      replyTo: clinicReplyTo(input.replyTo),
      subject,
      text,
      html,
      attachments: [
        {
          filename: input.fileName,
          content: input.pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    })
    return { delivered: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[mail] Falha ao enviar prescricao:", message, err)
    return { delivered: false, error: message }
  }
}
