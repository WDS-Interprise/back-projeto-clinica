import prisma from "@/lib/prisma.js"
import { publicUrlForKey, storageConfig } from "@/lib/storage.js"

const IMAGE_EXTENSIONS = ["webp", "jpg", "jpeg", "png"] as const
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"])
const MAX_AVATAR_BYTES = 5 * 1024 * 1024

type JsonRecord = Record<string, unknown>

function mimeToExt(mimetype: string): string {
  if (mimetype === "image/png") return "png"
  if (mimetype === "image/webp") return "webp"
  return "jpg"
}

function avatarFileName(userId: string, ext: string) {
  return `${userId}.${ext}`
}

function bucketApiConfig() {
  const token = (
    process.env.STORAGE_CONNECTION_TOKEN?.trim() ||
    process.env.STORAGE_SECRET_ACCESS_KEY?.trim() ||
    ""
  ).trim()
  const base = (
    process.env.STORAGE_BUCKETS_API_BASE?.trim() ||
    "https://api.geninfra.com.br/api/workspace/buckets"
  ).replace(/\/$/, "")
  const listFilesUrl = (
    process.env.STORAGE_LIST_FILES_URL?.trim() || `${base}/connection/files`
  ).trim()
  const createUploadUrlEndpoint = (
    process.env.STORAGE_CREATE_UPLOAD_URL_ENDPOINT?.trim() ||
    `${base}/connection/files/upload-url`
  ).trim()
  return { token, base, listFilesUrl, createUploadUrlEndpoint }
}

function authHeaders(token: string): Record<string, string> {
  if (!token) return {}
  return {
    Authorization: `Bearer ${token}`,
    "X-Connection-Token": token,
  }
}

async function parseJsonSafe<T>(res: Response): Promise<T | null> {
  const contentType = res.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) return null
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function headOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4000) })
    return res.ok
  } catch {
    return false
  }
}

async function findAvatarInBucket(userId: string): Promise<string | null> {
  const { endpoint, bucket, prefix } = storageConfig()
  if (!endpoint || !bucket || !prefix) return null

  const candidates: string[] = []
  for (const ext of IMAGE_EXTENSIONS) {
    candidates.push(`${endpoint}/${bucket}/${prefix}/${userId}.${ext}`)
    candidates.push(`${endpoint}/${bucket}/${prefix}/avatar-${userId}.${ext}`)
    candidates.push(`${endpoint}/${bucket}/${prefix}/${userId}/avatar.${ext}`)
  }

  for (const url of candidates) {
    if (await headOk(url)) return url
  }
  return null
}

function extractUploadUrl(data: JsonRecord | null): string | null {
  if (!data) return null
  const direct = data.uploadUrl ?? data.url
  if (typeof direct === "string" && direct.trim()) return direct
  const upload = data.upload as JsonRecord | undefined
  const nested = upload?.url
  if (typeof nested === "string" && nested.trim()) return nested
  return null
}

function extractUploadHeaders(data: JsonRecord | null): Record<string, string> {
  if (!data) return {}
  const upload = (data.upload as JsonRecord | undefined) ?? data
  const raw = upload.headers
  if (!raw || typeof raw !== "object") return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as JsonRecord)) {
    if (typeof value === "string") out[key] = value
  }
  return out
}

function extractUploadMethod(data: JsonRecord | null): string {
  if (!data) return "PUT"
  const upload = (data.upload as JsonRecord | undefined) ?? data
  const method = upload.method
  if (typeof method === "string" && method.trim()) return method.toUpperCase()
  return "PUT"
}

function extractFileId(data: JsonRecord | null): string | null {
  if (!data) return null
  const nestedFile = data.file as JsonRecord | undefined
  const nestedId = nestedFile?.id
  if (typeof nestedId === "string" && nestedId.trim()) return nestedId
  const directId = data.fileId ?? data.id
  if (typeof directId === "string" && directId.trim()) return directId
  return null
}

