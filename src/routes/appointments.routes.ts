import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { z } from "zod"
import {
  list,
  nextSlot,
  getById,
  create,
  update,
  remove,
  charge,
  receipt,
  reminder,
} from "@/controllers/appointments.controller.js"

const procedureLineSchema = z.object({
  procedureId: z.string(),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().min(0),
})

const appointmentSchema = z.object({
  type: z.enum(["SCHEDULE", "BLOCK"]).optional(),
  patientId: z.string().optional().nullable(),
  doctorId: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  status: z
    .enum(["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"])
    .optional(),
  insurancePlan: z.string().optional(),
  recurrence: z
    .enum(["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "YEARLY"])
    .optional(),
  notes: z.string().optional().or(z.literal("")),
  generatePaymentLink: z.boolean().optional(),
  cidCode: z.string().nullable().optional(),
  cidDescription: z.string().nullable().optional(),
  cidVersion: z.string().nullable().optional(),
  mainComplaint: z.string().nullable().optional(),
  physicalExam: z.string().nullable().optional(),
  currentIllnessHistory: z.string().nullable().optional(),
  historyAndAntecedents: z.string().nullable().optional(),
  conduct: z.string().nullable().optional(),
  prescriptionSummary: z.string().nullable().optional(),
  procedures: z.array(procedureLineSchema).optional(),
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
  app.addHook("preHandler", app.auth)

  app.get("/", list)
  app.get("/next-slot", nextSlot)
  app.get("/:id", getById)
  app.post("/", { preHandler: [validate(appointmentSchema)] }, create)
  app.put("/:id", update)
  app.delete("/:id", remove)
  app.post("/:id/charge", charge)
  app.post("/:id/receipt", receipt)
  app.post("/:id/reminder", reminder)
}
