import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { z } from "zod"
import { list, getById, getHistory, lookup, create, update, archive } from "@/controllers/patients.controller.js"

const patientSchema = z
  .object({
    name: z.string().min(2),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional().or(z.literal("")),
    cpf: z.string().optional().or(z.literal("")),
    birthDate: z.string().min(1),
    gender: z.enum(["M", "F", "O"]),
    address: z.string().optional().or(z.literal("")),
    bloodType: z.string().optional().or(z.literal("")),
    allergies: z.string().optional().or(z.literal("")),
    medications: z.string().optional().or(z.literal("")),
    clinicalHistory: z.string().optional().or(z.literal("")),
    surgicalHistory: z.string().optional().or(z.literal("")),
    familyHistory: z.string().optional().or(z.literal("")),
    habits: z.string().optional().or(z.literal("")),
    phoneHome: z.string().optional().or(z.literal("")),
    whatsapp: z.string().optional().or(z.literal("")),
    insurancePlan: z.string().optional(),
    insuranceCard: z.string().optional().or(z.literal("")),
    notes: z.string().optional().or(z.literal("")),
    active: z.boolean().optional(),
    force: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const phoneDigits = (data.phone ?? "").replace(/\D/g, "")
    const cpfDigits = (data.cpf ?? "").replace(/\D/g, "")
    if (phoneDigits.length < 10 && cpfDigits.length !== 11) {
      ctx.addIssue({
        code: "custom",
        message: "Informe telefone (10+ dígitos) ou CPF válido",
        path: ["phone"],
      })
    }
    if (cpfDigits.length > 0 && cpfDigits.length !== 11) {
      ctx.addIssue({
        code: "custom",
        message: "CPF inválido",
        path: ["cpf"],
      })
    }
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

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get("/", { preHandler: [app.requirePermission("patients:view")] }, list)
  app.get("/lookup", { preHandler: [app.requirePermission("patients:view")] }, lookup)
  app.get("/:id/history", { preHandler: [app.requirePermission("records:view")] }, getHistory)
  app.get("/:id", { preHandler: [app.requirePermission("patients:view")] }, getById)
  app.post("/", { preHandler: [app.requirePermission("patients:create"), validate(patientSchema)] }, create)
  app.put("/:id", { preHandler: [app.requirePermission("patients:edit_basic")] }, update)
  app.patch("/:id/archive", { preHandler: [app.requirePermission("patients:edit_basic")] }, archive)
}