function extractFileItems(data: JsonRecord | null): JsonRecord[] {
  if (!data) return []
  const found: JsonRecord[] = []
  const seenIds = new Set<string>()

  const maybeAdd = (item: JsonRecord) => {
    const id = itemId(item)
    const name = itemFileName(item)
    if (!id && !name) return
    const key = id ?? name ?? ""
    if (seenIds.has(key)) return
    seenIds.add(key)
    found.push(item)
  }

  const walk = (node: unknown, depth: number) => {
    if (depth > 5 || node == null) return
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === "object") maybeAdd(item as JsonRecord)
      }
      return
    }
    if (typeof node === "object") {
      const obj = node as JsonRecord
      if (itemId(obj) || itemFileName(obj)) maybeAdd(obj)
      for (const value of Object.values(obj)) walk(value, depth + 1)
    }
  }

  walk(data, 0)
  return found
}

function matchesAvatarSlug(fileName: string, userId: string): boolean {
  const normalized = fileName.trim().toLowerCase()
  const slug = userId.toLowerCase()
  for (const ext of IMAGE_EXTENSIONS) {
    const target = `${slug}.${ext}`
    if (normalized === target) return true
    if (normalized.endsWith(`-${target}`)) return true
    if (normalized.includes(target)) return true
  }
  return false
}

function itemPath(item: JsonRecord): string | null {
  const value = item.path ?? item.key ?? item.fullPath ?? item.objectKey
  return typeof value === "string" && value.trim() ? value : null
}

function itemFileName(item: JsonRecord): string | null {
  const value = item.fileName ?? item.originalName ?? item.name
  if (typeof value === "string" && value.trim()) return value
  const objectKey = item.objectKey
  if (typeof objectKey === "string" && objectKey.trim()) {
    return objectKey.split("/").pop() ?? null
  }
  return itemPath(item)?.split("/").pop() ?? null
}

function itemTimestamp(item: JsonRecord): number {
  const raw = item.updatedAt ?? item.createdAt
  if (typeof raw === "string" || typeof raw === "number") {
    const ts = new Date(raw).getTime()
    if (!Number.isNaN(ts)) return ts
  }
  return 0
}

async function findLatestAvatarFileId(userId: string): Promise<string | null> {
  let best: { id: string; at: number } | null = null
  for (const item of await listBucketFiles()) {
    const name = itemFileName(item)
    const id = itemId(item)
    if (!id || !name || !matchesAvatarSlug(name, userId)) continue
    const at = itemTimestamp(item)
    if (!best || at >= best.at) best = { id, at }
  }
  return best?.id ?? null
}

async function repairAvatarReference(userId: string): Promise<string | null> {
  const fileId = await findLatestAvatarFileId(userId)
  if (!fileId) return null
  const url = await getDownloadUrl(fileId)
  if (!url) return null
  await prisma.user.update({
    where: { id: userId },
    data: { profileImage: `geninfra-file:${fileId}` },
  })
  return url
}

function itemId(item: JsonRecord): string | null {
  const value = item.id ?? item.fileId
  return typeof value === "string" && value.trim() ? value : null
}

function isAvatarObjectName(fileName: string, userId: string): boolean {
  return matchesAvatarSlug(fileName, userId)
}

async function listBucketFiles(): Promise<JsonRecord[]> {
  const { token, listFilesUrl } = bucketApiConfig()
  if (!listFilesUrl || !token) return []
  try {
    const res = await fetch(listFilesUrl, {
      headers: authHeaders(token),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const data = await parseJsonSafe<JsonRecord>(res)
    return extractFileItems(data)
  } catch {
    return []
  }
}

async function deleteBucketFile(fileId: string): Promise<boolean> {
  const { token, base } = bucketApiConfig()
  if (!token || !fileId) return false
  const candidates = [
    `${base}/connection/files/${fileId}`,
    `${base}/connection/files/${encodeURIComponent(fileId)}`,
    `${base}/files/${fileId}`,
  ]
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: "DELETE",
        headers: authHeaders(token),
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok || res.status === 404 || res.status === 204) return true
    } catch {
      // try next candidate
    }
  }
  return false
}

