export const CLINIC_LOGO_MAX_BYTES = 400_000

const ALLOWED_MIME: Record<string, { ext: string; contentType: string }> = {
  "image/png": { ext: "png", contentType: "image/png" },
  "image/jpeg": { ext: "jpg", contentType: "image/jpeg" },
  "image/jpg": { ext: "jpg", contentType: "image/jpeg" },
  "image/webp": { ext: "webp", contentType: "image/webp" },
}

export type ParsedClinicLogo = {
  buffer: Buffer
  contentType: string
  filename: string
}

const DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/

export function parseClinicLogoDataUrl(logoUrl: string | null | undefined): ParsedClinicLogo | null {
  if (!logoUrl?.trim()) return null
  const match = DATA_URL_RE.exec(logoUrl.trim())
  if (!match) return null

  const mime = match[1].toLowerCase()
  const allowed = ALLOWED_MIME[mime]
  if (!allowed) return null

  let buffer: Buffer
  try {
    buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64")
  } catch {
    return null
  }

  if (!buffer.length || buffer.length > CLINIC_LOGO_MAX_BYTES) return null

  return {
    buffer,
    contentType: allowed.contentType,
    filename: `clinic-logo.${allowed.ext}`,
  }
}

export function assertClinicLogoUrl(logoUrl: string | null | undefined) {
  if (logoUrl == null || logoUrl === "") return
  if (!parseClinicLogoDataUrl(logoUrl)) {
    throw Object.assign(new Error("Logo inválida. Use PNG, JPEG ou WebP de até 400 KB."), {
      code: "INVALID_LOGO",
    })
  }
}

export function clinicLogoCidAttachment(
  logoUrl: string | null | undefined,
  cid: string,
): {
  filename: string
  content: Buffer
  cid: string
  contentType: string
} | null {
  const parsed = parseClinicLogoDataUrl(logoUrl)
  if (!parsed) return null
  return {
    filename: parsed.filename,
    content: parsed.buffer,
    cid,
    contentType: parsed.contentType,
  }
}
