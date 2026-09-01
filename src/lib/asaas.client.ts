import QRCode from "qrcode"
import { ASAAS_API_KEY, ASAAS_BASE_URL, ASAAS_PIX_KEY, isAsaasConfigured } from "@/lib/env.js"

export const PIX_QR_PAYMENT_PREFIX = "pixqr_"

export function pixQrTrackingId(qrId: string) {
  return `${PIX_QR_PAYMENT_PREFIX}${qrId}`
}

export function parsePixQrTrackingId(value?: string | null) {
  if (!value?.startsWith(PIX_QR_PAYMENT_PREFIX)) return null
  return value.slice(PIX_QR_PAYMENT_PREFIX.length)
}

function crc16(data: string) {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0")
}

export function pixPayloadCrc(payload: string) {
  const body = payload.includes("6304") ? payload.slice(0, payload.lastIndexOf("6304") + 4) : `${payload}6304`
  return crc16(body)
}

export function isCobvPixPayload(payload?: string | null) {
  return (payload ?? "").includes("pix.asaas.com/qr/cobv")
}

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

export async function createStaticPixQr(input: {
  addressKey: string
  value: number
  description: string
  externalReference: string
  expirationSeconds?: number
}) {
  return asaasFetch<{
    id: string
    encodedImage: string
    payload: string
    expirationDate?: string
    externalReference?: string
  }>("/v3/pix/qrCodes/static", {
    method: "POST",
    body: JSON.stringify({
      addressKey: input.addressKey,
      value: input.value,
      description: input.description.trim().slice(0, 37),
      format: "ALL",
      allowsMultiplePayments: false,
      externalReference: input.externalReference.slice(0, 100),
      expirationSeconds: input.expirationSeconds ?? 60 * 60 * 24 * 3,
    }),
  })
}

export async function resolveReceivingPixKey() {
  const keys = await listPixAddressKeys()
  const active = (keys.data ?? []).filter((k) => k.status === "ACTIVE")
  const envKey = ASAAS_PIX_KEY.trim()
  if (envKey && active.some((k) => k.key === envKey)) return envKey
  return active[0]?.key ?? envKey
}

export async function deleteStaticPixQr(qrId: string) {
  return asaasFetch<{ deleted?: boolean; id?: string }>(
    `/v3/pix/qrCodes/static/${encodeURIComponent(qrId)}`,
    { method: "DELETE" }
  )
}

export async function listPayments(query: { pixQrCodeId?: string; limit?: number }) {
  const qs = new URLSearchParams()
  if (query.pixQrCodeId) qs.set("pixQrCodeId", query.pixQrCodeId)
  qs.set("limit", String(query.limit ?? 10))
  return asaasFetch<{
    data: Array<{
      id: string
      status: string
      value: number
      pixQrCodeId?: string
      externalReference?: string
    }>
  }>(`/v3/payments?${qs.toString()}`)
}

export async function createTrackedStaticPix(input: {
  value: number
  description: string
  externalReference: string
}) {
  const addressKey = await resolveReceivingPixKey()
  if (!addressKey) {
    throw new AsaasApiError(422, "A conta Asaas nao tem chave Pix ativa.")
  }
  const staticQr = await createStaticPixQr({
    addressKey,
    value: input.value,
    description: input.description,
    externalReference: input.externalReference,
  })
  const payload = normalizePixPayload(staticQr.payload)
  if (!isValidPixPayload(payload) || isCobvPixPayload(payload)) {
    throw new AsaasApiError(422, "O Asaas devolveu um Pix que o banco recusa. Gere de novo.")
  }
  let encodedImage = (staticQr.encodedImage ?? "").replace(/^data:image\/\w+;base64,/, "")
  if (!encodedImage) {
    const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 320, errorCorrectionLevel: "M" })
    encodedImage = dataUrl.replace(/^data:image\/\w+;base64,/, "")
  }
  return {
    trackingId: pixQrTrackingId(staticQr.id),
    qrId: staticQr.id,
    encodedImage,
    payload,
  }
}

export async function getPixQrCode(paymentId: string) {
  return asaasFetch<{ encodedImage: string; payload: string; expirationDate: string }>(
    `/v3/payments/${encodeURIComponent(paymentId)}/pixQrCode`
  )
}

export function normalizePixPayload(payload?: string | null) {
  return (payload ?? "").trim()
}

export function isValidPixPayload(payload?: string | null) {
  const p = normalizePixPayload(payload)
  if (!p.startsWith("000201") || p.length < 40) return false
  const idx = p.lastIndexOf("6304")
  if (idx < 0 || p.length < idx + 8) return false
  return pixPayloadCrc(p.slice(0, idx + 4)) === p.slice(idx + 4, idx + 8).toUpperCase()
}

export async function listPixAddressKeys() {
  return asaasFetch<{ data: Array<{ id: string; key: string; type: string; status: string }> }>(
    "/v3/pix/addressKeys?limit=50"
  )
}

export async function hasActivePixAddressKey() {
  const keys = await listPixAddressKeys()
  return Boolean(keys.data?.some((k) => k.status === "ACTIVE"))
}

export async function getAccountRegistrationStatus() {
  return asaasFetch<{
    commercialInfo?: string
    bankAccountInfo?: string
    documentation?: string
    general?: string
  }>("/v3/myAccount/status/")
}

export async function getPixQrCodeReady(paymentId: string) {
  let lastErr: unknown
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const qr = await getPixQrCode(paymentId)
      const payload = normalizePixPayload(qr.payload)
      if (isValidPixPayload(payload)) {
        return {
          ...qr,
          payload,
          encodedImage: (qr.encodedImage ?? "").replace(/^data:image\/\w+;base64,/, ""),
        }
      }
    } catch (err) {
      lastErr = err
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)))
  }
  if (lastErr instanceof AsaasApiError) throw lastErr
  throw new AsaasApiError(
    422,
    "O Pix ainda nao ficou pronto. Confira se a conta Asaas tem chave Pix ativa e tente de novo."
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
    pixQrCodeId?: string
    subscription?: string
    billingType?: string
    dueDate?: string
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