function fileIdFromStored(stored: string | null | undefined): string | null {
  const value = stored?.trim()
  if (!value?.startsWith("geninfra-file:")) return null
  return value.slice("geninfra-file:".length) || null
}

async function removeExistingAvatarFiles(
  userId: string,
  targetFileName: string,
  storedProfileImage?: string | null
): Promise<void> {
  const idsToDelete = new Set<string>()

  const storedId = fileIdFromStored(storedProfileImage)
  if (storedId) idsToDelete.add(storedId)

  const items = await listBucketFiles()
  for (const item of items) {
    const fileName = itemFileName(item)
    const id = itemId(item)
    if (!id || !fileName) continue
    if (fileName === targetFileName || matchesAvatarSlug(fileName, userId)) {
      idsToDelete.add(id)
    }
  }

  for (const id of idsToDelete) {
    await deleteBucketFile(id)
  }
}

async function resolveDownloadUrlWithRetry(fileId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const url = await getDownloadUrl(fileId)
    if (url) return url
    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)))
  }
  return null
}

async function findFileIdByFileName(fileName: string, userId?: string): Promise<string | null> {
  const { token, listFilesUrl } = bucketApiConfig()
  if (!listFilesUrl) return null
  try {
    const url = new URL(listFilesUrl)
    const res = await fetch(url.toString(), {
      headers: authHeaders(token),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await parseJsonSafe<JsonRecord>(res)
    for (const item of extractFileItems(data)) {
      const name = itemFileName(item)
      if (!name) continue
      if (name === fileName || (userId && matchesAvatarSlug(name, userId))) {
        return itemId(item)
      }
    }
    return null
  } catch {
    return null
  }
}

function extractDownloadUrl(data: JsonRecord | null): string | null {
  if (!data) return null
  const direct = data.downloadUrl ?? data.url
  if (typeof direct === "string" && direct.trim()) return direct
  const download = data.download as JsonRecord | undefined
  const nested = download?.url ?? download?.downloadUrl
  if (typeof nested === "string" && nested.trim()) return nested
  const inner = data.data as JsonRecord | undefined
  if (inner) {
    const fromInner =
      inner.downloadUrl ??
      inner.url ??
      (inner.download as JsonRecord | undefined)?.url ??
      (inner.download as JsonRecord | undefined)?.downloadUrl
    if (typeof fromInner === "string" && fromInner.trim()) return fromInner
  }
  return null
}

async function getDownloadUrl(fileId: string): Promise<string | null> {
  const cfg = bucketApiConfig()
  if (!cfg.token) return null
  const template = process.env.STORAGE_DOWNLOAD_URL_TEMPLATE?.trim()
  const customUrl = template
    ? template.replace("{fileId}", encodeURIComponent(fileId))
    : ""
  const candidates = [
    customUrl,
    `${cfg.base}/connection/files/${fileId}/download-url`,
    `${cfg.base}/files/${fileId}/download-url`,
  ].filter(Boolean)

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: authHeaders(cfg.token),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) continue
      const contentType = res.headers.get("content-type") ?? ""
      if (!contentType.includes("application/json")) {
        const raw = (await res.text()).trim()
        if (raw.startsWith("http")) return raw
        continue
      }
      const data = (await res.json()) as JsonRecord
      const downloadUrl = extractDownloadUrl(data)
      if (downloadUrl) return downloadUrl
    } catch {
      // try next candidate
    }
  }
  return null
}

