import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { z } from "zod"
import {
  status,
  login,
  metrics,
  listClinics,
  createClinic,
  updateClinic,
  listUsers,
  getUser,
  createUser,
  updateUser,
  removeUser,
  listPatients,
  me,
} from "@/controllers/backoffice.controller.js"

const loginSchema = z.object({
  email: z.string().email("Email invalido"),
  password: z.string().min(1, "Senha obrigatoria"),
})

const clinicSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  active: z.boolean().optional(),
})

function validate(schema: z.ZodSchema) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      return reply.status(400).send({
        error: "Dados invalidos",
        details: result.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      })
    }
    req.body = result.data
  }
}

export default async function (app: FastifyInstance) {
  app.get("/status", status)
  app.post("/login", { preHandler: [validate(loginSchema)] }, login)

  const ownerOnly = [app.auth, app.requirePlatformOwner]

  app.get("/me", { preHandler: ownerOnly }, me)
  app.get("/metrics", { preHandler: ownerOnly }, metrics)
  app.get("/clinics", { preHandler: ownerOnly }, listClinics)
  app.post("/clinics", { preHandler: [...ownerOnly, validate(clinicSchema)] }, createClinic)
  app.put("/clinics/:id", { preHandler: ownerOnly }, updateClinic)
  app.get("/users", { preHandler: ownerOnly }, listUsers)
  app.get("/users/:id", { preHandler: ownerOnly }, getUser)
  app.post("/users", { preHandler: ownerOnly }, createUser)
  app.put("/users/:id", { preHandler: ownerOnly }, updateUser)
  app.delete("/users/:id", { preHandler: ownerOnly }, removeUser)
  app.get("/patients", { preHandler: ownerOnly }, listPatients)
}
