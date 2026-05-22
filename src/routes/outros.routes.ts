import type { FastifyInstance } from "fastify"
import {
  searchBulas,
  getBula,
  listCid10Chapters,
  searchCid10,
  getCid10Code,
  listContacts,
  listLogs,
} from "@/controllers/outros.controller.js"

export default async function (app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get("/bulas/search", searchBulas)
  app.get("/bulas/:id", getBula)
  app.get("/cid10/chapters", listCid10Chapters)
  app.get("/cid10/search", searchCid10)
  app.get("/cid10/code/:code", getCid10Code)
  app.get("/contacts", listContacts)
  app.get("/logs", listLogs)
}
