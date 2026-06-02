import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { z } from "zod"

import {
  acceptInvite,
  acceptInviteSchema,
  createClinicInvite,
  createInviteSchema,
  joinByCode,
  joinByCodeSchema,
  listClinicInvites,
  previewInvite,
  regenerateClinicCode,
  revokeClinicInvite,
} from "@/controllers/invite.controller.js"
import type { Permission } from "@/lib/permissions.js"

function validate(schema: z.ZodSchema) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      return reply.status(400).send({
        error: "Dados inválidos",
        details: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      })
    }
    req.body = result.data
  }
}

export default async function inviteRoutes(app: FastifyInstance) {
  app.get("/preview/:token", previewInvite)
  app.post(
    "/accept/:token",
    { preHandler: [validate(acceptInviteSchema)] },
    acceptInvite
  )
  app.post(
    "/accept/:token/authenticated",
    { preHandler: [app.auth, validate(acceptInviteSchema)] },
    acceptInvite
  )

  app.post(
    "/join-by-code",
    { preHandler: [app.auth, validate(joinByCodeSchema)] },
    joinByCode
  )
}

export async function clinicInviteRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.auth)

  app.get(
    "/:id/invites",
    { preHandler: [app.requirePermission("clinics:manage" as Permission)] },
    listClinicInvites
  )
  app.post(
    "/:id/invites",
    {
      preHandler: [
        app.requirePermission("clinics:manage" as Permission),
        validate(createInviteSchema),
      ],
    },
    createClinicInvite
  )
  app.delete(
    "/:id/invites/:inviteId",
    { preHandler: [app.requirePermission("clinics:manage" as Permission)] },
    revokeClinicInvite
  )
  app.post(
    "/:id/invites/regenerate-code",
    { preHandler: [app.requirePermission("clinics:manage" as Permission)] },
    regenerateClinicCode
  )
}
