import type { FastifyRequest, FastifyReply } from "fastify"
import * as financeService from "@/services/finance.service.js"
import { ctxFromRequest } from "@/lib/auth-context.js"
import type {
  FinancialCategoryKind,
  FinancialTransactionStatus,
  FinancialTransactionType,
} from "@prisma/client"

function mapError(error: unknown, reply: FastifyReply) {
  const msg = error instanceof Error ? error.message : "UNKNOWN"
  if (msg === "NOT_FOUND") return reply.status(404).send({ error: "Lançamento não encontrado" })
  if (msg === "INVALID_AMOUNT") return reply.status(400).send({ error: "Valor inválido" })
  if (msg === "TRANSFER_ACCOUNTS_REQUIRED") {
    return reply.status(400).send({ error: "Informe conta de origem e destino" })
  }
  if (msg === "TRANSFER_SAME_ACCOUNT") {
    return reply.status(400).send({ error: "Contas de origem e destino devem ser diferentes" })
  }
  return reply.status(500).send({ error: "Erro interno do servidor" })
}

export async function summary(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as { dateFrom?: string; dateTo?: string }
    return reply.send(await financeService.getSummary(ctx, q))
  } catch (error) {
    req.log.error(error)
    return mapError(error, reply)
  }
}

export async function listTransactions(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as {
      type?: FinancialTransactionType
      status?: FinancialTransactionStatus
      search?: string
      dateFrom?: string
      dateTo?: string
      accountId?: string
      limit?: string
    }
    return reply.send(
      await financeService.listTransactions(ctx, {
        ...q,
        limit: q.limit ? Number(q.limit) : undefined,
      })
    )
  } catch (error) {
    req.log.error(error)
    return mapError(error, reply)
  }
}

export async function createTransaction(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const body = req.body as Parameters<typeof financeService.createTransaction>[1]
    const row = await financeService.createTransaction(ctx, body)
    return reply.status(201).send(row)
  } catch (error) {
    req.log.error(error)
    return mapError(error, reply)
  }
}

export async function updateStatus(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    const { status } = req.body as { status: FinancialTransactionStatus }
    return reply.send(await financeService.updateTransactionStatus(ctx, id, status))
  } catch (error) {
    req.log.error(error)
    return mapError(error, reply)
  }
}

export async function removeTransaction(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const { id } = req.params as { id: string }
    await financeService.deleteTransaction(ctx, id)
    return reply.status(204).send()
  } catch (error) {
    req.log.error(error)
    return mapError(error, reply)
  }
}

export async function listAccounts(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.send(await financeService.listAccounts(ctx))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function listCategories(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as { kind?: FinancialCategoryKind }
    return reply.send(await financeService.listCategories(ctx, q.kind))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function listCostCenters(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.send(await financeService.listCostCenters(ctx))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function listPaymentMethods(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.send(await financeService.listPaymentMethods(ctx))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function cashFlow(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as { dateFrom?: string; dateTo?: string; accountId?: string; mode?: "daily" | "monthly" }
    return reply.send(await financeService.getCashFlow(ctx, q))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function financeSettingsGet(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.send(await financeService.getFinanceSettings(ctx))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function financeSettingsPut(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.send(await financeService.updateFinanceSettings(ctx, req.body as Parameters<typeof financeService.updateFinanceSettings>[1]))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function createAccount(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.status(201).send(await financeService.createAccount(ctx, req.body as { name: string; initialBalance?: number }))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function createCategory(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.status(201).send(await financeService.createCategory(ctx, req.body as { name: string; kind: FinancialCategoryKind }))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function createCostCenter(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.status(201).send(await financeService.createCostCenter(ctx, req.body as { name: string }))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function createPaymentMethod(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    return reply.status(201).send(await financeService.createPaymentMethod(ctx, req.body as { name: string }))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}

export async function analysis(req: FastifyRequest, reply: FastifyReply) {
  try {
    const ctx = await ctxFromRequest(req)
    const q = req.query as { type: "INCOME" | "EXPENSE"; dateFrom?: string; dateTo?: string; groupBy?: "category" | "account" | "insurance" }
    return reply.send(await financeService.financialAnalysis(ctx, q))
  } catch (error) {
    req.log.error(error)
    return reply.status(500).send({ error: "Erro interno do servidor" })
  }
}
