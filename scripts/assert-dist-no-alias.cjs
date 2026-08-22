const fs = require("fs")
const path = require("path")

const distDir = path.join(__dirname, "..", "dist")
const aliasRe = /from\s+["']@\//
const hits = []

function walk(dir) {
  if (!fs.existsSync(dir)) {
    console.error("dist/ nao existe. Rode tsc + tsc-alias antes deste check.")
    process.exit(1)
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
      continue
    }
    if (!entry.name.endsWith(".js")) continue
    const text = fs.readFileSync(full, "utf8")
    if (aliasRe.test(text)) {
      hits.push(path.relative(distDir, full).replace(/\\/g, "/"))
    }
  }
}

walk(distDir)

if (hits.length > 0) {
  console.error("dist ainda contem imports @/. O Node nao resolve isso em runtime.")
  for (const file of hits) console.error(`  ${file}`)
  process.exit(1)
}

console.log("dist ok: nenhum import @/ restante.")
