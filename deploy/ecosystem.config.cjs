/** PM2 na VPS: caminho padrao ~/clinmax-api.
 * O interpreter precisa ser o Node permanente instalado pelo nvm.
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
