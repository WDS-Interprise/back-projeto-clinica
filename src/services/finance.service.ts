import { endOfDay, startOfDay, subDays } from "date-fns"
import prisma from "@/lib/prisma.js"
import type { AuthContext } from "@/types/index.js"
import type {
  FinancialCategoryKind,
  FinancialTransactionStatus,
  FinancialTransactionType,
} from "@prisma/client"

const txInclude = {
  account: { select: { id: true, name: true } },
  transferFrom: { select: { id: true, name: true } },
  transferTo: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, kind: true } },
  costCenter: { select: { id: true, name: true } },
  paymentMethod: { select: { id: true, name: true } },
  patient: { select: { id: true, name: true } },
  doctor: { select: { id: true, name: true } },
  procedure: { select: { id: true, name: true } },
}

function decimalToNumber(value: { toString(): string } | number | null | undefined) {
  if (value == null) return 0
  return Number(value)
}

function serializeTransaction(row: {
  amount: { toString(): string } | number
  [key: string]: unknown
}) {
  return {
    ...row,
    amount: decimalToNumber(row.amount as { toString(): string }),
  }
}

export async function ensureDefaultFinanceSetup(clinicId: string) {
  const accountCount = await prisma.financialAccount.count({ where: { clinicId } })
  if (accountCount > 0) return

  const account = await prisma.financialAccount.create({
    data: {
      clinicId,
      name: "Conta principal",
      initialBalance: 0,
    },
  })

  const incomeCategories = [
    "Consulta",
    "Procedimento",
    "Retorno",
    "Outras receitas",
  ]
  const expenseCategories = [
    "Aluguel",
    "Salários",
    "Material",
    "Impostos",
    "Outras despesas",
  ]

  await prisma.financialCategory.createMany({
    data: [
      ...incomeCategories.map((name) => ({
        clinicId,
        name,
        kind: "INCOME" as FinancialCategoryKind,
      })),
      ...expenseCategories.map((name) => ({
        clinicId,
        name,
        kind: "EXPENSE" as FinancialCategoryKind,
      })),
    ],
  })

  await prisma.costCenter.create({
    data: { clinicId, name: "Geral" },
  })

  await prisma.paymentMethod.createMany({
    data: [
      { clinicId, name: "Dinheiro" },
      { clinicId, name: "PIX" },
      { clinicId, name: "Cartão de crédito" },
      { clinicId, name: "Cartão de débito" },
      { clinicId, name: "Transferência" },
    ],
  })

  return account
}

export async function listAccounts(ctx: AuthContext) {
  await ensureDefaultFinanceSetup(ctx.clinicId)
  return prisma.financialAccount.findMany({
    where: { clinicId: ctx.clinicId, active: true },
    orderBy: { name: "asc" },
  })
}

export async function listCategories(ctx: AuthContext, kind?: FinancialCategoryKind) {
  await ensureDefaultFinanceSetup(ctx.clinicId)
  return prisma.financialCategory.findMany({
    where: {
      clinicId: ctx.clinicId,
      active: true,
      ...(kind ? { kind } : {}),
    },
    orderBy: { name: "asc" },
  })
}

export async function listCostCenters(ctx: AuthContext) {
  await ensureDefaultFinanceSetup(ctx.clinicId)
  return prisma.costCenter.findMany({
    where: { clinicId: ctx.clinicId, active: true },
    orderBy: { name: "asc" },
  })
}

export async function listPaymentMethods(ctx: AuthContext) {
  await ensureDefaultFinanceSetup(ctx.clinicId)
  return prisma.paymentMethod.findMany({
    where: { clinicId: ctx.clinicId, active: true },
    orderBy: { name: "asc" },
  })
}

export async function listTransactions(
  ctx: AuthContext,
  params: {
    type?: FinancialTransactionType
    status?: FinancialTransactionStatus
    search?: string
    dateFrom?: string
    dateTo?: string
    accountId?: string
    limit?: number
  }
): Promise<ReturnType<typeof serializeTransaction>[]> {
  await ensureDefaultFinanceSetup(ctx.clinicId)

  const where: Record<string, unknown> = {
    clinicId: ctx.clinicId,
    status: { not: "CANCELLED" },
  }

  if (params.type) where.type = params.type
  if (params.status) where.status = params.status
  if (params.accountId) {
    where.OR = [
      { accountId: params.accountId },
      { transferFromId: params.accountId },
      { transferToId: params.accountId },
    ]
  }
  if (params.search?.trim()) {
    where.description = { contains: params.search.trim() }
  }
  if (params.dateFrom || params.dateTo) {
    where.date = {
      ...(params.dateFrom ? { gte: startOfDay(new Date(params.dateFrom)) } : {}),
      ...(params.dateTo ? { lte: endOfDay(new Date(params.dateTo)) } : {}),
    }
  }

  const rows = await prisma.financialTransaction.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: params.limit ?? 200,
    include: txInclude,
  })

  return rows.map(serializeTransaction)
}

