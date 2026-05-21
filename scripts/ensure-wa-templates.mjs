import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const clinicId = "clinic-default"
const tpls = [
  {
    name: "Lembrete de consulta",
    category: "APPOINTMENT_REMINDER",
    body: "Olá {{nome}}, lembramos seu agendamento{{procedimento}} em {{data}} às {{hora}} com {{medico}}. — {{clinica}}",
    sortOrder: 0,
  },
  {
    name: "Confirmação de consulta",
    category: "CONFIRMATION",
    body: "Olá {{nome}}! Sua consulta na {{clinica}} está confirmada para {{data}} às {{hora}}.",
    sortOrder: 1,
  },
  {
    name: "Mensagem livre",
    category: "MANUAL",
    body: "Olá {{nome}}, tudo bem? Entramos em contato pela {{clinica}}.",
    sortOrder: 2,
  },
]

for (const tpl of tpls) {
  const existing = await prisma.whatsappMessageTemplate.findFirst({
    where: { clinicId, name: tpl.name },
  })
  if (!existing) {
    await prisma.whatsappMessageTemplate.create({ data: { clinicId, ...tpl } })
    console.log("created", tpl.name)
  }
}

const count = await prisma.whatsappMessageTemplate.count({
  where: { clinicId, category: "APPOINTMENT_REMINDER", active: true },
})
console.log("reminder_templates", count)
await prisma.$disconnect()
