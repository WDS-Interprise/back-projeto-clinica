import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { z } from "zod"
import { list, getById, create, update, remove } from "@/controllers/records.controller.js"

const recordSchema = z.object({
  patientId: z.string(),
  diagnosis: z.string().min(2),
  prescription: z.string().min(2),
  notes: z.string().optional().or(z.literal("")),
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
  app.post("/", {
    preHandler: [app.requirePermission("records:write"), validate(recordSchema)],
  }, create)
  app.put("/:id", {
    preHandler: [app.requirePermission("records:write")],
  }, update)
  app.delete("/:id", {
    preHandler: [app.requirePermission("records:write")],
  }, remove)
}
