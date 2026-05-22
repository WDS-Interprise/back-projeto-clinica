import prisma from "@/lib/prisma.js"
import type { AuthContext } from "@/types/index.js"

export async function listLogs(
  ctx: AuthContext,
  params: {
    search?: string
    module?: string
    page?: number
    limit?: number
  }
) {
  const page = params.page ?? 1
  const limit = Math.min(params.limit ?? 30, 100)
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = { clinicId: ctx.clinicId }
  if (params.module) where.module = params.module
  if (params.search) {
    where.OR = [
      { description: { contains: params.search } },
      { action: { contains: params.search } },
    ]
  }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ])

  return { data, total, page, totalPages: Math.ceil(total / limit) }
}
