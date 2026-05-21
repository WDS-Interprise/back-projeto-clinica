import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { z } from "zod"
import { list, getById, create, update, remove } from "@/controllers/doctors.controller.js"

const doctorSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string(),
  crm: z.string(),
  specialty: z.string(),
  available: z.boolean().optional(),
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
  app.post("/", { preHandler: [validate(doctorSchema)] }, create)
  app.put("/:id", update)
  app.delete("/:id", remove)
}
