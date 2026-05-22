import QRCode from "qrcode"

export type PrescriptionPdfItem = {
  type: string
  name: string
  presentation?: string | null
  dosage?: string | null
  frequency?: string | null
  duration?: string | null
  quantity?: string | null
  instructions?: string | null
  continuousUse: boolean
}

export type PrescriptionPdfData = {
  id: string
  prescriptionDate: Date
  showDate: boolean
  validationCode: string
  accessCode: string
  notes?: string | null
  clinicName: string
  clinicPhone?: string | null
  patientName: string
  patientCpf?: string | null
  patientPhone?: string | null
  patientAddress?: string | null
  patientBirthDate?: Date | null
  professionalName: string
  professionalCrm?: string | null
  professionalSpecialty?: string | null
  professionalPhone?: string | null
  receiptType: string
  issuedAt: Date
  signedAt?: Date | null
  validateBaseUrl: string
  items: PrescriptionPdfItem[]
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "paciente"
}

function dash(value?: string | null) {
  const v = value?.trim()
  return v ? escapeHtml(v) : "—"
}

function formatDate(d: Date) {
  return d.toLocaleDateString("pt-BR")
}

function formatDateTime(d: Date) {
  return `${d.toLocaleDateString("pt-BR")} - ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
}

function formatFilenameDate(d: Date) {
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  return `${day}-${month}-${year}`
}

export function resolveReceiptTitle(data: PrescriptionPdfData): string {
  if (data.receiptType === "SPECIAL") return "RECEITUÁRIO CONTROLE ESPECIAL"
  const types = new Set(data.items.map((i) => i.type))
  if (types.size === 1 && types.has("EXAM")) return "SOLICITAÇÃO DE EXAMES"
  if (types.size === 1 && types.has("VACCINE")) return "PRESCRIÇÃO DE VACINAS"
  return "RECEITUÁRIO SIMPLES"
}

export function buildPrescriptionFilename(
  data: Pick<PrescriptionPdfData, "patientName" | "prescriptionDate">
): string {
  const slug = slugify(data.patientName)
  const date = formatFilenameDate(data.prescriptionDate)
  return `prescricao-clinmax-${slug}-${date}.pdf`
}

/** URL funcional para QR Code e validação */
export function buildValidateUrl(data: PrescriptionPdfData): string {
  const base = data.validateBaseUrl.replace(/\/$/, "")
  return `${base}/api/public/prescriptions/validate/${encodeURIComponent(data.validationCode)}?accessCode=${encodeURIComponent(data.accessCode)}`
}

/** Texto amigável exibido no PDF (sem localhost) */
export function buildValidateDisplayUrl(data: PrescriptionPdfData): string {
  const isLocal = /localhost|127\.0\.0\.1/i.test(data.validateBaseUrl)
  const code = escapeHtml(data.validationCode)
  const access = escapeHtml(data.accessCode)
  if (isLocal) {
    return `clinmax.com.br/validar-receita/${code}?code=${access}`
  }
  const host = data.validateBaseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")
  return `${escapeHtml(host)}/validar-receita/${code}?code=${access}`
}

function buildMedicationHeadline(item: PrescriptionPdfItem): string {
  const parts: string[] = [item.name.trim()]
  if (item.presentation?.trim()) parts.push(item.presentation.trim())
  let headline = parts.join(", ")
  if (item.quantity?.trim()) {
    headline += ` · ${item.quantity.trim()}`
  }
  return escapeHtml(headline)
}

function buildMedicationSubtitle(item: PrescriptionPdfItem): string | null {
  const parts: string[] = []
  if (item.dosage?.trim()) parts.push(item.dosage.trim())
  if (item.frequency?.trim()) parts.push(item.frequency.trim())
  if (item.duration?.trim()) parts.push(`Duração: ${item.duration.trim()}`)
  if (parts.length === 0) return null
  return escapeHtml(parts.join(" | "))
}

function formatMedicationItem(item: PrescriptionPdfItem, index: number): string {
  const continuous = item.continuousUse
    ? `<span class="continuous-use">uso contínuo</span>`
    : "<span></span>"
  const subtitle = buildMedicationSubtitle(item)
  const instructions = item.instructions?.trim()
    ? `<div class="item-instructions">${escapeHtml(item.instructions.trim())}</div>`
    : ""

  return `<div class="prescription-item">
    <span class="item-num">${index}</span>
    <div class="item-body">
      <div class="item-name">${buildMedicationHeadline(item)}</div>
      ${subtitle ? `<div class="item-details">${subtitle}</div>` : ""}
      ${instructions}
    </div>
    ${continuous}
  </div>`
}

function formatExamItem(item: PrescriptionPdfItem, index: number): string {
  const text =
    item.instructions?.trim() ||
    "Orientação: realizar conforme solicitação médica."
  return `<div class="prescription-item">
    <span class="item-num">${index}</span>
    <div class="item-body">
      <div class="item-name">${escapeHtml(item.name)}</div>
      <div class="item-instructions">${escapeHtml(text)}</div>
    </div>
    <span></span>
  </div>`
}

function formatVaccineItem(item: PrescriptionPdfItem, index: number): string {
  const text =
    item.instructions?.trim() || "Aplicar conforme orientação médica."
  return `<div class="prescription-item">
    <span class="item-num">${index}</span>
    <div class="item-body">
      <div class="item-name">${escapeHtml(item.name)}</div>
      <div class="item-instructions">${escapeHtml(text)}</div>
    </div>
    <span></span>
  </div>`
}

function formatSimpleItem(item: PrescriptionPdfItem, index: number): string {
  const sub = item.instructions?.trim()
    ? `<div class="item-instructions">${escapeHtml(item.instructions.trim())}</div>`
    : ""
  return `<div class="prescription-item">
    <span class="item-num">${index}</span>
    <div class="item-body">
      <div class="item-name">${escapeHtml(item.name)}</div>
      ${sub}
    </div>
    <span></span>
  </div>`
}

function formatItemHtml(item: PrescriptionPdfItem, index: number): string {
  if (item.type === "MEDICATION") return formatMedicationItem(item, index)
  if (item.type === "EXAM") return formatExamItem(item, index)
  if (item.type === "VACCINE") return formatVaccineItem(item, index)
  return formatSimpleItem(item, index)
}

function buildHeaderDoctorLines(data: PrescriptionPdfData): string {
  const profPhone = data.professionalPhone || data.clinicPhone
  const lines: string[] = [
    `<div class="doctor-name">Dr(a). ${escapeHtml(data.professionalName)}</div>`,
  ]
  if (data.professionalCrm) {
    lines.push(`<div>CRM: ${escapeHtml(data.professionalCrm)}</div>`)
  }
  if (profPhone) {
    lines.push(`<div>Telefone: ${escapeHtml(profPhone)}</div>`)
  }
  const clinicLine = [data.clinicName, data.professionalSpecialty]
    .filter(Boolean)
    .join(" — ")
  lines.push(`<div>${escapeHtml(clinicLine)}</div>`)
  return lines.join("")
}

function buildFooterDoctorLine(data: PrescriptionPdfData): string {
  const parts = [`Médico(a): ${escapeHtml(data.professionalName)}`]
  if (data.professionalCrm) parts.push(`CRM: ${escapeHtml(data.professionalCrm)}`)
  const profPhone = data.professionalPhone || data.clinicPhone
  if (profPhone) parts.push(`Telefone: ${escapeHtml(profPhone)}`)
  return parts.join("   ")
}

function buildSignatureBlock(data: PrescriptionPdfData): string {
  if (data.signedAt) {
    return `<p class="signature-status signed">Assinada Digitalmente</p>
      <p class="signature-meta">Assinatura ICP-Brasil · ${formatDateTime(data.signedAt)}</p>`
  }
  return `<p class="signature-status unsigned">Não Assinada Digitalmente</p>`
}

export async function buildPrescriptionHtml(data: PrescriptionPdfData): Promise<string> {
  const title = resolveReceiptTitle(data)
  const validateUrl = buildValidateUrl(data)
  const validateDisplay = buildValidateDisplayUrl(data)
  const qrDataUrl = await QRCode.toDataURL(validateUrl, { margin: 0, width: 90 })
  const itemsHtml = data.items.map((item, idx) => formatItemHtml(item, idx + 1)).join("")
  const isSpecial = data.receiptType === "SPECIAL"

  const buyerSupplierFooter = isSpecial
    ? `<div class="buyer-supplier">
        <div class="box">
          <strong>IDENTIFICAÇÃO DO COMPRADOR</strong>
          <p>Nome:</p>
          <p>Endereço:</p>
          <p>Telefone:</p>
          <p>RG:</p>
          <p>Cidade:</p>
        </div>
        <div class="box">
          <strong>IDENTIFICAÇÃO DO FORNECEDOR</strong>
          <p>DATA:</p>
          <p class="sign-line">ASSINATURA DO FARMACÊUTICO</p>
        </div>
      </div>`
    : ""

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)} — ${escapeHtml(data.validationCode)}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 794px;
      margin: 0;
      padding: 0;
      background: #fff;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #111;
      font-size: 10px;
      line-height: 1.4;
    }
    .page {
      width: 794px;
      min-height: 1123px;
      background: #fff;
      padding: 28px 36px 32px;
      display: flex;
      flex-direction: column;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid #ddd;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .header-left {
      flex: 1;
      font-size: 9px;
      line-height: 1.45;
    }
    .doctor-name { font-weight: 700; font-size: 10px; margin-bottom: 2px; }
    .logo {
      text-align: right;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 3px;
      color: #004b8d;
      line-height: 1.2;
    }
    .logo small {
      display: block;
      font-size: 7px;
      font-weight: 400;
      letter-spacing: 0.5px;
      color: #666;
      margin-top: 2px;
    }
    .patient-info {
      border-bottom: 1px solid #ddd;
      padding-bottom: 10px;
      margin-bottom: 18px;
      font-size: 9px;
      line-height: 1.5;
    }
    .patient-info p { margin: 1px 0; }
    .prescription-title {
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      margin: 0 0 18px;
      letter-spacing: 0.5px;
    }
    .content { flex: 1 1 auto; display: flex; flex-direction: column; }
    .items { flex: 1 1 auto; }
    .notes {
      font-size: 9px;
      margin-bottom: 14px;
      line-height: 1.45;
    }
    .prescription-item {
      display: grid;
      grid-template-columns: 20px 1fr auto;
      gap: 8px;
      margin-bottom: 16px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .item-num { font-size: 10px; font-weight: 700; padding-top: 1px; }
    .item-name { font-weight: 700; font-size: 10px; line-height: 1.35; }
    .item-details { color: #555; font-size: 9px; margin-top: 3px; }
    .item-instructions { margin-top: 4px; font-size: 9px; color: #333; }
    .continuous-use {
      font-size: 8px;
      font-weight: 700;
      font-style: italic;
      color: #444;
      white-space: nowrap;
      align-self: start;
      padding-top: 2px;
    }
    .empty-items { color: #666; font-size: 9px; }
    .buyer-supplier {
      display: flex;
      gap: 12px;
      margin-top: 16px;
      page-break-inside: avoid;
    }
    .box {
      flex: 1;
      border: 1px solid #bbb;
      padding: 8px;
      min-height: 80px;
      font-size: 8px;
    }
    .box p { margin: 5px 0 0; min-height: 12px; }
    .sign-line {
      margin-top: 20px !important;
      text-align: center;
      border-top: 1px solid #999;
      padding-top: 3px;
    }
    .footer {
      flex-shrink: 0;
      margin-top: auto;
      border-top: 1px solid #ddd;
      padding-top: 12px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .footer-left,
    .footer-right {
      font-size: 8px;
      line-height: 1.45;
    }
    .footer-left p { margin: 2px 0; }
    .footer-doctor { margin-bottom: 6px; }
    .footer-brand { font-weight: 700; margin-top: 4px; }
    .signature-status { font-weight: 700; margin-top: 4px; }
    .signature-status.unsigned { color: #c2410c; }
    .signature-status.signed { color: #15803d; }
    .signature-meta { color: #555; font-size: 8px; }
    .footer-right { text-align: right; max-width: 220px; }
    .footer-right p { margin: 2px 0; }
    .validate-url { color: #555; word-break: break-all; font-size: 7px; margin-top: 2px; }
    .qrcode {
      display: block;
      width: 90px;
      height: 90px;
      margin-left: auto;
      margin-top: 6px;
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div class="header-left">
        ${buildHeaderDoctorLines(data)}
      </div>
      <div class="logo">
        CLINMAX
        <small>Prescrição Digital</small>
      </div>
    </header>

    <section class="patient-info">
      <p><strong>Nome do Paciente:</strong> ${escapeHtml(data.patientName)}</p>
      <p><strong>CPF:</strong> ${dash(data.patientCpf)}</p>
      ${data.patientBirthDate ? `<p><strong>Nascimento:</strong> ${formatDate(data.patientBirthDate)}</p>` : ""}
      <p><strong>Telefone:</strong> ${dash(data.patientPhone)}</p>
      ${data.patientAddress ? `<p><strong>Endereço:</strong> ${escapeHtml(data.patientAddress)}</p>` : ""}
    </section>

    <h1 class="prescription-title">${escapeHtml(title)}</h1>

    <div class="content">
      ${data.notes ? `<div class="notes"><strong>Observações:</strong> ${escapeHtml(data.notes)}</div>` : ""}
      <div class="items">${itemsHtml || "<p class='empty-items'>Nenhum item prescrito.</p>"}</div>
      ${buyerSupplierFooter}
    </div>

    <footer class="footer">
      <div class="footer-left">
        <p class="footer-doctor">${buildFooterDoctorLine(data)}</p>
        <p class="footer-brand">Prescrição Digital Emitida em Clinmax</p>
        <p>Emissão: ${formatDateTime(data.issuedAt)}</p>
        ${buildSignatureBlock(data)}
        ${data.showDate ? `<p>Data da prescrição: ${formatDate(data.prescriptionDate)}</p>` : ""}
      </div>
      <div class="footer-right">
        <p><strong>ID da Receita:</strong> ${escapeHtml(data.validationCode)}</p>
        <p><strong>Código de Acesso:</strong> ${escapeHtml(data.accessCode)}</p>
        <p>Verificar autenticidade em:</p>
        <p class="validate-url">${validateDisplay}</p>
        <img class="qrcode" src="${qrDataUrl}" alt="QR Code" width="90" height="90"/>
      </div>
    </footer>
  </div>
</body>
</html>`
}
