import { config } from "dotenv"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, "../../.env") })

export const JWT_SECRET = process.env.JWT_SECRET || "clinicare-dev-secret"
export const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d"
export const PORT = Number(process.env.PORT) || 3001
