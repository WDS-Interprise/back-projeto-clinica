import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { z } from "zod"
import type { Permission } from "@/lib/permissions.js"
import * as ctrl from "@/controllers/prescriptions.controller.js"

const createSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().optional(),
  receiptType: z.enum(["SIMPLE", "SPECIAL"]).optional(),
  prescriptionDate: z.string().optional(),
  showDate: z.boolean().optional(),
  notes: z.string().optional(),
})

const updateSchema = z.object({
  receiptType: z.enum(["SIMPLE", "SPECIAL"]).optional(),
  prescriptionDate: z.string().optional(),
  showDate: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  appointmentId: z.string().nullable().optional(),
})

const itemSchema = z.object({
  type: z.enum(["MEDICATION", "EXAM", "VACCINE", "FREE_TEXT"]),
  name: z.string().min(1),
  presentation: z.string().optional(),
  dosage: z.string().optional(),
  frequency: z.string().optional(),
  duration: z.string().optional(),
  quantity: z.string().optional(),
  instructions: z.string().optional(),
  continuousUse: z.boolean().optional(),
  extraJson: z.string().optional(),
  sortOrder: z.number().int().optional(),
})

const finalizeSchema = z.object({
  shareWhatsApp: z.boolean().optional(),
  sharePhone: z.string().optional(),
  signDigital: z.boolean().optional(),
})

const resendWhatsappSchema = z.object({
  phone: z.string().optional(),
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

const writePerm: Permission = "prescriptions:write"

export default async function prescriptionsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get("/context/:routeId", ctrl.resolveContext)
  app.get("/templates", ctrl.listTemplates)
  app.get("/", ctrl.list)
  app.get("/:id/pdf", ctrl.getPdf)
  app.get("/:id", ctrl.getById)

  app.post("/", { preHandler: [app.requirePermission(writePerm), validate(createSchema)] }, ctrl.create)
  app.patch("/:id", { preHandler: [app.requirePermission(writePerm), validate(updateSchema)] }, ctrl.update)
  app.post("/:id/items", { preHandler: [app.requirePermission(writePerm), validate(itemSchema)] }, ctrl.addItem)
  app.delete("/:id/items/:itemId", { preHandler: [app.requirePermission(writePerm)] }, ctrl.removeItem)
  app.post("/:id/finalize", { preHandler: [app.requirePermission(writePerm), validate(finalizeSchema)] }, ctrl.finalize)
  app.post("/:id/resend-whatsapp", { preHandler: [app.requirePermission(writePerm), validate(resendWhatsappSchema)] }, ctrl.resendWhatsapp)
  app.post("/:id/renew", { preHandler: [app.requirePermission(writePerm)] }, ctrl.renew)
}

export async function publicPrescriptionRoutes(app: FastifyInstance) {
  app.get("/prescriptions/validate/:code", ctrl.validatePublic)
}
