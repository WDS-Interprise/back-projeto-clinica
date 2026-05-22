import type { FastifyInstance } from "fastify"
import type { Permission } from "@/lib/permissions.js"
import {
  createConnection,
  createChat,
  createTemplate,
  deleteTemplate,
  disconnect,
  getSettings,
  getStatus,
  listChatMessages,
  listChats,
  listConnections,
  listTemplates,
  logout,
  previewTemplate,
  remove,
  sendMessage,
  startPairing,
  startQr,
  updateSettings,
  updateTemplate,
  updateChatAi,
} from "@/controllers/whatsapp.controller.js"

export default async function whatsappRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  const manage = { preHandler: [app.requirePermission("clinics:manage" as Permission)] }
  const send = { preHandler: [app.requirePermission("whatsapp:send" as Permission)] }

  app.get("/connections", listConnections)
  app.get("/connections/:id/status", getStatus)

  app.post("/connections", manage, createConnection)
  app.post("/connections/:id/qr", manage, startQr)
  app.post("/connections/:id/pairing-code", manage, startPairing)
  app.post("/connections/:id/disconnect", manage, disconnect)
  app.post("/connections/:id/logout", manage, logout)
  app.delete("/connections/:id", manage, remove)

  app.get("/chats", send, listChats)
  app.post("/chats", send, createChat)
  app.get("/chats/:chatId/messages", send, listChatMessages)
  app.patch("/chats/:chatId/ai", send, updateChatAi)
  app.post("/connections/:id/messages", send, sendMessage)

  app.get("/templates", send, listTemplates)
  app.post("/templates", manage, createTemplate)
  app.put("/templates/:id", manage, updateTemplate)
  app.delete("/templates/:id", manage, deleteTemplate)
  app.post("/templates/preview", send, previewTemplate)

  app.get("/settings", manage, getSettings)
  app.put("/settings", manage, updateSettings)
}

