import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { z } from "zod"
import { list, getById, create, update, remove } from "@/controllers/patients.controller.js"

const patientSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string(),
  cpf: z.string().min(11).max(14),
  birthDate: z.string(),
  gender: z.enum(["M", "F", "O"]),
  address: z.string().optional().or(z.literal("")),
  bloodType: z.string().optional().or(z.literal("")),
  allergies: z.string().optional().or(z.literal("")),
  medications: z.string().optional().or(z.literal("")),
  phoneHome: z.string().optional().or(z.literal("")),
  whatsapp: z.string().optional().or(z.literal("")),
  insurancePlan: z.string().optional(),
  insuranceCard: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  active: z.boolean().optional(),
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
  app.get("/:id", getById)
  app.post("/", { preHandler: [validate(patientSchema)] }, create)
  app.put("/:id", update)
  app.delete("/:id", remove)
}
