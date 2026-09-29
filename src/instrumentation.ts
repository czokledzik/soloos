export function register() {
  // Day/week boundaries are computed in server-local time. Hosted servers run
  // on UTC (and Vercel doesn't allow setting TZ), so pin it here.
  process.env.TZ = process.env.APP_TIMEZONE || "Europe/Warsaw";
}
