import puppeteer, { type Browser } from "puppeteer"

let browserInstance: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (browserInstance?.connected) return browserInstance
  browserInstance = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })
  return browserInstance
}

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: "load" })
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
      preferCSSPageSize: true,
    })
    return Buffer.from(pdf)
  } finally {
    await page.close()
  }
}
