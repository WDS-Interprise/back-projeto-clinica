import { runSubscriptionLifecycle } from "@/services/subscription-lifecycle.service.js"

const INTERVAL_MS = 15 * 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null

export function startBillingScheduler() {
  if (timer) return

  timer = setInterval(() => {
    void runSubscriptionLifecycle().catch((err) => {
      console.error("[Billing scheduler]", err)
    })
  }, INTERVAL_MS)
  console.log("[Billing scheduler] started (every 15 min)")
}
