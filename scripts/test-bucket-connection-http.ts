type JsonRecord = Record<string, unknown>

function cfg() {
  const token =
    process.env.STORAGE_CONNECTION_TOKEN?.trim() ||
    process.env.STORAGE_SECRET_ACCESS_KEY?.trim() ||
    ""
  const base = (
    process.env.STORAGE_BUCKETS_API_BASE?.trim() ||
    "https://api.geninfra.com.br/api/workspace/buckets"
  ).replace(/\/$/, "")
  const listFilesUrl =
    process.env.STORAGE_LIST_FILES_URL?.trim() || `${base}/connection/files`
  const createUploadUrlEndpoint =
    process.env.STORAGE_CREATE_UPLOAD_URL_ENDPOINT?.trim() ||
    `${base}/connection/files/upload-url`
  return { token, base, listFilesUrl, createUploadUrlEndpoint }
}

function authHeaders(token: string): Record<string, string> {
  if (!token) return {}
  return {
    Authorization: `Bearer ${token}`,
    "X-Connection-Token": token,
  }
}

function extractUploadUrl(data: JsonRecord | null): string | null {
  if (!data) return null
  if (typeof data.uploadUrl === "string") return data.uploadUrl
  if (typeof data.url === "string") return data.url
  const upload = data.upload as JsonRecord | undefined
  if (upload && typeof upload.url === "string") return upload.url
  return null
}

function extractUploadMethod(data: JsonRecord | null): string {
  if (!data) return "PUT"
  const upload = (data.upload as JsonRecord | undefined) ?? data
  const method = upload.method
  return typeof method === "string" && method ? method.toUpperCase() : "PUT"
}

function extractUploadHeaders(data: JsonRecord | null): Record<string, string> {
  const upload = (data?.upload as JsonRecord | undefined) ?? data
  const headers = upload?.headers
  if (!headers || typeof headers !== "object") return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers as JsonRecord)) {
    if (typeof v === "string") out[k] = v
  }
  return out
}

function extractDownloadUrl(data: JsonRecord | null): string | null {
  if (!data) return null
  const direct = data.downloadUrl ?? data.url
  if (typeof direct === "string") return direct
  const download = data.download as JsonRecord | undefined
  const nested = download?.url ?? download?.downloadUrl
  if (typeof nested === "string") return nested
  const inner = data.data as JsonRecord | undefined
  if (inner) {
    const fromInner =
      inner.downloadUrl ??
      inner.url ??
      (inner.download as JsonRecord | undefined)?.url
    if (typeof fromInner === "string") return fromInner
  }
  return null
}

function extractFileId(data: JsonRecord | null): string | null {
  if (!data) return null
  const file = data.file as JsonRecord | undefined
  if (file && typeof file.id === "string") return file.id
  if (typeof data.fileId === "string") return data.fileId
  if (typeof data.id === "string") return data.id
  return null
}

async function jsonSafe(res: Response): Promise<JsonRecord | null> {
  try {
    return (await res.clone().json()) as JsonRecord
  } catch {
    return null
  }
}

async function main() {
  const c = cfg()
  if (!c.token) {
    throw new Error("STORAGE_CONNECTION_TOKEN não configurado")
  }

  const fileName = `_http-flow-test-${Date.now()}.txt`
  const body = new TextEncoder().encode(`ok-${Date.now()}`)

  console.log("1) POST upload-url (URL curta + Bearer)")
  console.log("   ", c.createUploadUrlEndpoint)
  const uploadRes = await fetch(c.createUploadUrlEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(c.token),
    },
    body: JSON.stringify({
      fileName,
      contentType: "text/plain",
      sizeBytes: body.byteLength,
      path: "",
    }),
  })
  console.log("status:", uploadRes.status)
  const uploadJson = await jsonSafe(uploadRes)
  if (!uploadRes.ok || !uploadJson) {
    console.log("body:", (await uploadRes.text()).slice(0, 300))
    throw new Error("Falha no passo 1")
  }

  const uploadUrl = extractUploadUrl(uploadJson)
  if (!uploadUrl) throw new Error("Resposta sem upload.url")
  const uploadHeaders = extractUploadHeaders(uploadJson)
  if (!Object.keys(uploadHeaders).some((h) => h.toLowerCase() === "content-type")) {
    uploadHeaders["Content-Type"] = "text/plain"
  }

  console.log("2) PUT bytes na URL assinada")
  const putRes = await fetch(uploadUrl, {
    method: extractUploadMethod(uploadJson),
    headers: uploadHeaders,
    body,
  })
  console.log("status:", putRes.status)
  if (!putRes.ok) throw new Error("Falha no passo 2")

  console.log("3) GET list files")
  const listRes = await fetch(c.listFilesUrl, {
    headers: authHeaders(c.token),
  })
  console.log("status:", listRes.status)
  const listJson = await jsonSafe(listRes)
  if (!listRes.ok || !listJson) {
    console.log("body:", (await listRes.text()).slice(0, 300))
    throw new Error("Falha no passo 3")
  }

  const fileId = extractFileId(uploadJson)
  if (!fileId) {
    console.log("Sem fileId na resposta do upload-url; fluxo mínimo validado até listagem.")
    return
  }

  console.log("4) GET download-url")
  const downloadUrl = `${c.base}/connection/files/${fileId}/download-url`
  const res = await fetch(downloadUrl, { headers: authHeaders(c.token) })
  console.log(downloadUrl, "->", res.status)
  if (!res.ok) throw new Error("Falha no passo 4")
  const data = await jsonSafe(res)
  const dl = extractDownloadUrl(data)
  if (typeof dl !== "string" || !dl) {
    console.log("body bruto:", JSON.stringify(data)?.slice(0, 400))
    throw new Error("Resposta sem download URL")
  }
  console.log("download url:", dl)
  console.log("OK — fluxo completo validado")
}

main().catch((err) => {
  console.error("HTTP FLOW FAIL:", err instanceof Error ? err.message : err)
  process.exit(1)
})
