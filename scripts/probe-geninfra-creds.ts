const conn = process.env.STORAGE_CONNECTION_TOKEN ?? ""
const wk = process.env.STORAGE_ACCESS_KEY_ID ?? ""
const prefix = process.env.STORAGE_AVATAR_PREFIX ?? ""

const bases = [
  "https://api.geninfra.com.br",
  "https://storage.geninfra.com.br",
]

const paths = [
  `/api/workspace/buckets/connection/${conn}/files/upload-url`,
  `/api/workspace/buckets/connection/${conn}/credentials`,
  `/api/workspace/buckets/connection/${conn}/s3/sts`,
  `/api/v1/storage/credentials`,
  `/api/v1/workspace/buckets/connection/${conn}/files/upload-url`,
]

async function main() {
  for (const base of bases) {
    for (const path of paths) {
      for (const auth of [
        { Authorization: `Bearer ${conn}` },
        { Authorization: `Bearer ${wk}`, "X-Connection-Token": conn },
      ]) {
        try {
          const res = await fetch(`${base}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...auth },
            body: JSON.stringify({
              key: "test.jpg",
              path: `${prefix}/test.jpg`,
              contentType: "image/jpeg",
            }),
          })
          if (res.status !== 404) {
            console.log(`${base}${path}`, res.status, (await res.text()).slice(0, 200))
          }
        } catch (err) {
          console.log(`${base}${path}`, "ERR", err instanceof Error ? err.message : err)
        }
      }
    }
  }
}

void main()
