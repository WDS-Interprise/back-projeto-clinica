import bcrypt from "bcryptjs"
import prisma from "../src/lib/prisma.js"

const email = process.env.ADMIN_EMAIL || "admin@email.com"
const password = process.env.ADMIN_PASSWORD || ""

async function main() {
  if (!password) {
    console.error("Defina ADMIN_PASSWORD no .env")
    process.exit(1)
  }

  const hashed = await bcrypt.hash(password, 10)
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      name: "Administrador",
      email,
      password: hashed,
      role: "ADMIN",
      active: true,
      isAccountAdmin: true,
    },
    update: {
      password: hashed,
      role: "ADMIN",
      active: true,
      isAccountAdmin: true,
    },
  })

  const clinic = await prisma.clinic.findFirst({ where: { active: true }, select: { id: true } })
  if (clinic) {
    await prisma.userClinic.upsert({
      where: { userId_clinicId: { userId: user.id, clinicId: clinic.id } },
      create: { userId: user.id, clinicId: clinic.id, isClinicAdmin: true, active: true },
      update: { active: true, isClinicAdmin: true },
    })
  }

  console.log(`Backoffice admin OK: ${user.email} (isAccountAdmin=true)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
