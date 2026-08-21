/**
 * Catálogo local de nomes comerciais → princípios ativos / slug Consulta Remédios.
 * Complementa Bulapi/Anvisa quando bloqueadas ou incompletas.
 */
export type MedicineAliasEntry = {
  /** Chave estável para deduplicação */
  key: string
  /** Nome principal exibido na busca */
  displayName: string
  commercialNames: string[]
  substances: string[]
  /** Slug em consultaremedios.com.br/{slug}/bula/... */
  crSlug?: string
  manufacturer?: string
}

export const MEDICINE_ALIASES: MedicineAliasEntry[] = [
  {
    key: "sepurin",
    displayName: "Sepurin",
    commercialNames: ["Sepurin", "Sepurin®"],
    substances: ["Metenamina", "Cloreto de metiltionínio"],
    crSlug: "sepurin",
    manufacturer: "Gross",
  },
  {
    key: "tansulosina",
    displayName: "Tansulosina",
    commercialNames: [
      "Omnic",
      "Secotex",
      "Tamsulon",
      "Cloridrato de tansulosina",
      "Cloridrato de tamsulosina",
      "Tamsulosina",
    ],
    substances: ["Tansulosina", "Tamsulosina", "Cloridrato de tansulosina"],
    crSlug: "tansulosina",
  },
]

const SALT_PREFIX_RE =
  /^(?:di)?cloridrato\s+de\s+|maleato\s+de\s+|besilato\s+de\s+|succinato\s+de\s+|fosfato\s+de\s+|acetato\s+de\s+|sulfato\s+de\s+|citrato\s+de\s+|bromidrato\s+de\s+|mesilato\s+de\s+|oxalato\s+de\s+|furoato\s+de\s+|propionato\s+de\s+|valerato\s+de\s+|hemifumarato\s+de\s+|hemi-?fumarato\s+de\s+|tartrato\s+de\s+/i

const SALT_SUFFIX_RE =
  /\s+(?:di)?cloridrato|\s+maleato|\s+besilato|\s+succinato|\s+monoidratad[ao]|\s+s[oó]dic[ao]|\s+pot[aá]ssic[ao]$/i

const GENERIC_SALT_TOKENS = new Set([
  "cloridrato",
  "dicloridrato",
  "maleato",
  "besilato",
  "succinato",
  "fosfato",
  "acetato",
  "sulfato",
  "citrato",
  "bromidrato",
  "mesilato",
  "oxalato",
  "furoato",
  "propionato",
  "valerato",
  "hemifumarato",
  "tartrato",
  "monoidratada",
  "monoidratado",
])

function normalizeTerm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function stripSaltAffixes(query: string) {
  let next = normalizeTerm(query)
  next = next.replace(SALT_PREFIX_RE, "").trim()
  next = next.replace(SALT_SUFFIX_RE, "").trim()
  return next
}

function spellingVariants(term: string): string[] {
  const out = [term]
  if (/\btansulosina\b/.test(term)) {
    out.push(term.replace(/\btansulosina\b/g, "tamsulosina"))
  }
  if (/\btamsulosina\b/.test(term)) {
    out.push(term.replace(/\btamsulosina\b/g, "tansulosina"))
  }
  return out
}

/** Termos extras para APIs que indexam o princípio sem o sal. */
export function expandMedicineQueryTerms(query: string): string[] {
  const seen = new Set<string>()
  const add = (value: string) => {
    const n = value.trim()
    if (n.length >= 3) seen.add(n)
  }

  add(query.trim())
  const stripped = stripSaltAffixes(query)
  add(stripped)

  for (const current of [...seen]) {
    for (const variant of spellingVariants(normalizeTerm(current))) {
      add(variant)
    }
  }

  return [...seen]
}

export function isGenericSaltToken(token: string) {
  return GENERIC_SALT_TOKENS.has(normalizeTerm(token))
}

export function matchMedicineAliases(query: string): MedicineAliasEntry[] {
  const terms = expandMedicineQueryTerms(query).map(normalizeTerm).filter(Boolean)
  if (terms.length === 0) return []

  return MEDICINE_ALIASES.filter((entry) => {
    const names = [entry.key, entry.displayName, ...entry.commercialNames, ...entry.substances]
    return names.some((name) => {
      const n = normalizeTerm(name)
      return terms.some((q) => n === q || n.includes(q) || q.includes(n))
    })
  })
}

export function findMedicineAliasByKey(key: string): MedicineAliasEntry | undefined {
  const q = normalizeTerm(key)
  return MEDICINE_ALIASES.find((entry) => normalizeTerm(entry.key) === q)
}

export function aliasToSearchTerms(entry: MedicineAliasEntry): string[] {
  return [
    entry.displayName,
    ...entry.commercialNames,
    ...entry.substances,
    entry.crSlug ?? "",
  ].filter(Boolean)
}