export async function getSummary(
  ctx: AuthContext,
  params: { dateFrom?: string; dateTo?: string }
) {
  await ensureDefaultFinanceSetup(ctx.clinicId)

  const dateFrom = params.dateFrom
    ? startOfDay(new Date(params.dateFrom))
    : startOfDay(subDays(new Date(), 29))
  const dateTo = params.dateTo ? endOfDay(new Date(params.dateTo)) : endOfDay(new Date())

  const transactions = await prisma.financialTransaction.findMany({
    where: {
      clinicId: ctx.clinicId,
      status: { not: "CANCELLED" },
      date: { gte: dateFrom, lte: dateTo },
    },
    include: {
      category: { select: { name: true, kind: true } },
    },
  })

  let incomePaid = 0
  let incomePending = 0
  let expensePaid = 0
  let expensePending = 0
  const byInsurance = new Map<string, number>()
  const byProcedureCategory = new Map<string, number>()

  for (const tx of transactions) {
    const amount = decimalToNumber(tx.amount)
    if (tx.type === "TRANSFER") continue

    if (tx.type === "INCOME") {
      if (tx.status === "PAID") incomePaid += amount
      else incomePending += amount
      const key = tx.insurancePlan || "Particular"
      byInsurance.set(key, (byInsurance.get(key) ?? 0) + amount)
      const cat = tx.category?.name ?? "Sem categoria"
      byProcedureCategory.set(cat, (byProcedureCategory.get(cat) ?? 0) + amount)
    } else if (tx.type === "EXPENSE") {
      if (tx.status === "PAID") expensePaid += amount
      else expensePending += amount
    }
  }

  const accounts = await prisma.financialAccount.findMany({
    where: { clinicId: ctx.clinicId, active: true },
  })

  const allPaid = await prisma.financialTransaction.findMany({
    where: {
      clinicId: ctx.clinicId,
      status: "PAID",
      type: { not: "TRANSFER" },
    },
    select: { type: true, amount: true, accountId: true, transferFromId: true, transferToId: true },
  })

  const accountBalances = accounts.map((acc) => {
    let balance = decimalToNumber(acc.initialBalance)
    for (const tx of allPaid) {
      const amount = decimalToNumber(tx.amount)
      if (tx.type === "INCOME" && tx.accountId === acc.id) balance += amount
      if (tx.type === "EXPENSE" && tx.accountId === acc.id) balance -= amount
      if (tx.type === "TRANSFER") {
        if (tx.transferFromId === acc.id) balance -= amount
        if (tx.transferToId === acc.id) balance += amount
      }
    }
    return { id: acc.id, name: acc.name, balance }
  })

  const generalBalance = accountBalances.reduce((sum, a) => sum + a.balance, 0)

  return {
    period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
    balance: generalBalance,
    accounts: accountBalances,
    incomePaid,
    incomePending,
    expensePaid,
    expensePending,
    balancePeriod: incomePaid - expensePaid,
    byInsurance: [...byInsurance.entries()].map(([label, value]) => ({ label, value })),
    byCategory: [...byProcedureCategory.entries()].map(([label, value]) => ({ label, value })),
    recentTransactions: await listTransactions(ctx, {
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
      limit: 10,
    }),
  }
}

export async function createTransaction(
  ctx: AuthContext,
  data: {
    type: FinancialTransactionType
    description: string
    amount: number
    date: string
    dueDate?: string
    status?: FinancialTransactionStatus
    accountId?: string
    transferFromId?: string
    transferToId?: string
    categoryId?: string
    costCenterId?: string
    paymentMethodId?: string
    patientId?: string
    doctorId?: string
    procedureId?: string
    appointmentId?: string
    insurancePlan?: string
    notes?: string
  }
) {
  await ensureDefaultFinanceSetup(ctx.clinicId)

  if (data.amount <= 0) throw new Error("INVALID_AMOUNT")

  if (data.type === "TRANSFER") {
    if (!data.transferFromId || !data.transferToId) throw new Error("TRANSFER_ACCOUNTS_REQUIRED")
    if (data.transferFromId === data.transferToId) throw new Error("TRANSFER_SAME_ACCOUNT")
  } else if (!data.accountId) {
    const defaultAccount = await prisma.financialAccount.findFirst({
      where: { clinicId: ctx.clinicId, active: true },
      orderBy: { createdAt: "asc" },
    })
    if (!defaultAccount) throw new Error("NO_ACCOUNT")
    data.accountId = defaultAccount.id
  }

  const status = data.status ?? "PAID"
  const paidAt = status === "PAID" ? new Date(data.date) : null

  const row = await prisma.financialTransaction.create({
    data: {
      clinicId: ctx.clinicId,
      type: data.type,
      status,
      description: data.description.trim(),
      amount: data.amount,
      date: new Date(data.date),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      paidAt,
      accountId: data.type === "TRANSFER" ? null : data.accountId,
      transferFromId: data.type === "TRANSFER" ? data.transferFromId : null,
      transferToId: data.type === "TRANSFER" ? data.transferToId : null,
      categoryId: data.categoryId || null,
      costCenterId: data.costCenterId || null,
      paymentMethodId: data.paymentMethodId || null,
      patientId: data.patientId || null,
      doctorId: data.doctorId || null,
      procedureId: data.procedureId || null,
      appointmentId: data.appointmentId || null,
      insurancePlan: data.insurancePlan || null,
      notes: data.notes || null,
      createdById: ctx.userId,
    },
    include: txInclude,
  })

  return serializeTransaction(row)
}

