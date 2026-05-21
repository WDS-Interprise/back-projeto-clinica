import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma.js"
import {
  validateUserCreate,
  validateUserUpdate,
} from "@/lib/duplicate-validation.js"
import { validatePassword } from "@/lib/password.js"
import type { Role, Gender } from "@prisma/client"

export async function list(clinicId: string, role?: string) {
  const where: any = {
    clinics: { some: { clinicId, active: true } },
  }
  if (role) where.role = role

  const users = await prisma.user.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      gender: true,
      phone: true,
      isAccountAdmin: true,
      createdAt: true,
      doctorProfile: {
        select: {
          id: true,
          specialty: true,
          crm: true,
          available: true,
          hasOwnAgenda: true,
        },
      },
      clinics: {
        where: { clinicId },
        select: { isClinicAdmin: true, active: true },
      },
      linkedDoctors: {
        select: { doctorId: true, doctor: { select: { id: true, name: true } } },
      },
    },
  })

  return users.map((u) => ({
    ...u,
    isClinicAdmin: u.clinics[0]?.isClinicAdmin ?? false,
    linkedDoctors: u.linkedDoctors.map((l) => l.doctor),
    clinics: undefined,
  }))
}

export async function getById(id: string, clinicId: string) {
  const user = await prisma.user.findFirst({
    where: { id, clinics: { some: { clinicId } } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      gender: true,
      phone: true,
      profileImage: true,
      isAccountAdmin: true,
      doctorProfile: true,
      clinics: { where: { clinicId } },
      linkedDoctors: {
        include: { doctor: { select: { id: true, name: true, specialty: true } } },
      },
    },
  })
  return user
}

type CreateReceptionInput = {
  role: "RECEPTION"
  name: string
  email: string
  password: string
  gender?: Gender
  phone?: string
  isAccountAdmin?: boolean
  isClinicAdmin?: boolean
  clinicId: string
  linkedDoctorIds?: string[]
}

type CreateDoctorInput = {
  role: "DOCTOR"
  name: string
  email: string
  password: string
  gender?: Gender
  phone: string
  cpf?: string
  crm: string
  specialty: string
  professionalType?: string
  hasOwnAgenda?: boolean
  isClinicAdmin?: boolean
  clinicId: string
}

export async function createUser(data: CreateReceptionInput | CreateDoctorInput) {
  const pwdError = validatePassword(data.password)
  if (pwdError) throw Object.assign(new Error(pwdError), { code: "INVALID_PASSWORD" })

  const normalized = await validateUserCreate({
    name: data.name,
    email: data.email,
    cpf: data.role === "DOCTOR" ? data.cpf : undefined,
  })

  const hashed = await bcrypt.hash(data.password, 10)

  if (data.role === "RECEPTION") {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: normalized.name,
          email: normalized.email,
          password: hashed,
          role: "RECEPTION",
          gender: data.gender,
          phone: data.phone,
          isAccountAdmin: data.isAccountAdmin ?? false,
          active: true,
        },
      })

      await tx.userClinic.create({
        data: {
          userId: user.id,
          clinicId: data.clinicId,
          isClinicAdmin: data.isClinicAdmin ?? false,
          active: true,
        },
      })

      if (data.linkedDoctorIds?.length) {
        await tx.receptionistDoctor.createMany({
          data: data.linkedDoctorIds.map((doctorId) => ({
            receptionistId: user.id,
            doctorId,
          })),
        })
      }

      return getById(user.id, data.clinicId)
    })
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: normalized.name,
        email: normalized.email,
        cpf: normalized.cpf,
        password: hashed,
        role: "DOCTOR",
        gender: data.gender,
        phone: data.phone,
        active: true,
      },
    })

    const doctor = await tx.doctor.create({
      data: {
        userId: user.id,
        name: normalized.name,
        email: normalized.email,
        phone: data.phone,
        cpf: normalized.cpf,
        crm: data.crm,
        specialty: data.specialty,
        professionalType: data.professionalType ?? "Médico",
        hasOwnAgenda: data.hasOwnAgenda ?? true,
        available: true,
      },
    })

    await tx.userClinic.create({
      data: {
        userId: user.id,
        clinicId: data.clinicId,
        isClinicAdmin: data.isClinicAdmin ?? false,
        active: true,
      },
    })

    return { ...(await getById(user.id, data.clinicId)), doctorId: doctor.id }
  })
}

