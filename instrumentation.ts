/**
 * Server bootstrap: runs the alarm sweep (Holy Hour + event reminders) and the
 * meeting reminder sweep every 30 seconds on hosts that keep a long-lived Node
 * process (next start, VPS). On serverless hosts (Vercel, Netlify) these
 * intervals only live while an instance is warm — use the /api/cron/alarms and
 * /api/cron/meetings endpoints with an external cron job there instead.
 *
 * The two sweeps are independent: the Holy Hour alarm rings at fixed daily
 * times, while meeting reminders are claimed per meeting (notified flag) at
 * each meeting's own start time minus its reminder offset.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as unknown as {
    __dmAlarmInterval?: NodeJS.Timeout;
    __dmMeetingInterval?: NodeJS.Timeout;
  };
  if (g.__dmAlarmInterval || g.__dmMeetingInterval) return;

  const { runAlarmCheck } = await import("./lib/alarms");
  g.__dmAlarmInterval = setInterval(() => {
    runAlarmCheck().catch((err) => {
      console.error("[alarms] scheduled sweep failed:", err);
    });
  }, 30_000);

  const { runMeetingCheck } = await import("./lib/meeting-reminders");
  g.__dmMeetingInterval = setInterval(() => {
    runMeetingCheck().catch((err) => {
      console.error("[meetings] scheduled sweep failed:", err);
    });
  }, 30_000);
}
