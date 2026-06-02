import nodemailer from "nodemailer"

import {
  FRONTEND_URL,
  MAIL_FROM,
  MAIL_SMTP_HOST,
  MAIL_SMTP_PASS,
  MAIL_SMTP_PORT,
  MAIL_SMTP_USER,
  isMailConfigured,
} from "@/lib/env.js"

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

export async function sendClinicInviteEmail(input: {
  to: string
  clinicName: string
  roleLabel: string
  inviteUrl: string
  inviteCode: string
  invitedByName: string
}) {
  const subject = `Convite para participar da clínica ${input.clinicName}`
  const text = [
    `Olá,`,
    ``,
    `${input.invitedByName} convidou você para participar da clínica ${input.clinicName} como ${input.roleLabel}.`,
    ``,
    `Aceite pelo link:`,
    input.inviteUrl,
    ``,
    `Ou use o código da clínica ao criar sua conta: ${input.inviteCode}`,
    ``,
    `Este convite expira em 7 dias.`,
  ].join("\n")

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;max-width:560px">
      <h2 style="margin:0 0 12px">Convite para ${input.clinicName}</h2>
      <p>${input.invitedByName} convidou você para participar da clínica <strong>${input.clinicName}</strong> como <strong>${input.roleLabel}</strong>.</p>
      <p><a href="${input.inviteUrl}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Aceitar convite</a></p>
      <p>Ou use o código da clínica ao criar sua conta:</p>
      <p style="font-size:24px;font-weight:700;letter-spacing:0.2em">${input.inviteCode}</p>
      <p style="color:#64748b;font-size:13px">Este convite expira em 7 dias.</p>
    </div>
  `

  const transport = createTransport()
  if (!transport) {
    console.log("[mail:dev] Convite não enviado — SMTP não configurado")
    console.log(`[mail:dev] Para: ${input.to}`)
    console.log(`[mail:dev] Link: ${input.inviteUrl}`)
    console.log(`[mail:dev] Código: ${input.inviteCode}`)
    return { delivered: false, preview: { subject, text, inviteUrl: input.inviteUrl } }
  }

  await transport.sendMail({
    from: MAIL_FROM,
    to: input.to,
    subject,
    text,
    html,
  })

  return { delivered: true }
}
