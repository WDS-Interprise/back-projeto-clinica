import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const dryRun = process.argv.includes("--dry-run")

  const patientCount = await prisma.patient.count()
  const appointmentCount = await prisma.appointment.count()
  const prescriptionCount = await prisma.prescription.count()

  console.log(`Pacientes: ${patientCount}`)
  console.log(`Consultas: ${appointmentCount}`)
  console.log(`Prescrições: ${prescriptionCount}`)

  if (dryRun) {
    console.log("\n(dry-run — nada foi apagado)")
    return
  }

  await prisma.$transaction(async (tx) => {
    await tx.prescriptionShare.deleteMany()
    await tx.prescriptionSignature.deleteMany()
    await tx.prescriptionItem.deleteMany()
    await tx.prescription.deleteMany()

    await tx.medicalRecord.deleteMany()
    await tx.waitingListEntry.deleteMany()
    await tx.agendaNote.deleteMany()

    await tx.whatsappOutbox.updateMany({
      where: { appointmentId: { not: null } },
      data: { appointmentId: null },
    })

    await tx.appointmentReminderLog.deleteMany()
    await tx.appointmentProcedure.deleteMany()
    await tx.appointmentBilling.deleteMany()
    await tx.appointment.deleteMany()

    await tx.whatsappChat.updateMany({
      where: { patientId: { not: null } },
      data: { patientId: null },
    })

    const deletedPatients = await tx.patient.deleteMany()
    console.log(`\nRemovidos ${deletedPatients.count} pacientes e todos os agendamentos vinculados.`)
  })

  console.log("Limpeza concluída.")
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
