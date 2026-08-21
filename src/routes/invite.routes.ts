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
  previewClinicCode,
  previewInvite,
  approveClinicJoinRequest,
  rejectClinicJoinRequest,
  regenerateClinicCode,
  revokeClinicInvite,
  setClinicInviteCodeRole,
  approveJoinSchema,
  setInviteCodeRoleSchema,
} from "@/controllers/invite.controller.js"
import type { Permission } from "@/lib/permissions.js"

function validate(schema: z.ZodSchema) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(req.body ?? {})
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
  app.get("/clinic-code/:code", { preHandler: [app.auth] }, previewClinicCode)
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
    { preHandler: [app.requirePermission("invites:manage" as Permission)] },
    listClinicInvites
  )
  app.post(
    "/:id/invites",
    {
      preHandler: [
        app.requirePermission("invites:manage" as Permission),
        validate(createInviteSchema),
      ],
    },
    createClinicInvite
  )
  app.delete(
    "/:id/invites/:inviteId",
    { preHandler: [app.requirePermission("invites:manage" as Permission)] },
    revokeClinicInvite
  )
  app.post(
    "/:id/join-requests/:requestId/approve",
    {
      preHandler: [
        app.requirePermission("users:manage" as Permission),
        validate(approveJoinSchema),
      ],
    },
    approveClinicJoinRequest
  )
  app.post(
    "/:id/join-requests/:requestId/reject",
    { preHandler: [app.requirePermission("users:manage" as Permission)] },
    rejectClinicJoinRequest
  )
  app.post(
    "/:id/invites/code-role",
    {
      preHandler: [
        app.requirePermission("invites:manage" as Permission),
        validate(setInviteCodeRoleSchema),
      ],
    },
    setClinicInviteCodeRole
  )
  app.post(
    "/:id/invites/regenerate-code",
    { preHandler: [app.requirePermission("invites:manage" as Permission)] },
    regenerateClinicCode
  )
}
