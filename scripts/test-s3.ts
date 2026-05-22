import { ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

const endpoint = "https://storage.geninfra.com.br"
const bucket = "mwr-user-files"
const prefix =
  process.env.STORAGE_AVATAR_PREFIX ??
  "users/a6cca607-6403-4dd2-8c64-8fd51ca30e2f/buckets/clinica-imagem"

const wk = process.env.STORAGE_ACCESS_KEY_ID ?? ""
const bkt = process.env.STORAGE_SECRET_ACCESS_KEY ?? ""
const bktShort = bkt.split(".")[0] ?? bkt

const variants: { label: string; accessKeyId: string; secretAccessKey: string }[] = [
  { label: "wk + bkt-full", accessKeyId: wk, secretAccessKey: bkt },
  { label: "bkt-full + wk", accessKeyId: bkt, secretAccessKey: wk },
  { label: "bkt-short + bkt-full", accessKeyId: bktShort, secretAccessKey: bkt },
  { label: "wk + bkt-short", accessKeyId: wk, secretAccessKey: bktShort },
  { label: "bkt-full + bkt-full", accessKeyId: bkt, secretAccessKey: bkt },
]

async function tryVariant(label: string, accessKeyId: string, secretAccessKey: string) {
  const client = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })
  const key = `${prefix}/_credential-test.txt`
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: "ok",
        ContentType: "text/plain",
      })
    )
    console.log("OK", label)
    return true
  } catch (err: unknown) {
    const code = (err as { Code?: string; name?: string }).Code ?? (err as Error).name
    console.log("FAIL", label, code)
    return false
  }
}

async function main() {
  for (const v of variants) {
    const ok = await tryVariant(v.label, v.accessKeyId, v.secretAccessKey)
    if (ok) return
  }
  console.log("\nNenhuma combinação funcionou. Gere novas chaves no painel GenInfra.")
}

void main()
