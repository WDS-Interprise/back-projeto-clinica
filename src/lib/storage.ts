import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

export function storageConfig() {
  const endpoint = process.env.STORAGE_ENDPOINT?.replace(/\/$/, "")
  const bucket = process.env.STORAGE_BUCKET?.trim()
  const prefix = process.env.STORAGE_AVATAR_PREFIX?.replace(/^\/|\/$/g, "")
  const publicBase = process.env.STORAGE_PUBLIC_BASE_URL?.replace(/\/$/, "")
  const accessKeyId =
    process.env.STORAGE_ACCESS_KEY_ID?.trim() || process.env.STORAGE_ACCESS_KEY?.trim()
  const secretAccessKey =
    process.env.STORAGE_SECRET_ACCESS_KEY?.trim() || process.env.STORAGE_SECRET_KEY?.trim()
  const region = process.env.STORAGE_REGION?.trim() || "us-east-1"
  return { endpoint, bucket, prefix, publicBase, accessKeyId, secretAccessKey, region }
}

export function isStorageUploadConfigured() {
  const { endpoint, bucket, prefix, accessKeyId, secretAccessKey } = storageConfig()
  return Boolean(endpoint && bucket && prefix && accessKeyId && secretAccessKey)
}

function createS3Client() {
  const { endpoint, accessKeyId, secretAccessKey, region } = storageConfig()
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("STORAGE_NOT_CONFIGURED")
  }
  return new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  })
}

export async function uploadObject(params: {
  key: string
  body: Buffer
  contentType: string
}) {
  const { bucket } = storageConfig()
  if (!bucket) throw new Error("STORAGE_NOT_CONFIGURED")

  const client = createS3Client()
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    })
  )
}

export function publicUrlForKey(key: string): string | null {
  const { publicBase, endpoint, bucket } = storageConfig()
  const normalized = key.replace(/^\//, "")
  if (publicBase) return `${publicBase}/${normalized}`
  if (endpoint && bucket) return `${endpoint}/${bucket}/${normalized}`
  return null
}
