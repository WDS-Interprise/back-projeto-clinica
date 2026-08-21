import prisma from "../src/lib/prisma.js"

async function main() {
  const patients = await prisma.patient.findMany({
    where: { name: { contains: "Mia" } },
    select: { id: true, name: true, clinicId: true },
  })
  console.log("Patients Mia:", JSON.stringify(patients, null, 2))

  for (const p of patients) {
    const apts = await prisma.appointment.findMany({
      where: { patientId: p.id },
      include: { doctor: { select: { id: true, name: true, userId: true } } },
      orderBy: { date: "asc" },
    })
    console.log(
      `Appointments for ${p.name}:`,
      JSON.stringify(
        apts.map((a) => ({
          id: a.id,
          date: a.date,
          startTime: a.startTime,
          doctorId: a.doctorId,
          doctorName: a.doctor?.name,
          doctorUserId: a.doctor?.userId,
          clinicId: a.clinicId,
        })),
        null,
        2
      )
    )
  }

  const users = await prisma.user.findMany({
    where: { role: { in: ["DOCTOR", "RECEPTION", "ADMIN"] } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      doctorProfile: { select: { id: true, name: true } },
      linkedDoctors: { select: { doctorId: true } },
      clinics: { select: { clinicId: true, active: true, clinicRole: { select: { slug: true, permissionsJson: true } } } },
    },
  })
  const aug20 = await prisma.appointment.findMany({
    where: {
      date: {
        gte: new Date("2026-08-20T00:00:00.000Z"),
        lt: new Date("2026-08-21T00:00:00.000Z"),
      },
    },
    include: {
      patient: { select: { id: true, name: true } },
      doctor: { select: { id: true, name: true, userId: true } },
    },
    orderBy: [{ clinicId: "asc" }, { startTime: "asc" }],
  })
  console.log(
    "Appointments 2026-08-20:",
    JSON.stringify(
      aug20.map((a) => ({
        clinicId: a.clinicId,
        patient: a.patient?.name,
        doctorId: a.doctorId,
        doctor: a.doctor?.name,
        doctorUserId: a.doctor?.userId,
        startTime: a.startTime,
      })),
      null,
      2
    )
  )

  const allPatients = await prisma.patient.findMany({
    take: 30,
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, clinicId: true },
  })
  console.log("Recent patients:", JSON.stringify(allPatients, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
