import prisma from "../src/lib/prisma.js"

async function main() {
  const patients = await prisma.patient.findMany({
    where: { name: { contains: "Mia" } },
    select: { id: true, name: true, clinicId: true },
  })
  console.log("Patients Mia:", JSON.stringify(patients, null, 2))

  const clinicIds = ["clinic-default", "cmsxsbz8f0000jljognrfm13q"]
  for (const clinicId of clinicIds) {
    const count = await prisma.appointment.count({ where: { clinicId } })
    const sample = await prisma.appointment.findMany({
      where: { clinicId },
      include: {
        patient: { select: { name: true } },
        doctor: { select: { id: true, name: true, userId: true } },
      },
      orderBy: { date: "desc" },
      take: 10,
    })
    console.log(`\nClinic ${clinicId}: ${count} appointments`)
    for (const a of sample) {
      console.log(
        `  ${a.date.toISOString().slice(0, 10)} ${a.startTime} | ${a.patient?.name ?? "-"} | ${a.doctor?.name} (${a.doctorId})`
      )
    }
  }

  const doutorJrId = "cmsyj2noj000ejlzc5ic97j30"
  const wrongDoctorApts = await prisma.appointment.findMany({
    where: {
      clinicId: "cmsxsbz8f0000jljognrfm13q",
      doctorId: { not: doutorJrId },
    },
    include: {
      patient: { select: { name: true } },
      doctor: { select: { name: true } },
    },
  })
  console.log("\nAppointments in vida e saude NOT for doutor jr:", wrongDoctorApts.length)
  for (const a of wrongDoctorApts) {
    console.log(
      `  ${a.date.toISOString().slice(0, 10)} ${a.startTime} | ${a.patient?.name} | doctor: ${a.doctor?.name}`
    )
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