export async function updateTransactionStatus(
  ctx: AuthContext,
  id: string,
  status: FinancialTransactionStatus
) {
  const existing = await prisma.financialTransaction.findFirst({
    where: { id, clinicId: ctx.clinicId },
  })
  if (!existing) throw new Error("NOT_FOUND")

  const row = await prisma.financialTransaction.update({
    where: { id },
    data: {
      status,
      paidAt: status === "PAID" ? existing.paidAt ?? new Date() : null,
    },
    include: txInclude,
  })

  return serializeTransaction(row)
}

export async function deleteTransaction(ctx: AuthContext, id: string) {
  const existing = await prisma.financialTransaction.findFirst({
    where: { id, clinicId: ctx.clinicId },
  })
  if (!existing) throw new Error("NOT_FOUND")

  await prisma.financialTransaction.update({
    where: { id },
    data: { status: "CANCELLED" },
  })
}

export async function getCashFlow(
  ctx: AuthContext,
  params: { dateFrom?: string; dateTo?: string; accountId?: string; mode?: "daily" | "monthly" }
) {
  await ensureDefaultFinanceSetup(ctx.clinicId)
  const dateFrom = params.dateFrom
    ? startOfDay(new Date(params.dateFrom))
    : startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const dateTo = params.dateTo ? endOfDay(new Date(params.dateTo)) : endOfDay(new Date())

  const where: Record<string, unknown> = {
    clinicId: ctx.clinicId,
    status: "PAID",
    date: { gte: dateFrom, lte: dateTo },
  }
  if (params.accountId) {
    where.OR = [
      { accountId: params.accountId },
      { transferFromId: params.accountId },
      { transferToId: params.accountId },
    ]
  }

  const txs = await prisma.financialTransaction.findMany({
    where,
    orderBy: { date: "asc" },
  })

  const buckets = new Map<string, { income: number; expense: number; balance: number }>()
  let running = 0

  for (const tx of txs) {
    const d = new Date(tx.date)
    const key =
      params.mode === "monthly"
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        : d.toISOString().slice(0, 10)
    const bucket = buckets.get(key) ?? { income: 0, expense: 0, balance: 0 }
    const amount = decimalToNumber(tx.amount)
    if (tx.type === "INCOME") {
      bucket.income += amount
      running += amount
    } else if (tx.type === "EXPENSE") {
      bucket.expense += amount
      running -= amount
    } else if (tx.type === "TRANSFER") {
      if (params.accountId) {
        if (tx.transferFromId === params.accountId) running -= amount
        if (tx.transferToId === params.accountId) running += amount
      }
    }
    bucket.balance = running
    buckets.set(key, bucket)
  }

  return {
    period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
    mode: params.mode ?? "daily",
    rows: [...buckets.entries()].map(([period, data]) => ({ period, ...data })),
    endingBalance: running,
  }
}

export async function getFinanceSettings(ctx: AuthContext) {
  await ensureDefaultFinanceSetup(ctx.clinicId)
  const settings = await prisma.clinicFinanceSettings.findUnique({
    where: { clinicId: ctx.clinicId },
  })
  return (
    settings ?? {
      clinicId: ctx.clinicId,
      defaultAccountId: null,
      defaultCostCenterId: null,
      defaultPaymentMethodId: null,
      autoGenerateOnAppointment: false,
    }
  )
}

