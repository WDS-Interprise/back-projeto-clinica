import { readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import puppeteer from "puppeteer"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const SRC = resolve(ROOT, "assets/email/invite-hero-source.png")
const OUT = resolve(ROOT, "assets/email/invite-hero-email.png")
const MAX_WIDTH = 280
const BG = "#FFFFFF"

/** Só redimensiona a arte original e achata transparência em branco (sem remapear pixels). */
async function main() {
  const srcBase64 = readFileSync(SRC).toString("base64")
  const dataSrc = `data:image/png;base64,${srcBase64}`

  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()

  await page.setContent(
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:${BG};">
  <canvas id="c"></canvas>
  <script>
    const img = new Image();
    img.onload = () => {
      const maxW = ${MAX_WIDTH};
      const ratio = maxW / img.width;
      const w = maxW;
      const h = Math.round(img.height * ratio);
      const canvas = document.getElementById("c");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "${BG}";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      window.__done = canvas.toDataURL("image/png");
    };
    img.onerror = () => { window.__error = true; };
    img.src = ${JSON.stringify(dataSrc)};
  </script>
</body>
</html>`,
    { waitUntil: "domcontentloaded" }
  )

  await page.waitForFunction("window.__done || window.__error", { timeout: 60000 })
  const error = await page.evaluate(() => (window as { __error?: boolean }).__error)
  if (error) throw new Error("Falha ao carregar invite-hero-source.png")

  const dataUrl = await page.evaluate(() => (window as { __done?: string }).__done)
  if (!dataUrl?.startsWith("data:image/png;base64,")) {
    throw new Error("Export PNG inválido")
  }

  const buffer = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64")
  writeFileSync(OUT, buffer)
  console.log(`Gerado ${OUT} (${buffer.length} bytes, largura ${MAX_WIDTH}px)`)

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
