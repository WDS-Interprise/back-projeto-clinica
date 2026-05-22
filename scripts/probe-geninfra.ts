const API = "https://api.geninfra.com.br"
const CONN =
  process.env.STORAGE_CONNECTION_TOKEN ??
  process.env.STORAGE_SECRET_ACCESS_KEY ??
  ""
const WK = process.env.STORAGE_ACCESS_KEY_ID ?? ""
const PREFIX =
  process.env.STORAGE_AVATAR_PREFIX ??
  "users/a6cca607-6403-4dd2-8c64-8fd51ca30e2f/buckets/clinica-imagem"

async function probe(label: string, url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init)
    const text = await res.text()
    console.log(
      label,
      res.status,
      text.slice(0, 240).replace(/\s+/g, " ")
    )
  } catch (err) {
    console.log(label, "ERR", err instanceof Error ? err.message : err)
  }
}

async function main() {
  const authVariants: Record<string, string>[] = [
    { Authorization: `Bearer ${CONN}` },
    { Authorization: `Bearer ${WK}` },
    { "X-Api-Key": CONN },
    { "X-Access-Key-Id": WK, "X-Secret-Access-Key": CONN },
  ]

  const paths = [
    `/api/workspace/buckets/connection/${CONN}/files`,
    `/api/workspace/buckets/connection/${CONN}/files/upload-url`,
    `/api/workspace/buckets/connection/${CONN}/upload-url`,
    `/api/v1/workspace/buckets/connection/${CONN}/files/upload-url`,
    `/api/buckets/${CONN}/files/upload-url`,
  ]

  for (const path of paths) {
    for (const auth of authVariants) {
      await probe(
        `GET ${path}`,
        `${API}${path}`,
        { method: "GET", headers: auth }
      )
      await probe(
        `POST ${path}`,
        `${API}${path}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...auth },
          body: JSON.stringify({
            key: `${PREFIX}/probe.txt`,
            path: `${PREFIX}/probe.txt`,
            filename: "probe.txt",
            contentType: "text/plain",
          }),
        }
      )
    }
  }
}

void main()