export async function updateFinanceSettings(
  ctx: AuthContext,
  data: {
    defaultAccountId?: string | null
    defaultCostCenterId?: string | null
    defaultPaymentMethodId?: string | null
    autoGenerateOnAppointment?: boolean
  }
) {
  await ensureDefaultFinanceSetup(ctx.clinicId)
  return prisma.clinicFinanceSettings.upsert({
    where: { clinicId: ctx.clinicId },
    create: {
      clinicId: ctx.clinicId,
      defaultAccountId: data.defaultAccountId ?? null,
      defaultCostCenterId: data.defaultCostCenterId ?? null,
      defaultPaymentMethodId: data.defaultPaymentMethodId ?? null,
      autoGenerateOnAppointment: data.autoGenerateOnAppointment ?? false,
    },
    update: {
      defaultAccountId: data.defaultAccountId ?? null,
      defaultCostCenterId: data.defaultCostCenterId ?? null,
      defaultPaymentMethodId: data.defaultPaymentMethodId ?? null,
      autoGenerateOnAppointment: data.autoGenerateOnAppointment ?? false,
    },
  })
}

async function assertClinicEntity(clinicId: string, model: "account" | "category" | "costCenter" | "paymentMethod", id: string) {
  const map = {
    account: () => prisma.financialAccount.findFirst({ where: { id, clinicId } }),
    category: () => prisma.financialCategory.findFirst({ where: { id, clinicId } }),
    costCenter: () => prisma.costCenter.findFirst({ where: { id, clinicId } }),
    paymentMethod: () => prisma.paymentMethod.findFirst({ where: { id, clinicId } }),
  }
  const row = await map[model]()
  if (!row) throw new Error("NOT_FOUND")
  return row
}

export async function createAccount(ctx: AuthContext, data: { name: string; initialBalance?: number }) {
  return prisma.financialAccount.create({
    data: { clinicId: ctx.clinicId, name: data.name.trim(), initialBalance: data.initialBalance ?? 0 },
  })
}

export async function updateAccount(ctx: AuthContext, id: string, data: { name?: string; active?: boolean }) {
  await assertClinicEntity(ctx.clinicId, "account", id)
  return prisma.financialAccount.update({ where: { id }, data })
}

export async function createCategory(
  ctx: AuthContext,
  data: { name: string; kind: FinancialCategoryKind }
) {
  return prisma.financialCategory.create({
    data: { clinicId: ctx.clinicId, name: data.name.trim(), kind: data.kind },
  })
}

export async function updateCategory(ctx: AuthContext, id: string, data: { name?: string; active?: boolean }) {
  await assertClinicEntity(ctx.clinicId, "category", id)
  return prisma.financialCategory.update({ where: { id }, data })
}

export async function createCostCenter(ctx: AuthContext, data: { name: string }) {
  return prisma.costCenter.create({ data: { clinicId: ctx.clinicId, name: data.name.trim() } })
}

export async function updateCostCenter(ctx: AuthContext, id: string, data: { name?: string; active?: boolean }) {
  await assertClinicEntity(ctx.clinicId, "costCenter", id)
  return prisma.costCenter.update({ where: { id }, data })
}

export async function createPaymentMethod(ctx: AuthContext, data: { name: string }) {
  return prisma.paymentMethod.create({ data: { clinicId: ctx.clinicId, name: data.name.trim() } })
}

export async function updatePaymentMethod(ctx: AuthContext, id: string, data: { name?: string; active?: boolean }) {
  await assertClinicEntity(ctx.clinicId, "paymentMethod", id)
  return prisma.paymentMethod.update({ where: { id }, data })
}

export async function financialAnalysis(
  ctx: AuthContext,
  params: {
    type: "INCOME" | "EXPENSE"
    dateFrom?: string
    dateTo?: string
    groupBy?: "category" | "account" | "insurance"
  }
) {
  const dateFrom = params.dateFrom
    ? startOfDay(new Date(params.dateFrom))
    : startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const dateTo = params.dateTo ? endOfDay(new Date(params.dateTo)) : endOfDay(new Date())

  const txs = await prisma.financialTransaction.findMany({
    where: {
      clinicId: ctx.clinicId,
      type: params.type,
      status: { not: "CANCELLED" },
      date: { gte: dateFrom, lte: dateTo },
    },
    include: {
      category: { select: { name: true } },
      account: { select: { name: true } },
    },
  })

  const groups = new Map<string, number>()
  let total = 0
  for (const tx of txs) {
    const amount = decimalToNumber(tx.amount)
    total += amount
    let key = "Sem categoria"
    if (params.groupBy === "account") key = tx.account?.name ?? "Sem conta"
    else if (params.groupBy === "insurance") key = tx.insurancePlan ?? "Particular"
    else key = tx.category?.name ?? "Sem categoria"
    groups.set(key, (groups.get(key) ?? 0) + amount)
  }

  return {
    type: params.type,
    period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
    total,
    groups: [...groups.entries()].map(([label, value]) => ({ label, value })),
  }
}
