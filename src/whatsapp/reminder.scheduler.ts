import { processPendingOutbox } from "@/services/whatsapp-messaging.service.js"
import { runAutomaticReminders } from "@/services/whatsapp-reminder.service.js"

const INTERVAL_MS = 3 * 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null

export function startWhatsappScheduler() {
  if (timer) return

  const tick = async () => {
    try {
      await processPendingOutbox(30)
      await runAutomaticReminders()
    } catch (err) {
      console.error("[WhatsApp scheduler]", err)
    }
  }

  void tick()
  timer = setInterval(() => void tick(), INTERVAL_MS)
  console.log("[WhatsApp scheduler] started (every 3 min)")
}