function urlFromStoredKey(stored: string): string | null {
  if (stored.startsWith("geninfra-file:")) return null
  if (stored.startsWith("geninfra-path:")) return null
  if (/^https?:\/\//i.test(stored)) return stored
  if (stored.startsWith("local:")) return null
  return publicUrlForKey(stored)
}

export async function resolveUserAvatarUrl(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profileImage: true },
  })
  if (!user) return null

  const stored = user.profileImage?.trim()
  if (stored) {
    if (stored.startsWith("geninfra-file:")) {
      const fileId = stored.slice("geninfra-file:".length)
      const url = await getDownloadUrl(fileId)
      if (url) return url
    } else if (stored.startsWith("geninfra-path:")) {
      const fileName = stored.slice("geninfra-path:".length)
      const fileId = await findFileIdByFileName(fileName, userId)
      if (fileId) {
        const url = await getDownloadUrl(fileId)
        if (url) {
          await prisma.user.update({
            where: { id: userId },
            data: { profileImage: `geninfra-file:${fileId}` },
          })
          return url
        }
      }
    } else {
      const url = urlFromStoredKey(stored)
      if (url) return url
    }
  }

  const repaired = await repairAvatarReference(userId)
  if (repaired) return repaired

  return findAvatarInBucket(userId)
}

async function createUploadUrl(params: {
  fileName: string
  contentType: string
  sizeBytes: number
  path?: string
}): Promise<JsonRecord> {
  const cfg = bucketApiConfig()
  if (!cfg.createUploadUrlEndpoint || !cfg.token) {
    throw new Error("STORAGE_NOT_CONFIGURED")
  }

  const res = await fetch(cfg.createUploadUrlEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(cfg.token),
    },
    body: JSON.stringify({
      fileName: params.fileName,
      contentType: params.contentType,
      sizeBytes: params.sizeBytes,
      path: params.path ?? "",
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200).replace(/\s+/g, " ")
    const err = new Error("GENINFRA_UPLOAD_URL_FAILED") as Error & { status?: number; detail?: string }
    err.status = res.status
    err.detail = detail
    throw err
  }
  const data = await parseJsonSafe<JsonRecord>(res)
  if (!data) throw new Error("GENINFRA_UPLOAD_URL_FAILED")
  return data
}

export async function uploadUserAvatar(
  userId: string,
  buffer: Buffer,
  mimetype: string
): Promise<string | null> {
  if (!ALLOWED_MIME.has(mimetype)) throw new Error("INVALID_FILE_TYPE")
  if (buffer.length === 0) throw new Error("INVALID_FILE")
  if (buffer.length > MAX_AVATAR_BYTES) throw new Error("FILE_TOO_LARGE")

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profileImage: true },
  })

  const ext = mimeToExt(mimetype)
  const fileName = avatarFileName(userId, ext)

  await removeExistingAvatarFiles(userId, fileName, user?.profileImage)

  const uploadPayload = await createUploadUrl({
    fileName,
    contentType: mimetype,
    sizeBytes: buffer.length,
    path: "",
  })
  const uploadUrl = extractUploadUrl(uploadPayload)
  if (!uploadUrl) throw new Error("GENINFRA_UPLOAD_URL_FAILED")

  const uploadHeaders = extractUploadHeaders(uploadPayload)
  if (!Object.keys(uploadHeaders).some((key) => key.toLowerCase() === "content-type")) {
    uploadHeaders["Content-Type"] = mimetype
  }

  const uploadRes = await fetch(uploadUrl, {
    method: extractUploadMethod(uploadPayload),
    headers: uploadHeaders,
    body: new Uint8Array(buffer),
    signal: AbortSignal.timeout(20000),
  })
  if (!uploadRes.ok) {
    throw new Error("GENINFRA_UPLOAD_PUT_FAILED")
  }

  const fileId =
    extractFileId(uploadPayload) ??
    (await findFileIdByFileName(fileName, userId)) ??
    (await findLatestAvatarFileId(userId))

  if (!fileId) throw new Error("GENINFRA_UPLOAD_URL_FAILED")

  const storedRef = `geninfra-file:${fileId}`

  await prisma.user.update({
    where: { id: userId },
    data: { profileImage: storedRef },
  })

  const url = await resolveDownloadUrlWithRetry(fileId)
  if (url) return url

  return repairAvatarReference(userId)
}
