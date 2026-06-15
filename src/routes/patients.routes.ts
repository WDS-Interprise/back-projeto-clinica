import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { z } from "zod"
import { list, getById, getHistory, create, update, remove } from "@/controllers/patients.controller.js"

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

  app.get("/", list)
  app.get("/:id/history", getHistory)
  app.get("/:id", getById)
  app.post("/", { preHandler: [validate(patientSchema)] }, create)
  app.put("/:id", update)
  app.delete("/:id", remove)
}
