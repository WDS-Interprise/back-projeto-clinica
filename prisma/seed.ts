import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { seedCid10 } from "./seed-cid10.js"
import { seedCid11 } from "./seed-cid11.js"
import { seedCidInss } from "./seed-cid-inss.js"

const prisma = new PrismaClient()

async function main() {
  console.log("Seeding database (clínica + usuários + 3 pacientes + agenda)...")

  const adminPassword = await bcrypt.hash("admin123", 10)
  const doctorPassword = await bcrypt.hash("doctor123", 10)
  const recepPassword = await bcrypt.hash("recep123", 10)

  const clinic = await prisma.clinic.upsert({
    where: { id: "clinic-default" },
    update: { name: "ClinMax — Clínica Geral" },
    create: {
      id: "clinic-default",
      name: "ClinMax — Clínica Geral",
      phone: "1135145000",
      email: "contato@clinmax.com.br",
      active: true,
    },
  })

  await prisma.patient.updateMany({
    where: { clinicId: null },
    data: { clinicId: clinic.id },
  })
  await prisma.appointment.updateMany({
    where: { clinicId: null },
    data: { clinicId: clinic.id },
  })

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@clinicare.com" },
    update: { active: true, isAccountAdmin: true },
    create: {
      name: "Admin",
      email: "admin@clinicare.com",
      password: adminPassword,
      role: "ADMIN",
      active: true,
      isAccountAdmin: true,
    },
  })

  const doctorUser = await prisma.user.upsert({
    where: { email: "ana.costa@clinicare.com" },
    update: { active: true },
    create: {
      name: "Dra. Ana Costa",
      email: "ana.costa@clinicare.com",
      password: doctorPassword,
      role: "DOCTOR",
      active: true,
      gender: "F",
      phone: "11988887777",
    },
  })

  const recepUser = await prisma.user.upsert({
    where: { email: "recepcao@clinicare.com" },
    update: { active: true },
    create: {
      name: "Maria Recepção",
      email: "recepcao@clinicare.com",
      password: recepPassword,
      role: "RECEPTION",
      active: true,
      gender: "F",
      phone: "11977775555",
    },
  })

  for (const userId of [adminUser.id, doctorUser.id, recepUser.id]) {
    await prisma.userClinic.upsert({
      where: { userId_clinicId: { userId, clinicId: clinic.id } },
      update: { active: true },
      create: {
        userId,
        clinicId: clinic.id,
        isClinicAdmin: userId === adminUser.id,
        active: true,
      },
    })
  }

  const doctor = await prisma.doctor.upsert({
    where: { email: "ana.costa@clinicare.com" },
    update: { userId: doctorUser.id },
    create: {
      userId: doctorUser.id,
      name: "Dra. Ana Costa",
      email: "ana.costa@clinicare.com",
      phone: "11988887777",
      crm: "123456-SP",
      specialty: "Clínica Geral",
      professionalType: "Médico",
      hasOwnAgenda: true,
      available: true,
    },
  })

  await prisma.receptionistDoctor.upsert({
    where: {
      receptionistId_doctorId: {
        receptionistId: recepUser.id,
        doctorId: doctor.id,
      },
    },
    update: {},
    create: {
      receptionistId: recepUser.id,
      doctorId: doctor.id,
    },
  })

  const retorno = await prisma.procedure.upsert({
    where: { name: "Retorno" },
    update: {},
    create: { name: "Retorno", defaultPrice: 100 },
  })

  const consulta = await prisma.procedure.upsert({
    where: { name: "Consulta" },
    update: {},
    create: { name: "Consulta", defaultPrice: 150 },
  })

  const patientsData = [
    {
      cpf: "11111111111",
      name: "Paciente Teste",
      email: "paciente.teste@email.com",
      phone: "11999998888",
      phoneHome: "1135145333",
      whatsapp: "11999998888",
      birthDate: new Date("1990-01-15"),
      gender: "M" as const,
      insurancePlan: "Particular",
    },
    {
      cpf: "52998224725",
      name: "Ana Beatriz Oliveira",
      email: "ana.oliveira@email.com",
      phone: "11977776666",
      birthDate: new Date("1990-05-15"),
      gender: "F" as const,
      insurancePlan: "Unimed",
      insuranceCard: "123456789",
    },
    {
      cpf: "11122233344",
      name: "Marcos Pereira Lima",
      email: "marcos.lima@email.com",
      phone: "11933332222",
      birthDate: new Date("1978-03-10"),
      gender: "M" as const,
      insurancePlan: "Particular",
    },
  ]

  const patients = []
  for (const p of patientsData) {
    const patient = await prisma.patient.upsert({
      where: { cpf: p.cpf },
      update: {
        name: p.name,
        phone: p.phone,
        phoneHome: p.phoneHome,
        whatsapp: p.whatsapp,
        insurancePlan: p.insurancePlan,
        insuranceCard: p.insuranceCard,
        clinicId: clinic.id,
        active: true,
      },
      create: {
        clinicId: clinic.id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        phoneHome: p.phoneHome,
        whatsapp: p.whatsapp,
        cpf: p.cpf,
        birthDate: p.birthDate,
        gender: p.gender,
        insurancePlan: p.insurancePlan,
        insuranceCard: p.insuranceCard,
        active: true,
      },
    })
    patients.push(patient)
    console.log(`  Patient: ${patient.name}`)
  }

  const today = new Date()
  today.setHours(12, 0, 0, 0)

  const slots = [
    { patient: patients[0], start: "08:00", end: "08:30", status: "SCHEDULED" as const },
    { patient: patients[0], start: "08:30", end: "09:00", status: "CONFIRMED" as const },
    { patient: patients[1], start: "10:00", end: "10:30", status: "IN_PROGRESS" as const },
    { patient: patients[2], start: "11:30", end: "12:00", status: "SCHEDULED" as const },
  ]

  for (const slot of slots) {
    const existing = await prisma.appointment.findFirst({
      where: {
        patientId: slot.patient.id,
        doctorId: doctor.id,
        date: today,
        startTime: slot.start,
      },
    })

    if (existing) continue

    await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        type: "SCHEDULE",
        patientId: slot.patient.id,
        doctorId: doctor.id,
        date: today,
        startTime: slot.start,
        endTime: slot.end,
        status: slot.status,
        insurancePlan: slot.patient.insurancePlan,
        procedures: {
          create: [
            {
              procedureId: retorno.id,
              quantity: 1,
              unitPrice: 100,
            },
          ],
        },
        billing: {
          create: {
            totalAmount: 100,
            chargedAmount: slot.status === "CONFIRMED" ? 100 : 0,
            billingStatus: slot.status === "CONFIRMED" ? "CHARGED" : "PENDING",
          },
        },
      },
    })
  }

  const existingWl = await prisma.waitingListEntry.findFirst({
    where: { patientId: patients[1].id, status: "WAITING" },
  })
  if (!existingWl) {
    await prisma.waitingListEntry.create({
      data: {
        clinicId: clinic.id,
        patientId: patients[1].id,
        doctorId: doctor.id,
        priority: "HIGH",
        status: "WAITING",
        notes: "Prefere horário pela manhã",
        createdById: recepUser.id,
      },
    })
  }

  const noteDay = new Date()
  noteDay.setHours(12, 0, 0, 0)
  const existingNote = await prisma.agendaNote.findFirst({
    where: { clinicId: clinic.id, title: "Confirmação WhatsApp" },
  })
  if (!existingNote) {
    await prisma.agendaNote.create({
      data: {
        clinicId: clinic.id,
        title: "Confirmação WhatsApp",
        description: "Lembrar pacientes da tarde de confirmar presença pelo WhatsApp.",
        date: noteDay,
        type: "RECEPTION",
        visibility: "CLINIC",
        createdById: recepUser.id,
      },
    })
  }

  await prisma.clinicWhatsappSettings.upsert({
    where: { clinicId: clinic.id },
    update: {},
    create: {
      clinicId: clinic.id,
      reminderOffsetsJson: "[24, 2]",
      autoRemindersEnabled: true,
    },
  })

  const templateBodies = [
    {
      name: "Lembrete de consulta",
      category: "APPOINTMENT_REMINDER",
      body: "Olá {{nome}}, lembramos seu agendamento{{procedimento}} em {{data}} às {{hora}} com {{medico}}. — {{clinica}}",
      sortOrder: 0,
    },
    {
      name: "Confirmação de consulta",
      category: "CONFIRMATION",
      body: "Olá {{nome}}! Sua consulta na {{clinica}} está confirmada para {{data}} às {{hora}}. Qualquer dúvida, responda esta mensagem.",
      sortOrder: 1,
    },
    {
      name: "Mensagem livre",
      category: "MANUAL",
      body: "Olá {{nome}}, tudo bem? Entramos em contato pela {{clinica}}.",
      sortOrder: 2,
    },
  ]

  for (const tpl of templateBodies) {
    const existing = await prisma.whatsappMessageTemplate.findFirst({
      where: { clinicId: clinic.id, name: tpl.name },
    })
    if (!existing) {
      await prisma.whatsappMessageTemplate.create({
        data: { clinicId: clinic.id, ...tpl },
      })
    }
  }

  await seedCid10(prisma)
  await seedCid11(prisma)
  await seedCidInss(prisma)

  console.log(`  Clinic: ${clinic.name}`)
  console.log(`  Users: admin, doctor, receptionist`)
  console.log(`  Procedures: ${retorno.name}, ${consulta.name}`)
  console.log(`  Appointments: ${slots.length} slots for today`)
  console.log("\nSeed completed!")
  console.log("  admin@clinicare.com / admin123")
  console.log("  ana.costa@clinicare.com / doctor123")
  console.log("  recepcao@clinicare.com / recep123")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
