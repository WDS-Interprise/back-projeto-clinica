import type {
  CreateSignatureInput,
  DigitalSignatureProvider,
  SignatureResult,
} from "@/domain/signature/types.js"

export class StubSignatureProvider implements DigitalSignatureProvider {
  id = "STUB" as const

  async createSignature(input: CreateSignatureInput): Promise<SignatureResult> {
    return {
      provider: "STUB",
      status: "SIMULATED",
      isCryptographic: false,
      legalClass: "SIMULATION",
      signatureFormat: null,
      signaturePolicy: null,
      documentHash: input.documentHash,
      signedDocumentHash: null,
      failureCode: null,
      failureMessage: null,
      certificateType: null,
    }
  }

  async getStatus(): Promise<SignatureResult> {
    return {
      provider: "STUB",
      status: "SIMULATED",
      isCryptographic: false,
      legalClass: "SIMULATION",
      signatureFormat: null,
      signaturePolicy: null,
      documentHash: "",
      signedDocumentHash: null,
      failureCode: null,
      failureMessage: null,
      certificateType: null,
    }
  }

  async validateSignature() {
    return {
      valid: false,
      legalClass: "SIMULATION" as const,
      reason: "STUB_NOT_CRYPTOGRAPHIC",
    }
  }
}

export function getSignatureProvider(_id?: string | null): DigitalSignatureProvider {
  return new StubSignatureProvider()
}
