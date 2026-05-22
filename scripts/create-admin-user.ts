import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const email = process.argv[2] ?? "admin2@clinmax.com.br"
const password = process.argv[3] ?? "admin123"
const name = process.argv[4] ?? "Admin 2"

async function main() {
  const clinic = await prisma.clinic.findFirst({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  })
  if (!clinic) throw new Error("Nenhuma clínica encontrada")

  const hash = await bcrypt.hash(password, 10)
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      password: hash,
      role: "ADMIN",
      active: true,
      isAccountAdmin: true,
    },
    create: {
      name,
      email,
      password: hash,
      role: "ADMIN",
      active: true,
      isAccountAdmin: true,
    },
  })

  await prisma.userClinic.upsert({
    where: { userId_clinicId: { userId: user.id, clinicId: clinic.id } },
    update: { active: true, isClinicAdmin: true },
    create: { userId: user.id, clinicId: clinic.id, active: true, isClinicAdmin: true },
  })

  console.log(
    JSON.stringify(
      { ok: true, email, password, name, clinic: clinic.name, userId: user.id },
      null,
      2
    )
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
