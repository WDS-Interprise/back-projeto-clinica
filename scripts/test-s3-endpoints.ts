import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3"

const id = process.env.STORAGE_ACCESS_KEY_ID!
const sec = process.env.STORAGE_SECRET_ACCESS_KEY!
const bucket = process.env.STORAGE_BUCKET!

const endpoints = [
  "https://storage.geninfra.com.br",
  "https://s3.geninfra.com.br",
  "https://api.geninfra.com.br",
  "https://api.geninfra.com.br/storage",
]

async function main() {
  for (const endpoint of endpoints) {
    const client = new S3Client({
      endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: id, secretAccessKey: sec },
    })
    try {
      await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          MaxKeys: 1,
        })
      )
      console.log("OK", endpoint)
    } catch (err: unknown) {
      const e = err as { Code?: string; name?: string; message?: string }
      console.log("FAIL", endpoint, e.Code ?? e.name ?? e.message?.slice(0, 80))
    }
  }
}

void main()
