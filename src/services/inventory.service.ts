import { addDays, endOfDay, startOfDay } from "date-fns"
import prisma from "@/lib/prisma.js"
import type { AuthContext } from "@/types/index.js"
import type { InventoryMovementType } from "@prisma/client"

export async function listProducts(
  ctx: AuthContext,
  params: { search?: string; filter?: "all" | "low" | "expiring" | "expired" }
) {
  const where: Record<string, unknown> = { clinicId: ctx.clinicId, active: true }
  if (params.search?.trim()) {
    where.OR = [
      { name: { contains: params.search.trim() } },
      { sku: { contains: params.search.trim() } },
    ]
  }

  const products = await prisma.inventoryProduct.findMany({
    where,
    orderBy: { name: "asc" },
  })

  const now = new Date()
  const in30 = addDays(now, 30)

  return products.filter((p) => {
    if (params.filter === "low") return p.currentStock <= p.minStock
    if (params.filter === "expiring") return p.expiryDate && p.expiryDate <= in30 && p.expiryDate >= now
    if (params.filter === "expired") return p.expiryDate && p.expiryDate < now
    return true
  })
}

export async function createProduct(
  ctx: AuthContext,
  data: {
    name: string
    sku?: string
    unit?: string
    minStock?: number
    currentStock?: number
    expiryDate?: string
  }
) {
  return prisma.inventoryProduct.create({
    data: {
      clinicId: ctx.clinicId,
      name: data.name.trim(),
      sku: data.sku?.trim() || null,
      unit: data.unit?.trim() || "un",
      minStock: data.minStock ?? 0,
      currentStock: data.currentStock ?? 0,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
    },
  })
}

export async function moveStock(
  ctx: AuthContext,
  data: { productId: string; type: InventoryMovementType; quantity: number; notes?: string }
) {
  if (data.quantity <= 0 && data.type !== "ADJUST") throw new Error("INVALID_QUANTITY")

  const product = await prisma.inventoryProduct.findFirst({
    where: { id: data.productId, clinicId: ctx.clinicId, active: true },
  })
  if (!product) throw new Error("NOT_FOUND")

  let newStock = product.currentStock
  if (data.type === "IN") newStock += data.quantity
  else if (data.type === "OUT") newStock -= data.quantity
  else newStock = data.quantity

  if (newStock < 0) throw new Error("INSUFFICIENT_STOCK")

  const [movement] = await prisma.$transaction([
    prisma.inventoryMovement.create({
      data: {
        clinicId: ctx.clinicId,
        productId: product.id,
        type: data.type,
        quantity: data.type === "ADJUST" ? Math.abs(newStock - product.currentStock) : data.quantity,
        notes: data.notes || null,
        createdById: ctx.userId,
      },
    }),
    prisma.inventoryProduct.update({
      where: { id: product.id },
      data: { currentStock: newStock },
    }),
  ])

  return movement
}

export async function listMovements(ctx: AuthContext, productId?: string) {
  return prisma.inventoryMovement.findMany({
    where: { clinicId: ctx.clinicId, ...(productId ? { productId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { product: { select: { id: true, name: true } } },
  })
}
