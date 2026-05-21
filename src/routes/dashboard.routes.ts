import type { FastifyInstance } from "fastify"
import {
  stats,
  panelMetrics,
  todayPatients,
  upcomingAppointments,
  recentPatients,
} from "@/controllers/dashboard.controller.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get("/stats", stats)
  app.get("/panel-metrics", panelMetrics)
  app.get("/today-patients", todayPatients)
  app.get("/upcoming", upcomingAppointments)
  app.get("/recent-patients", recentPatients)
}
