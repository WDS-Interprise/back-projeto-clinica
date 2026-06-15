import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import multipart from "@fastify/multipart"
import { z } from "zod"
import {
  login,
  register,
  me,
  meAvatar,
  uploadMeAvatar,
  completeOnboarding,
  updateMe,
  googleAuthStart,
  googleAuthCallback,
} from "@/controllers/auth.controller.js"

const loginSchema = z.object({
  email: z.string().email("Email invalido"),
  password: z.string().min(1, "Senha obrigatoria"),
})

const registerSchema = z.object({
  name: z.string().min(2, "Nome deve ter no minimo 2 caracteres"),
  email: z.string().email("Email invalido"),
  cpf: z
    .string()
    .min(1, "CPF obrigatorio")
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 11, "CPF invalido"),
  password: z.string().min(6, "Senha deve ter no minimo 6 caracteres"),
  role: z.enum(["ADMIN", "DOCTOR", "RECEPTION"]).optional(),
})

function validate(schema: z.ZodSchema) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      return reply.status(400).send({
        error: "Dados invalidos",
        details: result.error.issues.map((i: any) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      })
    }
    req.body = result.data
  }
}

const onboardingSchema = z.object({
  roleLabel: z.string().min(1),
  teamSize: z.string().min(1),
  clinicName: z.string().optional(),
  inviteCode: z.string().optional(),
  crm: z.string().optional(),
  specialty: z.string().optional(),
  phone: z.string().optional(),
})

const updateMeSchema = z.object({
  name: z.string().min(2, "Nome deve ter no minimo 2 caracteres").optional(),
  email: z.string().email("Email invalido").optional(),
  phone: z.string().optional(),
  gender: z.enum(["M", "F", "O"]).optional(),
  password: z.string().optional(),
  currentPassword: z.string().optional(),
})

export default async function (app: FastifyInstance) {
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  })

  app.post("/login", { preHandler: [validate(loginSchema)] }, login)
  app.get("/google", googleAuthStart)
  app.get("/google/callback", googleAuthCallback)
  app.post("/register", { preHandler: [validate(registerSchema)] }, register)
  app.post(
    "/complete-onboarding",
    { preHandler: [app.auth, validate(onboardingSchema)] },
    completeOnboarding
  )
  app.get("/me", { preHandler: [app.auth] }, me)
  app.get("/me/avatar", { preHandler: [app.auth] }, meAvatar)
  app.post("/me/avatar", { preHandler: [app.auth] }, uploadMeAvatar)
  app.patch("/me", { preHandler: [app.auth, validate(updateMeSchema)] }, updateMe)
}
