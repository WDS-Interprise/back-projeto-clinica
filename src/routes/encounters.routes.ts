import type { FastifyInstance } from "fastify"
import {
  getById,
  resolve,
  startFromAppointment,
  update,
  complete,
  addAddendum,
  recentByPatient,
  aiDraft,
} from "@/controllers/encounters.controller.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get(
    "/patient/:patientId/recent",
    { preHandler: app.requirePermission("records:view") },
    recentByPatient
  )
  app.get("/resolve/:id", { preHandler: app.requirePermission("records:view") }, resolve)
  app.get("/:id", { preHandler: app.requirePermission("records:view") }, getById)
  app.post(
    "/from-appointment/:appointmentId/start",
    { preHandler: app.requirePermission("records:write") },
    startFromAppointment
  )
  app.put("/:id", { preHandler: app.requirePermission("records:write") }, update)
  app.post("/:id/complete", { preHandler: app.requirePermission("records:write") }, complete)
  app.post("/:id/addendums", { preHandler: app.requirePermission("records:write") }, addAddendum)
  app.post("/:id/ai-draft", { preHandler: app.requirePermission("records:write") }, aiDraft)
}
