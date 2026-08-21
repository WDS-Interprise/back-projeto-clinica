import {
  MAIL_FROM_NAME,
  MAIL_SENDER,
  MAIL_SMTP_USER,
} from "@/lib/env.js"

/** Monta o campo From: "ClinMax" <email@dominio> */
export function resolveMailFrom(): string {
  const raw = process.env.MAIL_FROM?.trim()
  if (raw) return raw

  const sender = MAIL_SENDER || MAIL_SMTP_USER
  if (sender && MAIL_FROM_NAME) return `${MAIL_FROM_NAME} <${sender}>`
  if (sender) return sender
  return "ClinMax <noreply@clinmax.local>"
}
