/** PM2 na VPS: caminho padrao ~/clinmax-api.
 * CONTRATO: interpreter = Node permanente do nvm (scripts/permanent-node.cjs).
 * PROIBIDO remover interpreter ou env_file — sem isso o PM2 sobe Node temporario (fnm)
 * ou sem DATABASE_URL/JWT e a API cai (502). Ver deploy/README.md.
 */
const { resolvePermanentNvmNode } = require("../scripts/permanent-node.cjs")

module.exports = {
  apps: [
    {
      name: "clinmax-api",
      cwd: process.env.CLINMAX_API_DIR || `${process.env.HOME}/clinmax-api`,
      script: "dist/index.js",
      interpreter: resolvePermanentNvmNode(),
      env_file: ".env",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
}
