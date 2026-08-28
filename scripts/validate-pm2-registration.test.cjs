const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { after, describe, it } = require("node:test")
const {
  assertPermanentNvmNode,
  resolvePermanentNvmNode,
} = require("./permanent-node.cjs")
const { validatePm2Registration } = require("./validate-pm2-registration.cjs")

const TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "clinmax-pm2-"))
const NVM_NODE = path.join(
  TEMP_ROOT,
  ".nvm",
  "versions",
  "node",
  "v24.15.0",
  "bin",
  "node"
)
const OTHER_NVM_NODE = path.join(
  TEMP_ROOT,
  ".nvm",
  "versions",
  "node",
  "v24.16.0",
  "bin",
  "node"
)
const APP_DIR = path.join(TEMP_ROOT, "clinmax-api")

for (const nodeBin of [NVM_NODE, OTHER_NVM_NODE]) {
  fs.mkdirSync(path.dirname(nodeBin), { recursive: true })
  fs.writeFileSync(nodeBin, "")
  fs.chmodSync(nodeBin, 0o755)
}

after(() => {
  fs.rmSync(TEMP_ROOT, { recursive: true, force: true })
})

function pm2Process(overrides = {}) {
  const { pm2_env: pm2EnvOverrides = {}, ...processOverrides } = overrides
  return {
    name: "clinmax-api",
    pid: 1234,
    pm2_env: {
      exec_interpreter: NVM_NODE,
      pm_exec_path: path.join(APP_DIR, "dist", "index.js"),
      pm_cwd: APP_DIR,
      status: "online",
      restart_time: 0,
      ...pm2EnvOverrides,
    },
    ...processOverrides,
  }
}

describe("contrato do Node permanente", () => {
  it("resolve CLINMAX_NODE_BIN quando aponta para o nvm", () => {
    assert.equal(
      resolvePermanentNvmNode({
        env: { CLINMAX_NODE_BIN: NVM_NODE },
        execPath: path.join(TEMP_ROOT, "node"),
      }),
      path.resolve(NVM_NODE)
    )
  })

  it("usa process.execPath quando o PM2 ja roda pelo nvm", () => {
    assert.equal(
      resolvePermanentNvmNode({ env: {}, execPath: NVM_NODE }),
      path.resolve(NVM_NODE)
    )
  })

  it("aplica o mesmo Node permanente no ecosystem do PM2", () => {
    const ecosystemPath = require.resolve("../deploy/ecosystem.config.cjs")
    const previousNodeBin = process.env.CLINMAX_NODE_BIN
    const previousAppDir = process.env.CLINMAX_API_DIR

    try {
      process.env.CLINMAX_NODE_BIN = NVM_NODE
      process.env.CLINMAX_API_DIR = APP_DIR
      delete require.cache[ecosystemPath]

      const ecosystem = require(ecosystemPath)
      assert.equal(ecosystem.apps[0].interpreter, path.resolve(NVM_NODE))
      assert.equal(ecosystem.apps[0].cwd, APP_DIR)
      assert.equal(ecosystem.apps[0].script, "dist/index.js")
    } finally {
      if (previousNodeBin === undefined) delete process.env.CLINMAX_NODE_BIN
      else process.env.CLINMAX_NODE_BIN = previousNodeBin
      if (previousAppDir === undefined) delete process.env.CLINMAX_API_DIR
      else process.env.CLINMAX_API_DIR = previousAppDir
      delete require.cache[ecosystemPath]
    }
  })

  it("rejeita a palavra node sem caminho absoluto", () => {
    assert.throws(() => assertPermanentNvmNode("node"), /caminho absoluto/)
  })

  it("rejeita caminho temporario em run user", () => {
    const transientNode = path.join(
      path.parse(TEMP_ROOT).root,
      "run",
      "user",
      "0",
      ".nvm",
      "versions",
      "node",
      "v24.15.0",
      "bin",
      "node"
    )
    assert.throws(() => assertPermanentNvmNode(transientNode), /temporario/)
  })
})

describe("validacao do registro PM2", () => {
  it("aceita processo real com Node permanente do nvm e dist", () => {
    const result = validatePm2Registration([pm2Process()], NVM_NODE, APP_DIR)
    assert.match(result, /PM2 validado/)
  })

  it("rejeita lista sem o processo clinmax-api", () => {
    assert.throws(() => validatePm2Registration([], NVM_NODE, APP_DIR), /nao registrou/)
  })

  it("rejeita interpreter temporario do fnm", () => {
    const fnmNode = path.join(
      path.parse(TEMP_ROOT).root,
      "run",
      "user",
      "0",
      "fnm_multishells",
      "123",
      "bin",
      "node"
    )
    assert.throws(
      () =>
        validatePm2Registration(
          [pm2Process({ pm2_env: { exec_interpreter: fnmNode } })],
          fnmNode,
          APP_DIR
        ),
      /temporario/
    )
  })

  it("rejeita interpreter nvm diferente do esperado", () => {
    assert.throws(
      () =>
        validatePm2Registration(
          [pm2Process({ pm2_env: { exec_interpreter: OTHER_NVM_NODE } })],
          NVM_NODE,
          APP_DIR
        ),
      /Interpreter incorreto/
    )
  })

  it("rejeita app zumbi sem PID", () => {
    assert.throws(
      () => validatePm2Registration([pm2Process({ pid: 0 })], NVM_NODE, APP_DIR),
      /sem PID real/
    )
  })

  it("rejeita processo fora do status online", () => {
    assert.throws(
      () =>
        validatePm2Registration(
          [pm2Process({ pm2_env: { status: "stopped" } })],
          NVM_NODE,
          APP_DIR
        ),
      /fora do ar/
    )
  })

  it("rejeita cwd diferente do diretorio publicado", () => {
    assert.throws(
      () =>
        validatePm2Registration(
          [pm2Process({ pm2_env: { pm_cwd: path.join(TEMP_ROOT, "outro-app") } })],
          NVM_NODE,
          APP_DIR
        ),
      /Diretorio incorreto/
    )
  })

  it("rejeita execucao por tsx ou source TypeScript", () => {
    assert.throws(
      () =>
        validatePm2Registration(
          [pm2Process({ pm2_env: { pm_exec_path: path.join(APP_DIR, "src", "index.ts") } })],
          NVM_NODE,
          APP_DIR
        ),
      /Script incorreto|tsx|src/
    )
  })

  it("rejeita interpreter_args com tsx mesmo com script dist", () => {
    assert.throws(
      () =>
        validatePm2Registration(
          [
            pm2Process({
              pm2_env: {
                node_args: "--import tsx --env-file=.env",
              },
            }),
          ],
          NVM_NODE,
          APP_DIR
        ),
      /tsx/
    )
  })

  it("rejeita processo que reiniciou depois do reset do deploy", () => {
    assert.throws(
      () =>
        validatePm2Registration(
          [pm2Process({ pm2_env: { restart_time: 1 } })],
          NVM_NODE,
          APP_DIR
        ),
      /reiniciou 1/
    )
  })

  it("valida o registro persistido pelo pm2 save", () => {
    const savedProcess = {
      name: "clinmax-api",
      exec_interpreter: NVM_NODE,
      pm_exec_path: path.join(APP_DIR, "dist", "index.js"),
      pm_cwd: APP_DIR,
    }
    const result = validatePm2Registration([savedProcess], NVM_NODE, APP_DIR, {
      requireRuntime: false,
    })
    assert.match(result, /PM2 validado/)
  })
})
