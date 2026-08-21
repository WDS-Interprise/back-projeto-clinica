import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

import { getInviteEmailInlineImages } from "../src/lib/invite-email-assets.js"
import {
  buildClinicInviteEmailHtml,
  buildClinicInviteEmailText,
} from "../src/lib/invite-email-template.js"
import { sendClinicInviteEmail } from "../src/services/mail.service.js"
import { isMailConfigured } from "../src/lib/env.js"

const sample = {
  clinicName: process.env.CLINIC_NAME?.trim() || "Centro Médico Exemplo",
  roleLabel: "Financeiro",
  inviteUrl: "http://localhost:5173/convite/exemplo-token",
  inviteCode: "YJUUBPRW",
  invitedByName: "Marcos Junio Silva de Carvalho",
  inviteeEmail: "marcos@exemplo.com",
  expiresInDays: 7,
}

async function main() {
  const mode = process.argv[2] ?? "preview"
  const outPath = resolve(process.cwd(), "tmp/invite-email-preview.html")
  const images = getInviteEmailInlineImages()

  if (mode === "preview") {
    mkdirSync(resolve(process.cwd(), "tmp"), { recursive: true })
    writeFileSync(outPath, buildClinicInviteEmailHtml(sample, images), "utf8")
    console.log(`Preview salvo em ${outPath}`)
    console.log(buildClinicInviteEmailText(sample))
    return
  }

  if (mode === "send") {
    if (!isMailConfigured()) {
      console.error("SMTP não configurado.")
      process.exit(1)
    }
    const to = process.argv[3]
    if (!to) {
      console.error("Uso: npm run mail:invite -- send destino@email.com")
      process.exit(1)
    }
    const result = await sendClinicInviteEmail({
      to,
      clinicName: sample.clinicName,
      roleLabel: sample.roleLabel,
      inviteUrl: sample.inviteUrl,
      inviteCode: sample.inviteCode,
      invitedByName: sample.invitedByName,
    })
    if (result.delivered) {
      console.log(`Convite de teste enviado para ${to}`)
    } else {
      console.error("Falha:", "error" in result ? result.error : "não entregue")
      process.exit(1)
    }
    return
  }

  console.error("Uso: npm run mail:invite -- [preview|send destino@email.com]")
  process.exit(1)
}

main()
