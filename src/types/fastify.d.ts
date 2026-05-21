import type { JwtPayload } from "./index.js"

declare module "fastify" {
  interface FastifyRequest {
    user?: JwtPayload
  }

  interface FastifyInstance {
    auth: (req: any, reply: any) => Promise<void>
    requireRole: (...roles: string[]) => (req: any, reply: any) => Promise<void>
    requirePermission: (
      ...perms: import("../lib/permissions.js").Permission[]
    ) => (req: any, reply: any) => Promise<void>
    requirePlatformOwner: (req: any, reply: any) => Promise<void>
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}

export {}
