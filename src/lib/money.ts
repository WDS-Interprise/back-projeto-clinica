export function toCents(value: number): number {
  return Math.round(Number(value) * 100)
}

export function fromCents(cents: number): number {
  return Math.round(cents) / 100
}

export function roundMoney(value: number): number {
  return fromCents(toCents(value))
}

export function moneyFromUnknown(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return roundMoney(value)
  if (typeof value === "string" && value.trim()) return roundMoney(Number(value))
  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return roundMoney(value.toNumber())
  }
  return 0
}
