/**
 * Server bootstrap: runs the alarm sweep (Holy Hour group calls + event
 * reminders) every 30 seconds on hosts that keep a long-lived Node process
 * (next start, VPS). On serverless hosts (Vercel, Netlify) these intervals
 * only live while an instance is warm — use the /api/cron/alarms endpoint
 * with an external cron job there instead (vercel.json configures Vercel's).
 *
 * The Holy Hour sweep both spawns the system-created call room and rings
 * every member; event reminders are claimed per reminder row.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as unknown as {
    __dmAlarmInterval?: NodeJS.Timeout;
  };
  if (g.__dmAlarmInterval) return;

  const { runAlarmCheck } = await import("./lib/alarms");
  g.__dmAlarmInterval = setInterval(() => {
    runAlarmCheck().catch((err) => {
      console.error("[alarms] scheduled sweep failed:", err);
    });
  }, 30_000);
}
