import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { z } from "zod"
import { login, register, me, completeOnboarding } from "@/controllers/auth.controller.js"

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
})

export default async function (app: FastifyInstance) {
  app.post("/login", { preHandler: [validate(loginSchema)] }, login)
  app.post("/register", { preHandler: [validate(registerSchema)] }, register)
  app.post(
    "/complete-onboarding",
    { preHandler: [app.auth, validate(onboardingSchema)] },
    completeOnboarding
  )
  app.get("/me", { preHandler: [app.auth] }, me)
}
