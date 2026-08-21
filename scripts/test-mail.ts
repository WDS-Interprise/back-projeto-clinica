import { isMailConfigured } from "../src/lib/env.js"
import { sendMail } from "../src/services/mail.service.js"

async function main() {
  if (!isMailConfigured()) {
    console.error("SMTP não configurado. Verifique MAIL_HOST, MAIL_USER e MAIL_PASS no .env")
    process.exit(1)
  }

  const to = process.argv[2] || process.env.MAIL_USER
  if (!to) {
    console.error("Uso: npm run mail:test -- destino@email.com")
    process.exit(1)
  }

  const result = await sendMail({
    to,
    subject: "Teste ClinMax SMTP",
    text: "Se você recebeu este e-mail, o SMTP do ClinMax está funcionando.",
    html: "<p>Se você recebeu este e-mail, o <strong>SMTP do ClinMax</strong> está funcionando.</p>",
  })

  if (result.delivered) {
    console.log(`E-mail de teste enviado para ${to}`)
  } else {
    console.error("Falha:", "error" in result ? result.error : "SMTP não entregou")
    process.exit(1)
  }
}

main()
