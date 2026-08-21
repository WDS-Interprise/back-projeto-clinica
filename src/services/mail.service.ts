import nodemailer from "nodemailer"

import { resolveMailFrom } from "@/lib/mail-from.js"
import {
  buildClinicInviteEmailHtml,
  buildClinicInviteEmailText,
} from "@/lib/invite-email-template.js"
import { getInviteEmailAttachments } from "@/lib/invite-email-assets.js"
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

function inviteEmailLayout(bodyHtml: string) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.55;color:#12261E;max-width:560px;margin:0 auto">
      <div style="padding:20px 0 16px;border-bottom:1px solid #E4EBE6">
        <span style="font-size:20px;font-weight:700;color:#006B4D">ClinMax</span>
      </div>
      <div style="padding:20px 0">${bodyHtml}</div>
      <p style="margin:24px 0 0;font-size:12px;color:#8A9A90;border-top:1px solid #E4EBE6;padding-top:16px">
        Este e-mail foi enviado pela plataforma ClinMax. Se você não esperava esta mensagem, ignore.
      </p>
    </div>
  `
}

function primaryButton(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:#006B4D;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px">${label}</a>`
}

export async function sendMail(input: {
  to: string
  subject: string
  text: string
  html: string
  attachments?: Array<{
    filename: string
    path: string
    cid: string
    contentType: string
  }>
}): Promise<MailSendResult> {
  const transport = createTransport()
  if (!transport) {
    console.log("[mail:dev] SMTP não configurado. E-mail não enviado.")
    console.log(`[mail:dev] Para: ${input.to}`)
    console.log(`[mail:dev] Assunto: ${input.subject}`)
    return {
      delivered: false,
      preview: { subject: input.subject, text: input.text },
    }
  }

  try {
    await transport.sendMail({
      from: resolveMailFrom(),
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments?.map((item) => ({
        filename: item.filename,
        path: item.path,
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
  const { attachments, images } = getInviteEmailAttachments()
  const text = buildClinicInviteEmailText(content)
  const html = buildClinicInviteEmailHtml(content, images)

  return sendMail({ to: input.to, subject, text, html, attachments })
}

export async function sendJoinRequestApprovedEmail(input: {
  to: string
  userName: string
  clinicName: string
  roleLabel: string
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

  const html = inviteEmailLayout(`
    <h2 style="margin:0 0 12px;font-size:20px;color:#12261E">Acesso aprovado</h2>
    <p style="margin:0 0 12px;color:#5B6B63">Olá, <strong>${input.userName}</strong>. Sua solicitação de entrada na clínica <strong>${input.clinicName}</strong> foi aprovada.</p>
    <p style="margin:0 0 20px;color:#5B6B63">Cargo: <strong>${input.roleLabel}</strong></p>
    <p style="margin:0">${primaryButton(loginUrl, "Entrar no ClinMax")}</p>
  `)

  return sendMail({ to: input.to, subject, text, html })
}

export async function sendJoinRequestRejectedEmail(input: {
  to: string
  userName: string
  clinicName: string
}) {
  const subject = `Solicitação não aprovada: ${input.clinicName}`
  const text = [
    `Olá, ${input.userName},`,
    "",
    `Sua solicitação de entrada na clínica ${input.clinicName} não foi aprovada neste momento.`,
    "",
    "Entre em contato com a administração da clínica se precisar de mais informações.",
  ].join("\n")

  const html = inviteEmailLayout(`
    <h2 style="margin:0 0 12px;font-size:20px;color:#12261E">Solicitação não aprovada</h2>
    <p style="margin:0 0 12px;color:#5B6B63">Olá, <strong>${input.userName}</strong>. Sua solicitação de entrada na clínica <strong>${input.clinicName}</strong> não foi aprovada neste momento.</p>
    <p style="margin:0;color:#8A9A90;font-size:13px">Entre em contato com a administração da clínica se precisar de mais informações.</p>
  `)

  return sendMail({ to: input.to, subject, text, html })
}
