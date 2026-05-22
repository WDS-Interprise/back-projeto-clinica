import { ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

async function main() {
  const client = new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
    },
  })

  const prefix = process.env.STORAGE_AVATAR_PREFIX!
  const bucket = process.env.STORAGE_BUCKET!

  console.log("Listing...", { bucket, prefix })
  const list = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 5 })
  )
  console.log("List OK, objects:", list.Contents?.length ?? 0)

  const key = `${prefix}/_connectivity-test.txt`
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: "ok",
      ContentType: "text/plain",
    })
  )
  console.log("Put OK", key)
}

main().catch((err) => {
  console.error("FAIL", err.Code ?? err.name ?? err.message)
  process.exit(1)
})
