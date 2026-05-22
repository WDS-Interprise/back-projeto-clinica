const RXTERMS_BASE =
  process.env.RXTERMS_BASE_URL ??
  "https://clinicaltables.nlm.nih.gov/api/rxterms/v3"
const RXTERMS_TIMEOUT_MS = Number(process.env.RXTERMS_TIMEOUT_MS ?? 10000)

/** Resposta bruta da API ClinicalTables RxTerms. */
export type RxTermsRawResponse = [
  number,
  string[],
  {
    STRENGTHS_AND_FORMS?: string[][]
    RXCUIS?: string[][]
  },
  string[][]?,
]

async function rxtermsFetch(path: string): Promise<RxTermsRawResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RXTERMS_TIMEOUT_MS)
  try {
    const res = await fetch(`${RXTERMS_BASE}${path}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`RxTerms HTTP ${res.status}`)
    return (await res.json()) as RxTermsRawResponse
  } finally {
    clearTimeout(timer)
  }
}

export async function searchRxTerms(terms: string, maxList = 20) {
  const params = new URLSearchParams({
    terms: terms.trim(),
    ef: "STRENGTHS_AND_FORMS,RXCUIS",
    maxList: String(Math.min(Math.max(maxList, 1), 50)),
  })
  return rxtermsFetch(`/search?${params}`)
}
