import type { FastifyRequest, FastifyReply } from "fastify"
import * as inventoryService from "@/services/inventory.service.js"
import { ctxFromRequest } from "@/lib/auth-context.js"
import type { InventoryMovementType } from "@prisma/client"

function mapError(error: unknown, reply: FastifyReply) {
  const msg = error instanceof Error ? error.message : "UNKNOWN"
  if (msg === "NOT_FOUND") return reply.status(404).send({ error: "Produto não encontrado" })
  if (msg === "INSUFFICIENT_STOCK") return reply.status(400).send({ error: "Estoque insuficiente" })
  if (msg === "INVALID_QUANTITY") return reply.status(400).send({ error: "Quantidade inválida" })
  return reply.status(500).send({ error: "Erro interno do servidor" })
}

export async function listProducts(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as { search?: string; filter?: "all" | "low" | "expiring" | "expired" }
    return reply.send(await inventoryService.listProducts(ctx, q))
  } catch (error) {
    req.log.error(error)
    return mapError(error, reply)
  }
}

export async function createProduct(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.status(201).send(await inventoryService.createProduct(ctx, req.body as Parameters<typeof inventoryService.createProduct>[1]))
  } catch (error) {
    req.log.error(error)
    return mapError(error, reply)
  }
}

export async function moveStock(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const body = req.body as { productId: string; type: InventoryMovementType; quantity: number; notes?: string }
    return reply.status(201).send(await inventoryService.moveStock(ctx, body))
  } catch (error) {
    req.log.error(error)
    return mapError(error, reply)
  }
}

export async function listMovements(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as { productId?: string }
    return reply.send(await inventoryService.listMovements(ctx, q.productId))
  } catch (error) {
    req.log.error(error)
    return mapError(error, reply)
  }
}
