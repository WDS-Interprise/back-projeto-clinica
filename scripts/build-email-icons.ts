import { mkdirSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import puppeteer from "puppeteer"

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../assets/email/icons")

/** Fundo opaco evita quadrado preto/cinza no Gmail. */
const ICON_BG: Record<string, string> = {
  invite: "#E3F6EC",
  shield: "#F6FBF8",
  lock: "#F6FBF8",
  headset: "#F6FBF8",
  clock: "#F3FAF7",
  copy: "#FFFFFF",
}

const ICONS: Record<string, string> = {
  invite: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none"><rect x="4" y="6" width="16" height="12" rx="2" stroke="#008A5B" stroke-width="1.6"/><path d="M4 8l8 5 8-5" stroke="#008A5B" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="12" r="2.2" fill="#008A5B"/></svg>`,
  shield: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" stroke="#008A5B" stroke-width="1.6"/><path d="M9.5 12l1.8 1.8L15 10.2" stroke="#008A5B" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  lock: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none"><rect x="6.5" y="10" width="11" height="9" rx="2" stroke="#008A5B" stroke-width="1.6"/><path d="M8.5 10V8a3.5 3.5 0 0 1 7 0v2" stroke="#008A5B" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  headset: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none"><path d="M5 13v-1a7 7 0 0 1 14 0v1" stroke="#008A5B" stroke-width="1.6" stroke-linecap="round"/><rect x="4" y="13" width="3.5" height="6" rx="1.5" stroke="#008A5B" stroke-width="1.6"/><rect x="16.5" y="13" width="3.5" height="6" rx="1.5" stroke="#008A5B" stroke-width="1.6"/><path d="M7.5 19h2.5a2 2 0 0 0 4 0H16.5" stroke="#008A5B" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  clock: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="#69756F" stroke-width="1.6"/><path d="M12 8v4.2l2.6 1.6" stroke="#69756F" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  copy: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="10" height="10" rx="1.8" stroke="#008A5B" stroke-width="1.6"/><rect x="6" y="6" width="10" height="10" rx="1.8" stroke="#008A5B" stroke-width="1.6"/></svg>`,
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  await page.setViewport({ width: 48, height: 48, deviceScaleFactor: 2 })

  for (const [name, svg] of Object.entries(ICONS)) {
    const bg = ICON_BG[name] ?? "#FFFFFF"
    await page.setContent(
      `<html><body style="margin:0;background:${bg};display:flex;align-items:center;justify-content:center;width:48px;height:48px">${svg}</body></html>`,
      { waitUntil: "domcontentloaded" }
    )
    const png = await page.screenshot({ omitBackground: false, type: "png" })
    writeFileSync(resolve(OUT_DIR, `${name}.png`), png)
    console.log(`Gerado ${name}.png (${png.length} bytes)`)
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
