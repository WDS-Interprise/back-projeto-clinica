const tests = ["Sepurin", "metenamina", "cloreto de metiltionínio"]

async function bulapi(q: string) {
  try {
    const r = await fetch(`https://bulapi.com.br/api/v1/search?q=${encodeURIComponent(q)}`)
    const text = await r.text()
    if (!text.startsWith("{")) return { status: r.status, error: "non-json", preview: text.slice(0, 80) }
    const j = JSON.parse(text) as {
      data?: {
        products?: Array<{ id: number; name: string; substance?: { name: string } }>
        substances?: Array<{ id: number; name: string }>
      }
    }
    const d = j.data ?? {}
    return {
      status: r.status,
      products: d.products?.length ?? 0,
      substances: d.substances?.slice(0, 3),
      productNames: d.products?.slice(0, 3).map((p) => p.name),
    }
  } catch (e) {
    return { error: String(e) }
  }
}

async function anvisaNome(q: string) {
  try {
    const u = `https://consultas.anvisa.gov.br/api/consulta/bulario?count=5&page=1&filter[nomeProduto]=${encodeURIComponent(q)}`
    const r = await fetch(u, {
      headers: {
        Accept: "application/json",
        Authorization: "Guest",
        Referer: "https://consultas.anvisa.gov.br/",
      },
    })
    const text = await r.text()
    if (!text.startsWith("{")) return { status: r.status, error: "non-json", preview: text.slice(0, 80) }
    const j = JSON.parse(text) as {
      totalElements?: number
      content?: Array<{ nomeProduto?: string; principioAtivo?: string }>
    }
    return {
      status: r.status,
      total: j.totalElements,
      items: j.content?.slice(0, 2).map((i) => ({ nome: i.nomeProduto, pa: i.principioAtivo })),
    }
  } catch (e) {
    return { error: String(e) }
  }
}

async function anvisaPA(q: string) {
  try {
    const u = `https://consultas.anvisa.gov.br/api/consulta/bulario?count=5&page=1&filter[principioAtivo]=${encodeURIComponent(q)}`
    const r = await fetch(u, {
      headers: {
        Accept: "application/json",
        Authorization: "Guest",
        Referer: "https://consultas.anvisa.gov.br/",
      },
    })
    const text = await r.text()
    if (!text.startsWith("{")) return { status: r.status, error: "non-json", preview: text.slice(0, 80) }
    const j = JSON.parse(text) as {
      totalElements?: number
      content?: Array<{ nomeProduto?: string; principioAtivo?: string }>
    }
    return {
      status: r.status,
      total: j.totalElements,
      items: j.content?.slice(0, 2).map((i) => ({ nome: i.nomeProduto, pa: i.principioAtivo })),
    }
  } catch (e) {
    return { error: String(e) }
  }
}

async function cr(slug: string) {
  const r = await fetch(`https://consultaremedios.com.br/${slug}/bula/profissional`, {
    headers: { Accept: "text/html" },
  })
  const text = r.ok ? await r.text() : ""
  return { slug, status: r.status, ok: r.ok, hasLeaflet: text.includes("leaflet-section") }
}

async function main() {
  for (const q of tests) {
    console.log(`\n=== ${q} ===`)
    console.log("bulapi", JSON.stringify(await bulapi(q), null, 0))
    console.log("anvisa nome", JSON.stringify(await anvisaNome(q), null, 0))
    console.log("anvisa pa", JSON.stringify(await anvisaPA(q), null, 0))
  }

  console.log("\n=== Consulta Remédios slugs ===")
  for (const slug of ["sepurin", "metenamina", "cloreto-de-metiltioninio", "cloreto-de-metiltioninio-20mg"]) {
    console.log(JSON.stringify(await cr(slug)))
  }

  const { searchMedicinesPaginated } = await import("../src/services/bulas.service.js")
  for (const q of tests) {
    const res = await searchMedicinesPaginated({ q, page: 1, limit: 20 })
    console.log(`\nbulas.service ${q}:`, {
      source: res.source,
      total: res.total,
      items: res.items.slice(0, 3).map((i) => i.name),
    })
  }

  const { searchMedicamentos } = await import("../src/services/medicamentos.service.js")
  for (const q of tests) {
    const res = await searchMedicamentos(q)
    console.log(`medicamentos.service ${q}:`, {
      source: res.source,
      totalProducts: res.totalProducts,
      products: res.products.slice(0, 3).map((p) => p.name),
      substances: res.substances.slice(0, 3).map((s) => s.name),
    })
  }
}

main().catch(console.error)