export async function updateUser(
  id: string,
  clinicId: string,
  data: Partial<{
    name: string
    email: string
    password: string
    active: boolean
    gender: Gender
    phone: string
    isAccountAdmin: boolean
    isClinicAdmin: boolean
    specialty: string
    crm: string
    hasOwnAgenda: boolean
    available: boolean
  }>
) {
  const user = await prisma.user.findFirst({
    where: { id, clinics: { some: { clinicId } } },
    include: { doctorProfile: true },
  })
  if (!user) return null

  await validateUserUpdate(id, {
    name: data.name,
    email: data.email,
  })

  if (data.password) {
    const pwdError = validatePassword(data.password)
    if (pwdError) throw Object.assign(new Error(pwdError), { code: "INVALID_PASSWORD" })
  }

  const userUpdate: any = {}
  if (data.name) userUpdate.name = data.name
  if (data.email) userUpdate.email = data.email
  if (data.active !== undefined) userUpdate.active = data.active
  if (data.gender) userUpdate.gender = data.gender
  if (data.phone !== undefined) userUpdate.phone = data.phone
  // isAccountAdmin só pode ser alterado via backoffice (dono da plataforma)
  if (data.password) userUpdate.password = await bcrypt.hash(data.password, 10)

  await prisma.$transaction(async (tx) => {
    if (Object.keys(userUpdate).length) {
      await tx.user.update({ where: { id }, data: userUpdate })
    }

    if (data.isClinicAdmin !== undefined) {
      await tx.userClinic.updateMany({
        where: { userId: id, clinicId },
        data: { isClinicAdmin: data.isClinicAdmin },
      })
    }

    if (user.doctorProfile && (data.specialty || data.crm || data.hasOwnAgenda !== undefined || data.available !== undefined)) {
      await tx.doctor.update({
        where: { id: user.doctorProfile.id },
        data: {
          name: data.name ?? user.name,
          email: data.email ?? user.email,
          specialty: data.specialty,
          crm: data.crm,
          hasOwnAgenda: data.hasOwnAgenda,
          available: data.available,
        },
      })
    }
  })

  return getById(id, clinicId)
}

export async function setLinkedDoctors(
  receptionistId: string,
  clinicId: string,
  doctorIds: string[]
) {
  const user = await prisma.user.findFirst({
    where: { id: receptionistId, role: "RECEPTION", clinics: { some: { clinicId } } },
  })
  if (!user) throw new Error("NOT_FOUND")

  await prisma.$transaction(async (tx) => {
    await tx.receptionistDoctor.deleteMany({ where: { receptionistId } })
    if (doctorIds.length) {
      await tx.receptionistDoctor.createMany({
        data: doctorIds.map((doctorId) => ({ receptionistId, doctorId })),
      })
    }
  })

  return getById(receptionistId, clinicId)
}

export async function setUserClinics(
  userId: string,
  links: { clinicId: string; active: boolean; isClinicAdmin?: boolean }[]
) {
  for (const link of links) {
    await prisma.userClinic.upsert({
      where: { userId_clinicId: { userId, clinicId: link.clinicId } },
      update: {
        active: link.active,
        isClinicAdmin: link.isClinicAdmin ?? false,
      },
      create: {
        userId,
        clinicId: link.clinicId,
        active: link.active,
        isClinicAdmin: link.isClinicAdmin ?? false,
      },
    })
  }
  return links
}
