import { ASAAS_API_KEY, ASAAS_BASE_URL, isAsaasConfigured } from "@/lib/env.js"

type AsaasErrorBody = { errors?: Array<{ code?: string; description?: string }> }

export class AsaasApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isAsaasConfigured()) throw new Error("ASAAS_NOT_CONFIGURED")
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      access_token: ASAAS_API_KEY,
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  const json = text ? (JSON.parse(text) as T & AsaasErrorBody) : ({} as T & AsaasErrorBody)
  if (!res.ok) {
    const desc = json.errors?.[0]?.description || `Asaas HTTP ${res.status}`
    throw new AsaasApiError(res.status, desc, json)
  }
  return json
}

export async function createCustomer(input: {
  name: string
  cpfCnpj?: string
  email?: string
  phone?: string
  externalReference?: string
}) {
  return asaasFetch<{ id: string }>("/v3/customers", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function updateCustomer(
  customerId: string,
  input: {
    name?: string
    cpfCnpj?: string
    email?: string
    phone?: string
  }
) {
  return asaasFetch<{ id: string }>(`/v3/customers/${encodeURIComponent(customerId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  })
}

export async function createPixPayment(input: {
  customer: string
  value: number
  dueDate: string
  description: string
  externalReference: string
}) {
  return asaasFetch<{
    id: string
    value: number
    netValue?: number
    status: string
    customer: string
    invoiceUrl?: string
  }>("/v3/payments", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      billingType: "PIX",
    }),
  })
}

export type AsaasCreditCard = {
  holderName: string
  number: string
  expiryMonth: string
  expiryYear: string
  ccv: string
}

export type AsaasCreditCardHolder = {
  name: string
  email: string
  cpfCnpj: string
  postalCode: string
  addressNumber: string
  phone: string
  mobilePhone?: string
}

export async function createCreditCardPayment(input: {
  customer: string
  value: number
  dueDate: string
  description: string
  externalReference: string
  remoteIp: string
  creditCard?: AsaasCreditCard
  creditCardHolderInfo?: AsaasCreditCardHolder
}) {
  return asaasFetch<{
    id: string
    value: number
    netValue?: number
    status: string
    customer: string
    invoiceUrl?: string
    billingType?: string
  }>("/v3/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: input.customer,
      billingType: "CREDIT_CARD",
      value: input.value,
      dueDate: input.dueDate,
      description: input.description,
      externalReference: input.externalReference,
      remoteIp: input.remoteIp,
      ...(input.creditCard ? { creditCard: input.creditCard } : {}),
      ...(input.creditCardHolderInfo ? { creditCardHolderInfo: input.creditCardHolderInfo } : {}),
    }),
  })
}

export async function getPixQrCode(paymentId: string) {
  return asaasFetch<{ encodedImage: string; payload: string; expirationDate: string }>(
    `/v3/payments/${encodeURIComponent(paymentId)}/pixQrCode`
  )
}

export async function deletePayment(paymentId: string) {
  return asaasFetch<{ deleted?: boolean; id?: string }>(
    `/v3/payments/${encodeURIComponent(paymentId)}`,
    { method: "DELETE" }
  )
}

export async function getPayment(paymentId: string) {
  return asaasFetch<{
    id: string
    value: number
    netValue?: number
    status: string
    customer?: string
    externalReference?: string
  }>(`/v3/payments/${encodeURIComponent(paymentId)}`)
}

export async function createPixTransfer(input: {
  value: number
  pixAddressKey: string
  pixAddressKeyType: "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP"
  description: string
  externalReference: string
}) {
  return asaasFetch<{
    id: string
    status: string
    value: number
    failReason?: string | null
  }>("/v3/transfers", {
    method: "POST",
    body: JSON.stringify({
      value: input.value,
      pixAddressKey: input.pixAddressKey,
      pixAddressKeyType: input.pixAddressKeyType,
      operationType: "PIX",
      description: input.description,
      externalReference: input.externalReference,
    }),
  })
}

export async function cancelTransfer(transferId: string) {
  return asaasFetch(`/v3/transfers/${encodeURIComponent(transferId)}/cancel`, { method: "DELETE" })
}

export async function createSubscription(input: {
  customer: string
  value: number
  nextDueDate: string
  cycle: "MONTHLY" | "YEARLY"
  description: string
  externalReference: string
  billingType?: "PIX" | "UNDEFINED"
}) {
  return asaasFetch<{
    id: string
    status: string
    customer: string
    value: number
    nextDueDate: string
  }>("/v3/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      billingType: input.billingType ?? "PIX",
      ...input,
    }),
  })
}

export async function updateSubscription(
  subscriptionId: string,
  input: Partial<{
    value: number
    cycle: "MONTHLY" | "YEARLY"
    nextDueDate: string
    updatePendingPayments: boolean
    status: "ACTIVE" | "INACTIVE"
  }>
) {
  return asaasFetch(`/v3/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  })
}

export async function deleteSubscription(subscriptionId: string) {
  return asaasFetch(`/v3/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" })
}

export async function listSubscriptionPayments(subscriptionId: string) {
  return asaasFetch<{ data: Array<{ id: string; value: number; status: string; dueDate: string; invoiceUrl?: string }> }>(
    `/v3/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=24`
  )
}
