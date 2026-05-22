import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const patients = await prisma.patient.findMany({
    select: { id: true, name: true, _count: { select: { appointments: true, prescriptions: true } } },
    orderBy: { name: "asc" },
  })

  console.log("=== Pacientes atuais ===")
  for (const p of patients) {
    console.log(`- ${p.name} (${p._count.appointments} consultas, ${p._count.prescriptions} prescrições)`)
  }
  console.log(`Total: ${patients.length} pacientes`)
  console.log(`Total consultas: ${await prisma.appointment.count()}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
