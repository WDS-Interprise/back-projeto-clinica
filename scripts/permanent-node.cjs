const fs = require("node:fs")
const path = require("node:path")

function normalizedPath(value) {
  return path.resolve(String(value || "")).replace(/\\/g, "/")
}

function assertPermanentNvmNode(nodeBin, { checkExecutable = true } = {}) {
  if (!nodeBin || !path.isAbsolute(nodeBin)) {
    throw new Error(`Node do PM2 precisa ter caminho absoluto: ${nodeBin || "(vazio)"}`)
  }

  const normalized = normalizedPath(nodeBin)
  if (normalized.includes("fnm_multishells") || normalized.includes("/run/user/")) {
    throw new Error(`Node temporario nao pode ser usado pelo PM2: ${nodeBin}`)
  }

  if (!/\/\.nvm\/versions\/node\/[^/]+\/bin\/node$/.test(normalized)) {
    throw new Error(`Node do PM2 precisa estar instalado pelo nvm: ${nodeBin}`)
  }

  if (checkExecutable) {
    try {
      fs.accessSync(nodeBin, fs.constants.X_OK)
    } catch {
      throw new Error(`Node permanente nao existe ou nao e executavel: ${nodeBin}`)
    }
  }

  return path.resolve(nodeBin)
}

function resolvePermanentNvmNode({
  env = process.env,
  execPath = process.execPath,
} = {}) {
  const candidates = [env.CLINMAX_NODE_BIN, env.CLINMAX_NVM_NODE, execPath].filter(Boolean)
  const failures = []

  for (const candidate of candidates) {
    try {
      return assertPermanentNvmNode(candidate)
    } catch (error) {
      failures.push(error.message)
    }
  }

  const details = failures.length > 0 ? ` Detalhes: ${failures.join("; ")}` : ""
  throw new Error(
    `clinmax-api: Node permanente do nvm nao encontrado. Defina CLINMAX_NODE_BIN com o caminho completo.${details}`
  )
}

module.exports = {
  assertPermanentNvmNode,
  normalizedPath,
  resolvePermanentNvmNode,
}
