/** PM2 na VPS — caminho padrão ~/clinmax-api */
module.exports = {
  apps: [
    {
      name: "clinmax-api",
      cwd: process.env.CLINMAX_API_DIR || `${process.env.HOME}/clinmax-api`,
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
}
