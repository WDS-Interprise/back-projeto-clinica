import { expandMedicineQueryTerms, matchMedicineAliases } from "../src/lib/medicine-aliases.js"
import { searchMedicamentos } from "../src/services/medicamentos.service.js"

const queries = [
  "cloridrato de tansulosina",
  "tansulosina",
  "tamsulosina",
  "omnic",
]

console.log("expand", expandMedicineQueryTerms("cloridrato de tansulosina"))
console.log(
  "aliases",
  matchMedicineAliases("cloridrato de tansulosina").map((a) => a.displayName)
)

for (const q of queries) {
  const r = await searchMedicamentos(q)
  console.log(q, {
    source: r.source,
    totalProducts: r.totalProducts,
    totalSubstances: r.totalSubstances,
    names: [...r.products, ...r.substances].slice(0, 5).map((x) => x.name),
  })
}
