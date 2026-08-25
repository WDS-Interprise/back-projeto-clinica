export const SIGNATURE_PROVIDERS = ["STUB", "LOCAL_CERTIFICATE", "CLOUD_CERTIFICATE"] as const
export type SignatureProviderId = (typeof SIGNATURE_PROVIDERS)[number]

export type SignatureLegalClass =
  | "NONE"
  | "SIMULATION"
  | "CRYPTOGRAPHIC_PENDING"
  | "ICP_BRASIL_PADES"

export type CreateSignatureInput = {
  clinicId: string
  prescriptionId: string
  documentHash: string
  requestedByUserId: string
  mode?: "NONE" | "STUB" | "LOCAL_CERT" | "CLOUD_CERT"
}

export type SignatureResult = {
  provider: SignatureProviderId
  status: "PENDING" | "PROCESSING" | "SIMULATED" | "SIGNED" | "FAILED"
  isCryptographic: boolean
  legalClass: SignatureLegalClass
  signatureFormat: string | null
  signaturePolicy: string | null
  documentHash: string
  signedDocumentHash: string | null
  failureCode: string | null
  failureMessage: string | null
  certificateType: string | null
}

export interface DigitalSignatureProvider {
  id: SignatureProviderId
  createSignature(input: CreateSignatureInput): Promise<SignatureResult>
  getStatus(providerTransactionId: string): Promise<SignatureResult>
  validateSignature(input: { documentHash: string; signedDocumentHash?: string | null }): Promise<{
    valid: boolean
    legalClass: SignatureLegalClass
    reason: string
  }>
}

export function classifySignatureLabel(result: Pick<SignatureResult, "isCryptographic" | "legalClass" | "status">): {
  pdfTitle: string
  pdfMeta: string
  isIcpBrasil: boolean
} {
  if (result.legalClass === "ICP_BRASIL_PADES" && result.isCryptographic && result.status === "SIGNED") {
    return {
      pdfTitle: "Assinada digitalmente",
      pdfMeta: "Assinatura PAdES ICP-Brasil",
      isIcpBrasil: true,
    }
  }
  if (result.status === "SIMULATED" || result.legalClass === "SIMULATION") {
    return {
      pdfTitle: "Simulacao de assinatura",
      pdfMeta: "Sem validade juridica. Nao e assinatura ICP-Brasil",
      isIcpBrasil: false,
    }
  }
  return {
    pdfTitle: "Nao assinada digitalmente",
    pdfMeta: "Documento emitido sem assinatura criptografica",
    isIcpBrasil: false,
  }
}
