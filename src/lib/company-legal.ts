/**
 * Dados institucionais da pessoa juridica do ClinMax (plataforma, nao a clinica cliente).
 * Manter alinhado com `front-projeto-clinica/src/lib/company-legal.ts`.
 *
 * Campos `null` sao PENDENTE DE CONFIRMACAO. Nao inventar razao social, DPO, foro nem nuvem.
 */

export type CompanyLegalAddress = {
  zipCode: string
  street: string
  number: string
  complement: string | null
  neighborhood: string
  city: string
  state: string
  stateCode: string
  country: string
}

export type CompanyLegalInfo = {
  brandName: string
  legalName: string | null
  cnpj: string
  siteUrl: string
  contactEmail: string
  dpoName: string | null
  dpoEmail: string | null
  venue: string | null
  cloudProvider: string | null
  dataResidencyCountry: string | null
  address: CompanyLegalAddress
}

export const COMPANY_LEGAL: CompanyLegalInfo = {
  brandName: "ClinMax",
  legalName: null,
  cnpj: "50763678000102",
  siteUrl: "https://clinmax.com.br",
  contactEmail: "contato@clinmax.com.br",
  dpoName: null,
  dpoEmail: null,
  venue: null,
  cloudProvider: null,
  dataResidencyCountry: null,
  address: {
    zipCode: "74805480",
    street: "Rua 72",
    number: "223",
    complement: null,
    neighborhood: "Jardim Goiás",
    city: "Goiânia",
    state: "Goiás",
    stateCode: "GO",
    country: "Brasil",
  },
}

export function digitsOnly(value: string) {
  return value.replace(/\D/g, "")
}

export function formatCnpj(value: string) {
  const digits = digitsOnly(value).slice(0, 14)
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2")
}

export function formatCep(value: string) {
  const digits = digitsOnly(value).slice(0, 8)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

export function formattedCompanyCnpj(info: CompanyLegalInfo = COMPANY_LEGAL) {
  return formatCnpj(info.cnpj)
}

export function formatCompanyAddress(info: CompanyLegalInfo = COMPANY_LEGAL) {
  const { street, number, complement, neighborhood, city, stateCode } = info.address
  const cep = formatCep(info.address.zipCode)
  const parts = [
    `${street}, nº ${number}`,
    complement,
    neighborhood,
    `${city} - ${stateCode}`,
    cep ? `CEP ${cep}` : null,
  ].filter((part): part is string => Boolean(part && part.trim()))
  return parts.join(", ")
}

export function formatCompanyCopyright(
  year: number = new Date().getFullYear(),
  info: CompanyLegalInfo = COMPANY_LEGAL,
) {
  const cnpj = formattedCompanyCnpj(info)
  if (info.legalName) {
    return `© ${year} ${info.brandName}. ${info.legalName}. CNPJ ${cnpj}. Todos os direitos reservados.`
  }
  return `© ${year} ${info.brandName}. CNPJ ${cnpj}. Todos os direitos reservados.`
}
